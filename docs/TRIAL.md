# Testaccount: 30 Tage (Bestand 60 Tage), Hinweis-Mails, Sperre nach Ablauf (#274, #364, #378)

Der kostenlose Testaccount gilt 30 Tage ab E-Mail-Bestätigung; Bestandskonten bekommen 60 Tage (Ende 14.01.2027, #364). Die Texte dazu stehen in den
Datenschutzerklärungen (`apps/app` und `apps/marketing`, je `datenschutz/page.tsx`) und in den AGB. Fristen und Konto-Löschung: `docs/LOESCHKONZEPT.md`.

## Regeln

| Konto | Testende | Hinweis-Mails |
| --- | --- | --- |
| Neu (nach Migration `013` angelegt) | Bestätigung + 30 Tage, einmal gesetzt (`trial_ends_at`) | nach 15 und nach 23 Tagen |
| Bestand (alle Konten bei der Migration, auch frühere Wartelisten-Konten; `trial_legacy`) | fest 14.01.2027 00:00 UTC (Zählung ab 15.11.2026, 60 Tage; Migration `015`, vorher 15.12.2026) | 30.12.2026 und 07.01.2027 (Tag 45 und 53, vom Ende rückwärts: 15 und 7 Tage vorher), nur mit eigenem Schalter |

- Alle Zeiten in UTC; die Berechnung ist rein in `apps/app/src/lib/trial.ts` (getestet, Grenzen Tag 14/15, 22/23, 29/30; Bestand 44/45, 52/53, 59/60). Das Testende der Bestandskonten steht im Code nur in `LEGACY_TRIAL_ENDS_AT`; die Migration `015` und die Rechtstexte werden dagegen geprüft.
- Jede Hinweis-Mail geht höchstens einmal raus (Tabelle `bloom_trial_reminders`: erst beanspruchen, dann senden; ein fehlgeschlagener Versand gibt den Anspruch frei). Ein verspäteter Lauf sendet nur den letzten fälligen Hinweis, nie nach Testende.
- Kein Versand an unbestätigte Konten. Gelöschte Konten verlieren ihre Einträge per Cascade.
- Die Mails zählen gegen das globale Mailbudget (`AccountMailKind` `trial-reminder`); ist es aufgebraucht, hält der Lauf an, der nächste macht weiter.
- Ein Anspruch ohne `sent_at` (Lauf mitten im Senden gestorben) wird nicht wiederholt. Er zeigt sich im Dry-Run nicht; Ops sieht ihn mit `select * from bloom_trial_reminders where sent_at is null`.

## Schalter

| Variable | Standard | Wirkung |
| --- | --- | --- |
| `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` | aus | Der Job versendet auch die Hinweise an Bestandskonten. Ohne ihn zeigt der Dry-Run sie als `heldBackExisting`. Nur nach Admin-Go. |
| `BLOOMMD_TRIAL_READONLY=1` | aus | Konten mit abgelaufenem Testende sind nur lesbar (siehe unten). Nur nach Admin-Go und Absprache mit Ops. |

Neue Konten brauchen keinen eigenen Schalter. Beide Werte müssen genau `1` oder `0` sein, `release:check` lehnt anderes ab und meldet `BLOOMMD_TRIAL_READONLY=1` als Warnung.

## Der Job

```bash
bun run --cwd apps/app db:trial-reminders                       # Dry-Run (Standard): zählt, schreibt und sendet nichts
bun run --cwd apps/app db:trial-reminders --apply               # beansprucht und sendet
bun run --cwd apps/app db:trial-reminders --apply --limit 30    # höchstens 30 Mails (Budget für Anmeldungen frei lassen)
bun run --cwd apps/app db:trial-reminders --jetzt 2026-12-05T10:00:00Z   # Uhr dieses Laufs überschreiben (Tests)
```

Ausgabe: eine JSON-Zeile mit Zahlen (`due`, `dueByKind`, `heldBackExisting`, `mailSent`, `mailFailed`, `deferred`, `notClaimed`), keine Adressen. Exit 1 bei Fehlversand oder Abbruch durch das Budget. Er läuft nicht in `db:maintenance`; Ops plant ihn nach dem Admin-Go (täglich genügt).

`--jetzt` ändert nur die Uhr des Laufs. Auf einem Testsystem gehen Mails in das E2E-Outbox (`BLOOMMD_E2E_TEST_MODE=1`, `BLOOMMD_E2E_MAIL_OUTBOX=<Datei>`) oder an `delivered@resend.dev`. Nie mit `--apply` gegen die Produktionsdatenbank: ein zu einer erfundenen Zeit gesetzter Anspruch bleibt bestehen.

## Sperre nach Ablauf (`BLOOMMD_TRIAL_READONLY=1`)

- Eine zentrale Prüfung in `apps/app/src/proxy.ts` (`lib/trial-guard.ts`): jede schreibende Anfrage (alles außer GET/HEAD/OPTIONS) an `/api/…` eines Kontos, dessen `trial_ends_at` erreicht ist, wird mit 403, `code: "TRIAL_EXPIRED"` und einer Meldung auf Deutsch oder Englisch abgelehnt (`?lang=en` oder `Accept-Language`). Das gilt für Sitzung und Zugriffstoken. Neue Schreib-Routen sind ohne Zutun erfasst.
- Ausgenommen (`lib/trial-readonly.ts`): Anmeldung/Abmeldung (`/api/auth/`, `/api/mobile/`), Billing, interne Routen, Feedback, Konto löschen, Workspace verlassen, Zugriffstoken widerrufen, Link-Vorschau, Health/Config/Version.
- Der Sync-Ticket (`/api/sync-ticket`) wird nicht abgelehnt, sondern mit Berechtigung `read` ausgestellt: Dokumente lassen sich öffnen, nicht ändern. Eine schon offene Bearbeitungssitzung endet erst mit dem Ablauf ihres Tickets beim nächsten Verbindungsaufbau.
- Lesen und der Export (`GET /api/account/export`) bleiben. Es wird nichts gelöscht.
- Sichtbar: Hinweis in der App (unten eingeblendet) und auf `/account`. Auf `/account` steht außerdem „Testzeitraum bis TT.MM.JJJJ“, solange das Testende in der Zukunft liegt.
- Ohne Datenbank (Dateimodus, E2E-Bypass) gibt es kein Testende und keine Sperre.
- **Ausnahme: Konten mit aktivem Tarif (#378).** Sie bleiben nach Testende schreibbar, auch bei `BLOOMMD_TRIAL_READONLY=1`; Konten ohne Tarif bleiben wie oben nur lesbar. Das ist die Voraussetzung für das Billing (Entscheid #276, Tarif Cloud über Stripe).
  - **Aktiver Tarif** = das Konto hat in `bloom_entitlements` mindestens eine Zeile mit `active = true` und (`expires_at` leer oder in der Zukunft; genau jetzt zählt als abgelaufen). Die Tabelle schreibt `recordStripeSubscription` (`apps/app/src/lib/db.ts`); die Prüfung ist `hasActiveEntitlement(userId, now)`. Ein bestimmter Tarifname wird nicht geprüft: jeder aktive Eintrag genügt, der Tarif „Cloud“ braucht also keine weitere Änderung.
  - **Kündigung:** ein zum Periodenende gekündigtes Abo bleibt aktiv, bis `expires_at` (Periodenende) erreicht ist; danach ist das Konto wieder nur lesbar. Eine sofortige Kündigung (`canceled`) und **Zahlungsausfall** (`past_due` und andere Status außer `active`, `trialing`, `complete`, `paid`) setzen `active = false`: das Konto ist ab dem nächsten Schreibversuch wieder nur lesbar. Nichts wird gelöscht; zahlt das Konto wieder, ist es sofort wieder schreibbar.
  - **Eine Regel an einer Stelle:** `isTrialWriteLocked` in `apps/app/src/lib/trial-lock.ts` prüft erst das Testende und fragt den Tarif nur bei abgelaufenen Konten ab. Proxy-Guard, Sync-Ticket (Berechtigung `write` statt `read`) und der Hinweis in der App und auf `/account` nutzen sie gemeinsam; es gibt keine zweite Regel. Konten mit aktivem Tarif sehen den Sperr-Hinweis nicht.
  - **Fehlerverhalten unverändert:** schlägt die Abfrage fehl (Datenbank), blockiert der Guard nicht; die Route dahinter braucht die Datenbank ebenfalls und scheitert dort.

## Rollout-Reihenfolge

1. Migration `013` anwenden: `bun run --cwd apps/app db:migrate` (ohne sie scheitert die Prod-App am Schema-Check). Sie ist idempotent und löscht nichts. Der Befehl wendet auch `015` an (siehe Schritt 2).
2. Migration `015` (`db/015_trial_legacy_60_days.sql`) vor dem Admin-Go anwenden (ebenfalls über `db:migrate`): sie setzt nur Bestandskonten, deren `trial_ends_at` noch 2026-12-15 ist, auf 2027-01-14 00:00 UTC. Von Hand geänderte Werte bleiben unberührt, nichts wird gelöscht, nichts wird versendet. Idempotent.
3. App ausrollen (beide Schalter aus). Neue Konten bekommen ab da Testende und Sprache.
4. Admin-Go einholen. Dann plant Ops den Job (zuerst Dry-Run prüfen, `heldBackExisting` und `dueByKind` ansehen), für Bestandskonten zusätzlich `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` setzen. Das globale Mailbudget (60/Stunde, 300/Tag) vorher gegen die Zahl der Bestandskonten rechnen.
5. `BLOOMMD_TRIAL_READONLY=1` erst nach Admin-Go und Absprache mit Ops, frühestens zum Testende. Zahlende Konten sind ausgenommen (siehe „Sperre nach Ablauf“, #378): vor dem Einschalten sicherstellen, dass das Billing deren `bloom_entitlements`-Zeilen schreibt, sonst gelten sie als Konten ohne Tarif.

## Für den Oberflächentest

Testsystem mit E2E-Outbox, Schalter nach Bedarf. Neues Konto registrieren und bestätigen, `/account` zeigt „Testzeitraum bis“ = Bestätigungstag + 30 Tage. Den Job mit `--jetzt` auf Bestätigung + 14, 15, 22, 23, 30 Tage laufen lassen (`--apply`): bei +15 und +23 je genau eine Mail im Outbox, bei +14/+22/+30 keine, ein zweiter Lauf zur selben Zeit keine. Bestandskonto (`trial_legacy`, Testende 2027-01-14 00:00 UTC; nur Testsystem, `BLOOMMD_TRIAL_REMINDERS_EXISTING=1`): `/account` zeigt „Testzeitraum bis 14.01.2027“; `--jetzt 2026-12-29T23:59:59Z` keine Mail, `2026-12-30T00:00:00Z` genau eine (Hinweis „noch 15 Tage“), `2027-01-06T23:59:59Z` keine weitere, `2027-01-07T00:00:00Z` genau eine („noch 7 Tage“), ab `2027-01-14T00:00:00Z` keine. Zum Prüfen der Sperre `trial_ends_at` des Testkontos auf die Vergangenheit setzen und `BLOOMMD_TRIAL_READONLY=1` auf dem Dev-System setzen.

Sperre mit und ohne Tarif (#378, Marke `@t378`), `BLOOMMD_TRIAL_READONLY=1`, zwei bestätigte Konten mit `trial_ends_at` in der Vergangenheit:

1. **Ohne Tarif:** Schreiben (z. B. `POST /api/workspaces` oder Speichern in der App) wird mit 403 und `code: "TRIAL_EXPIRED"` abgelehnt; `/account` und die App zeigen den Hinweis „Testzeitraum abgelaufen“; Lesen und `GET /api/account/export` gehen.
2. **Mit Tarif:** `insert into bloom_entitlements (user_id, feature, source, active, expires_at) values (<id>, 'cloud', 'test', true, null)` (oder `expires_at` in der Zukunft): Schreiben geht (201/200), `/account` und die App zeigen keinen Hinweis.
3. **Grenzen:** `active = false`, `expires_at` in der Vergangenheit oder genau jetzt → wieder gesperrt; `expires_at` leer → schreibbar.

Automatisiert: `bun run --cwd apps/app test:e2e:trial-readonly` (eigener Server, Postgres; Spec `e2e/trial-readonly-t378.spec.ts`, nicht Teil des CI-Jobs `full-e2e`) und `tests/integration/trial-lock-entitlement-db.integration.test.ts`.
