# Konto-Quote 100 MB und Kostenobergrenze (#380, aus #276)

Jedes Cloud-Konto hat eine Speicher-Quote von **100 MB**. Grundlage ist Option A aus #276 (Cloud 6 EUR/Monat, 60 EUR/Jahr, Stripe; siehe `docs/BILLING.md`).
Die Quote wird serverseitig erzwungen, die Oberfläche zeigt den Verbrauch, und Ops hat einen Bericht über die Fixkosten-Treiber je Konto.
**Es greift nichts, solange `BLOOMMD_ACCOUNT_QUOTA` nicht `1` ist** (Standard: aus; nur nach Admin-Go und Absprache mit Ops, wie `BLOOMMD_TRIAL_READONLY`, siehe `docs/TRIAL.md`).

## Was zählt

- **Verbrauch** = Summe der UTF-8-Bytes von `bloom_documents.markdown` aller nicht gelöschten Dokumente (`deleted_at is null`) in allen Workspaces, die dem Konto **gehören** (`bloom_workspaces.owner_user_id`; persönlicher Workspace und eigene Team-Workspaces). Wer in einem fremden Team-Workspace schreibt, belastet dessen Eigentümer, nicht sich selbst.
- **Nicht gezählt:** Revisionen (`bloom_document_revisions`, höchstens 20 je Dokument), die Spalte `frontmatter` (eigene jsonb-Spalte), Anhänge, Feedback, Views, Share-Links.
- **Grenze** = `ACCOUNT_QUOTA_BYTES` = 100 × 1024 × 1024 = 104 857 600 Bytes, eine Konstante in `packages/core/src/account-quota.ts` (mit Test). Eine Anzeige wie „37,2 MB“ meint ebenfalls 1024 × 1024 Bytes.
- Die Berechnung ist rein und liegt in `packages/core/src/account-quota.ts` (vom Sync-Server und der App gemeinsam genutzt; der Sync-Server kann nichts aus `apps/app` importieren), die App-Seite in `apps/app/src/lib/account-quota.ts`.

## Regel beim Schreiben

Wenn die Erzwingung an ist (`BLOOMMD_ACCOUNT_QUOTA=1`):

- Ein Schreiben, das den Verbrauch des Kontos **erhöht** und es **über 100 MB** bringen würde, wird abgelehnt. Wer bereits bei oder über der Grenze ist, darf also nichts mehr vergrößern. Ein Schreiben, das ihn **senkt oder gleich lässt** (Kürzen, Löschen, Umbenennen), geht immer. Lesen, Export (`GET /api/account/export`) und Löschen gehen immer.
- **Nichts wird je automatisch gelöscht.** **Bestandskonten über 100 MB** können lesen, exportieren, löschen und verkleinern; es gibt keine Zugriffssperre, keine Löschung und keine Migration, die Daten verändert.
- Die Grenze ist weich um höchstens eine Speicherung: zwei gleichzeitige Speicherungen verschiedener Dokumente desselben Kontos können die Grenze um deren Größe überschreiten; die nächste vergrößernde Speicherung wird abgelehnt. Eine Sperre je Konto wäre ein Zeilen-Lock auf jedem Schreibvorgang, das lohnt für diese Obergrenze nicht.
- Kosten der Prüfung: ohne Schalter keine zusätzliche Abfrage. Mit Schalter eine einfache Abfrage der alten Größe des Dokuments; nur bei einem **wachsenden** Schreiben zusätzlich die Aggregatabfrage über die Dokumente des Eigentümers (Index `bloom_documents_workspace_updated_idx` je Workspace, neuer Index `bloom_workspaces_owner_idx` für die Workspaces eines Kontos, Migration `017`; `ensureMarketSchema` legt ihn ebenfalls an). Kein Volltabellen-Scan.

## Schreibwege (geprüfte Liste)

Alle Laufzeit-Schreibwege auf `bloom_documents.markdown` laufen über den Sync-Server (Kommando-API und Live-Sitzung) und damit über `packages/sync/src/persistence.ts`:

| Schreibweg | Wo geprüft |
| --- | --- |
| Live-Bearbeitung (Yjs/WebSocket, Debounce-Speicherung) | `persistence.save` |
| Dokument speichern: `PUT /api/mindmaps/<name>` → `/internal/documents/<id>/snapshot` | `persistence.save` |
| Dokument anlegen: `POST /api/mindmaps` → `/internal/documents` | `persistence.create` |
| Version wiederherstellen (`…/history`), Agent-Vorschlag übernehmen, Agent-Rückgängig, Knoten-API (`…/nodes`, `…/node-content`) | alle über `save` des Sync-Servers |
| Import, Wiki, Agent-Token-API | ebenfalls über `PUT`/`POST /api/mindmaps` bzw. die Knoten-API, also derselbe Weg |
| `writeCloudDocument` (`apps/app/src/lib/db.ts`) | nur Verifikations-Helfer (`scripts/verify-database.ts`, Integrationstests), nicht im Laufzeitpfad; prüft trotzdem mit dem Schalter |
| Umbenennen, Löschen (`rename`, `delete`) | nicht geprüft: sie erhöhen den Verbrauch nie |

Nicht abgedeckt sind Skripte mit direktem SQL (`restore-drill-marker.ts`, `packages/sync/scripts/load-test.ts`); sie sind Betriebswerkzeuge, kein Produktpfad.

## Fehlerbild

