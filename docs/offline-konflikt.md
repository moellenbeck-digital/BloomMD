# Offline-Bearbeitung und Konfliktregel A (#261)

Zwei Web-App-Clients bearbeiten dieselbe Markdown-Datei getrennt offline und verbinden sich danach
wieder. Es geht kein Bearbeitungsstand verloren; ein echter Inhaltskonflikt wird sichtbar und lässt
sich auflösen.

## Fall (Ausgangslage)

Der Test legt beide Dateien selbst an (über die App-API, Namen mit Kennung je Lauf, z. B.
`offline-alpha-<kennung>.md`):

- Ausgangsdatei: Wurzel „Offline Alpha <kennung>“ mit den Knoten „Alpha“, „Beta“, „Gamma“.
- Vergleichsdatei „Offline Vergleich <kennung>“: bleibt während des Laufs unverändert (Inhalt und Version
  werden vorher und nachher über die App-API verglichen).

Beide Clients (Browser-Kontexte A und B) melden sich mit demselben Konto an, haben aber getrennten
Browser-Speicher (eigene Offline-Warteschlange).

Ablauf:

- A benennt offline „Alpha“ in „Alpha-A“ um und legt „Delta“ an. B benennt offline „Alpha“ in
  „Alpha-B“ um. Danach gehen beide online.

Ergebnis: Beide sehen „Delta“. Bei „Alpha“ ist ein Konflikt sichtbar; eine Fassung steht im Knoten,
die andere als Geschwisterknoten „Konflikt: …“ mit Gerät und Zeit.

## Konfliktregel A

- Führend ist der Server-Raum mit seiner Markdown-Datei. Der Client ist eine Replik.
- Konflikt: derselbe Knoten (Titel oder Inhalt) wurde seit dem gemeinsamen Stand auf beiden Seiten
  geändert. Erkannt wird das beim Reconnect.
- Im Knoten gewinnt der zuletzt beim Server angekommene Stand; der andere bleibt als
  „Konflikt: …“-Kopie erhalten.
- Nicht überlappende Änderungen werden ohne Hinweis gemischt.
- Auflösung: der Benutzer übernimmt eine Fassung oder löscht die Kopie. Nichts wird still verworfen.

## Bausteine

| Teil | Ort |
| --- | --- |
| Regel A (Erkennung, Konfliktkopie) | `packages/core/src/offline-conflict.ts` |
| Server: Offline-Merge, Snapshot vor dem Mischen | `packages/sync/src/offline-merge.ts`, `snapshots.ts` |
| Client: lokale Warteschlange (IndexedDB), Reconnect | `packages/ui/src/sync/offline-queue.ts`, `SyncProvider.ts` |
| Konflikt-UI | `packages/ui/src/components/SyncStatus.tsx`, `useMindMapStore.ts` |

Der Reconnect läuft über den normalen Yjs-Sync (State-Vector-Abgleich) und ist idempotent:
erneute Zustellung erzeugt keine doppelten Knoten.

## Snapshots und Wiederherstellung

Vor dem Mischen legt der Server unter `<BLOOMMD_DIR>/.snapshots/<raum>/<id>/` ab: `server.md`
(Raum vor dem Mischen), `client.md` (mitgebrachter Stand) und `meta.json`. Verzeichnis
überschreibbar mit `SYNC_SNAPSHOT_DIR`.
`restoreSnapshot()` (`packages/sync/src/snapshots.ts`) schreibt beide Fassungen als
„<Name> (Snapshot <id> Server).md“ / „… Client).md“ neben die Datei und überschreibt nichts.

## Testbefehle

```bash
# Unit-/Integrationstests (gezielt)
bun test packages/core/src/offline-conflict.test.ts
bun test packages/sync/src/offline-merge.test.ts
bun test packages/ui/src/sync/offline-queue.test.ts packages/ui/src/hooks/useMindMapStore.offline.test.ts

# E2E @t261, lokal (eigener Sync-Server und Arbeitsordner, zwei Browser-Kontexte, Offline über Playwright)
bun run --cwd apps/app test:e2e:offline

# E2E @t261 gegen ein laufendes System (Testsystem/Dev); startet nichts, nutzt nur UI und App-API
cd apps/app
PLAYWRIGHT_BASE_URL=<URL des Systems> bunx playwright test -c playwright.testsystem.config.ts --grep @t261
bunx playwright test -c playwright.testsystem.config.ts --grep @t261 --list   # muss > 0 Tests melden
```

Dieselbe Spec läuft in beiden Modi. Unterschiede: Lokal werden die Snapshots des Sync-Servers aus dem
Arbeitsordner gelesen. Am Testsystem sind Platte und Snapshots des Sync-Servers nicht erreichbar; dort
zeigen Inhalt, Vergleichsdatei, Markdown-Export (UI) und Wiederherstellung über die App-API
(`GET`/`POST /api/mindmaps/<datei>/history`, Versionsverlauf): Der Test stellt nach dem Lauf alle gespeicherten
Versionen nacheinander wieder her und erwartet darunter den Stand des Servers vor Bs Änderungen (A-Fassung
ohne Kopie) und den Stand mit Bs Fassung im Knoten und A als „Konflikt: …“-Kopie.

## Reset-Verfahren (#346)

Der Test räumt seine Testdaten selbst ab, in beiden Modi.

**Am Testsystem/Dev:** Der Test legt ein Konto `offline-<kennung>@bloommd.local` und beide Dateien an. Am Ende
löscht er die Dateien (`DELETE /api/mindmaps/<datei>`) und das Konto (`POST /api/account/delete`). Läuft das System
im Testmodus mit Sitzungs-Bypass, kann das Konto dort nicht gelöscht werden; der Lauf vermerkt dann die Kennung als
Hinweis „cleanup“ im Bericht. Ein Rest wird wie folgt entfernt: Konto per UI (Konto → „Konto löschen“, E-Mail und
Passwort `Testpass12345`) löschen oder, falls die Dateien stehen blieben, über die Dateiliste löschen. Das Probe-Konto
des Testers wird dabei nicht angefasst. Ein Neustart des Sync-Servers ist nicht nötig; Snapshots bleiben dort liegen
(Platte des Sync-Servers, `SYNC_SNAPSHOT_DIR`).

**Lokal (`test:e2e:offline`):** Der Lauf setzt sich selbst zurück (`apps/app/playwright-offline-setup.ts` löscht den
Arbeitsordner samt `.snapshots`; die Ausgangsdateien legt der Test per API neu an). Manuell:

1. Testraum und Snapshots löschen: `rm -rf .qa/playwright-offline-workspace` (enthält `.snapshots`).
2. Nichts kopieren: Ausgangs- und Vergleichsdatei erzeugt der Test.
3. Browser-Speicher der Clients leeren (IndexedDB-Warteschlange), sonst werden alte Offline-Änderungen
   erneut zugestellt. Die Testkontexte starten leer; nur bei manueller Prüfung im eigenen Browser nötig.