- **API:** `413` mit `code: "QUOTA_EXCEEDED"`, `usedBytes`, `limitBytes` und einer Meldung auf Deutsch oder Englisch (`?lang=en` oder `Accept-Language`, wie `trialExpiredMessage`), die Verbrauch und Grenze nennt und sagt, dass Lesen, Export und Löschen weiter gehen. Gebaut in `quotaExceededResponse`; die Routen geben den Fehler des Sync-Servers (`isQuotaMutationError`) so weiter. 413 statt 403, weil das Konto schreiben darf (403 `TRIAL_EXPIRED` heißt: nicht mehr schreiben dürfen); diese Änderung ist nur zu groß für den Rest.
- **Sync-Sitzung (WebSocket):** Die Live-Sitzung kennt keinen HTTP-Status. Lehnt die Speicherung die Quote ab, schließt der Server alle Clients des Raums mit dem Close-Code **4013** (`QUOTA_EXCEEDED`) und verwirft den Raum; der ungespeicherte Stand bleibt in den Clients erhalten. Der Client (`SyncProvider`) macht daraus den Fehler `quota-exceeded` (Status „Speicherplatz erreicht – Änderung nicht gespeichert“, Hinweis mit dem Satz oben); er verbindet nicht endlos neu. „Neu verbinden“ lädt den gespeicherten Stand und versucht es erneut: nach dem Kürzen unter die Grenze geht es durch. Das ist das Muster der Lesesperre (#274/#378: `sync-ticket` stellt `read` aus, die Nachrichten werden ignoriert) in einer Variante, die das Verkleinern zulässt: eine Lesesperre am Ticket ginge nicht, weil sie auch das Kürzen verbieten würde. Anders als dort wird nichts still verworfen: der Client bekommt Code und Meldung.
- Der Sync-Server zählt `sync_persistence_quota_rejections_total` (getrennt von `sync_persistence_errors_total`); der Raum bleibt nicht „degraded“, weil nichts zu reparieren ist.

## Oberfläche

- `/account` zeigt, sobald die Erzwingung an ist, „Speicher: 37,2 MB von 100 MB“ mit Balken; ab 80 % einen Warnhinweis (gelb), bei Erreichen einen deutlichen Hinweis (rot). Ohne Schalter erscheint der Block nicht, damit keine Grenze angezeigt wird, die nichts bewirkt.
- `GET /api/account/quota` (angemeldet): `{ enforced, usedBytes, limitBytes, percent, level }` mit `level` `ok`, `warning` (ab 80 %) oder `reached`; liefert den Verbrauch auch bei ausgeschalteter Erzwingung.
- Beim Speichern ohne Live-Verbindung erscheint die Meldung des Servers als Hinweis in der App; bei der Live-Sitzung der Hinweis zu 4013. Texte: `packages/ui/src/i18n/translations.ts` (`syncFailureQuotaExceeded`), `apps/app/src/app/app/page.tsx` (`quotaReached`), `apps/app/src/lib/account-quota.ts` (Konto-Seite, API-Meldung de/en).

## Kostenobergrenze / Monitoring für Ops

```bash
bun run --cwd apps/app db:quota-report           # Standard: nur lesen (schreibt und sendet nichts)
bun run --cwd apps/app db:quota-report --alle    # auch Konten unter 80 % einzeln aufführen
```

Ausgabe: **eine JSON-Zeile**, keine Adressen, keine Preise, keine Stripe-Anbindung:

```json
{"dryRun":true,"enforced":false,"limitBytes":104857600,"accounts":120,"totalBytes":9437184,"over80":2,"over100":1,"perAccount":[{"accountId":"<uuid>","usedBytes":120000000,"percent":114}]}
```

`accounts` = alle Konten (auch ohne Dokumente), `totalBytes` = Summe aller Konten, `over80` = Konten ab 80 % der Grenze (enthält `over100`), `over100` = Konten bei oder über der Grenze, `perAccount` = Konten ab 80 % (mit `--alle` alle), größte zuerst. Der Bericht schreibt nichts, daher gibt es kein `--apply`. Er läuft nicht in `db:maintenance`; Ops plant ihn nach Bedarf. Die Obergrenze der Fixkosten ist damit: Konten × 100 MB als harte Grenze pro Konto (bei eingeschalteter Erzwingung), `totalBytes` als Ist.

## Einschalten (nach Admin-Go)

1. Vorher `db:quota-report` laufen lassen: wie viele Konten wären bei 100 MB betroffen (`over100`)? Bestandskonten über der Grenze behalten alles, dürfen aber nichts vergrößern.
2. Migration einspielen (`bun run --cwd apps/app db:migrate`, enthält `017`).
3. `BLOOMMD_ACCOUNT_QUOTA=1` **sowohl an der Web-App als auch am Sync-Server** setzen (gleicher Wert); `release:check` lehnt andere Werte als `0`/`1` ab und meldet `1` als Warnung. Nur an der App würde die Live-Bearbeitung nicht erzwungen, nur am Sync-Server wäre die Konto-Seite ohne Anzeige.
4. Zurücknehmen: Variable entfernen oder `0`; es ist nichts gelöscht oder umgeschrieben worden.

## Tests

- Unit: `packages/core/src/account-quota.test.ts` (Konstante, Entscheidung an den Grenzen, UTF-8-Bytes, Texte de/en), `apps/app/src/lib/account-quota.test.ts` (Status, Konto-Block, 413-Antwort, Bericht), `packages/sync/src/{persistence,rooms,server}.test.ts` (Erzwingung, Close-Code, 413), `packages/ui/src/sync/SyncProvider.test.ts` (4013).
- Integration (Postgres, `BLOOMMD_TEST_DATABASE_URL`): `tests/integration/account-quota-db.integration.test.ts` (Verbrauchsabfrage, Auflistung, Erzwingung in Sync-Persistenz und `writeCloudDocument` mit kleiner Grenze).
