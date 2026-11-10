# E2E-Tests (Playwright)

## Gegen das Testsystem

`playwright.testsystem.config.ts` testet ein bereits laufendes System (z. B. `bloommd-test`). Sie startet
keinen Server (`webServer`) und kein `globalSetup`; nur das Projekt `chromium` (Desktop Chrome) läuft.
Das Testsystem muss im Testmodus laufen: `BLOOMMD_REQUIRE_AUTH=1`, `BLOOMMD_E2E_AUTH_BYPASS=1`,
`BLOOMMD_E2E_TEST_MODE=1`, `BLOOMMD_LOCAL_DEPLOYMENT=1` (seit #169; ohne die dritte Variable ist der Bypass im
Produktionsbuild aus).

```bash
cd apps/app
PLAYWRIGHT_BASE_URL=http://app.bloommd-test.svc.cluster.local:3000 bunx playwright test -c playwright.testsystem.config.ts --grep @t<nr>
# oder: PLAYWRIGHT_BASE_URL=… bun run test:e2e:testsystem --grep @t<nr>
```

Umgebungsvariablen:

- `PLAYWRIGHT_BASE_URL` — **Pflicht**. Fehlt sie oder ist sie leer bzw. keine URL, bricht das Laden der Config sofort mit einer Meldung ab.
- `PLAYWRIGHT_ARTIFACTS_DIR` — optional, Standard `./test-results-testsystem`. Darin liegen `results/` (Artefakte) und `report/` (HTML-Bericht).

Ausgeschlossen sind (Projekt `chromium`):

| Spec | Grund |
| --- | --- |
| `wiki.spec.ts` | braucht einen eigenen Server (`playwright.wiki.config.ts`) |
| `beta-gate.spec.ts` | braucht eigene Server-Umgebung (`playwright.beta.config.ts`) |
| `open-signup.spec.ts` | braucht eigene Server-Umgebung (`playwright.open-signup.config.ts`) |
| `collaboration.spec.ts` | braucht eigene Server-Umgebung (`playwright.collaboration.config.ts`) |
| `visual-regression.spec.ts` | eigene Config und Snapshots (`playwright.visual.config.ts`) |
| `plausible-tracking-local.spec.ts` | startet Gegenstelle und App selbst, braucht den Produktions-Build (`playwright.plausible.config.ts`, `bun run test:e2e:plausible`, CI-Schritt „Run Plausible tracking end-to-end tests“) |
| `mobile-smoke.spec.ts`, `mobile-matrix.spec.ts` | Mobile-Projekt (`chromium-mobile`, Pixel 5); die Testsystem-Config hat nur Desktop Chrome. Die Matrix und ihre manuelle Liste: `docs/MOBILE-MATRIX.md` |

`theme-matrix.spec.ts` bleibt drin: Die Standard-Config führt es auch im Projekt `chromium` aus (nicht nur im Mobile-Projekt), hier läuft es entsprechend nur in Desktop Chrome.

Die beiden Mobile-Specs laufen mit der Testsystem-Config nicht (sie hat nur Desktop Chrome). Gegen ein laufendes
System starten sie mit der Standard-Config und dem Projekt `chromium-mobile`, solange `CI` nicht gesetzt ist (dann
nutzt Playwright den erreichbaren Server unter `PLAYWRIGHT_BASE_URL` statt einen eigenen zu starten):

```bash
cd apps/app
PLAYWRIGHT_BASE_URL=http://app.bloommd-test.svc.cluster.local:3000 bunx playwright test --project=chromium-mobile --grep @t66
```

`--grep @t66` wählt die Matrix; für `mobile-smoke.spec.ts` stattdessen den Dateinamen angeben.

Die CI führt davon bisher nur `mobile-smoke.spec.ts` aus (`.github/workflows/ci.yml`).

## Tests einem Ticket zuordnen

Neue Specs für ein Ticket tragen `@t<nr>` im Testtitel, z. B. `test("Einladung bleibt sichtbar @t147", …)`.
Ausgewählt wird nur auf der Kommandozeile mit `--grep @t<nr>`; die Config setzt kein `grep`.

## Missbrauchsfälle: Link-Vorschau und Agent-Berechtigungen (#210)

Zwei Sicherheitsgrenzen haben ausdrückliche Abdeckung. Was im Playwright-Stack nicht geht, liegt in Bun-Tests, die die
echten Routen aufrufen; nichts davon braucht Internet oder fremde Dienste, und Produktivcode wurde nicht geändert.
Die Testtitel tragen `@t210` und eine K-Nummer.

| K | Fall | Wo | Läuft in der CI |
| --- | --- | --- | --- |
| K1, K2, K5 | private/reservierte IPv4/IPv6, ungültige/bösartige URLs, Form jeder Ablehnung | `e2e/link-preview-abuse-t210.spec.ts` (Playwright) und `src/app/api/link-preview/route.abuse-t210.test.ts` (Bun) | `full-e2e` (Spec-Liste in `ci.yml`), `verify` (`bun run test`) |
| K3 | Übermaß: 429 mit `Retry-After`, danach kein ausgehender Abruf | **nur** Bun-Test `route.abuse-t210.test.ts` | `verify` |
| K4 | Weiterleitung auf interne Adresse, DNS-Rebinding, gemischte Antwort | **nur** Bun-Test `route.abuse-t210.test.ts` (im Spec als `test.fixme` mit Begründung) | `verify` |
| K6–K9 | Scope `read`, `propose`, Bereichs- vor Gesamtrecht, fremder Workspace, unbekannter/widerrufener/abgelaufener Token | `tests/integration/agent-permissions-abuse-t210-db.integration.test.ts` (Bun, echtes Postgres, echter Sync-Server) | `verify` (Postgres-Dienst; Schritt „DB tests ran without skips“ lässt keine Überspringung zu) |

Warum nicht alles in Playwright:

- **Das Rate-Limit (K3) ist im Playwright-Stack aus.** Der Stack läuft mit `BLOOMMD_E2E_AUTH_BYPASS=1`, und der Bypass
  schaltet `assertRateLimit` ab (`src/lib/request-security.ts`). Ein 429 ist dort nicht erreichbar; der Bun-Test ruft den
  echten Handler mit dem echten Zähler (im Speicher) auf und zählt die ausgehenden Verbindungen über
  `setLinkPreviewTransportForTests`.
- **Weiterleitung/DNS-Rebinding (K4)** braucht eine kontrollierte Gegenstelle oder einen Resolver. Localhost ist per Design
  gesperrt, example.com/httpbin.org sind in der CI tabu, und ein Testmodus-Hook im Produktivcode ist nicht erwünscht.
- **Agent-Berechtigungen (K6–K9)** brauchen Access-Tokens, und die liegen in Postgres. Der Playwright-Stack hat keine
  Datenbank (und der Playwright-Job der CI auch nicht); der Docker-Stack `bun run test:e2e:agent` deckt Kopplung, Pairing und
  Widerruf mit echtem OpenClaw ab, nicht die Rechte-Matrix je Route. Die DB-Tests laufen im Job `verify`, der Postgres hat.
  Lokal laufen sie nur mit `BLOOMMD_TEST_DATABASE_URL` (Wegwerf-Datenbank).

Befund: Ein Token mit Scope `read` wird bei einer ändernden Methode mit **401** abgewiesen (nicht 403): `accessTokenAllows`
macht ihn für die Anfrage zur Nicht-Identität (`src/lib/auth.ts`). Geschützt ist es, die Statuscodes sind nur anders als in
der Anforderung vermutet; K6 prüft 401 und dass nichts gespeichert wird.

Befund (Folge-Ticket-Kandidat, kein Produktfix in #210): `PUT /api/mindmaps/:datei` mit einem Workspace, auf den der Token
keinen Zugriff hat, antwortet **500** „Mindmap could not be saved.“ statt 404. Die Workspace-Auflösung (`getMindmapStorage`) steht im
`try` der Route, und dessen `catch` bildet „Workspace not found or access denied.“ nicht ab (`GET` und `POST /api/mindmaps` nutzen
`workspaceErrorResponse` und antworten 404). Geschützt ist es (nichts wird geschrieben, kein Vorschlag); K8 prüft deshalb „abgelehnt
(Status >= 400) und nichts geschrieben“ und pinnt den Status nicht.

## Obsidian-Plugin (echtes Obsidian)

`obsidian-navigator-t57.spec.ts` (`@t57`) testet das Obsidian-Plugin, nicht die Web-App: Der Spec startet ein echtes
Obsidian (Electron) mit eigenem Profil, kopiert den Test-Vault `obsidian-test-vaults/BloomMD Plugin Test Vault` samt
gebautem Plugin in ein Temp-Verzeichnis und steuert es per Playwright über CDP (Vorlage: `scripts/qa/obsidian-ink-smoke.ts`).
`PLAYWRIGHT_BASE_URL` wird nicht benutzt (die Config verlangt sie trotzdem). Ohne `OBSIDIAN_BIN` ist der Spec übersprungen.

```bash
bun run --cwd plugins/obsidian build                  # main.js, shared-runtime.js, styles.css
# Linux ohne Bildschirm: virtuelles Display (Xvfb)
Xvfb :97 -screen 0 1600x1000x24 &
cd apps/app
DISPLAY=:97 OBSIDIAN_BIN=/pfad/zu/obsidian PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  bunx playwright test -c playwright.testsystem.config.ts e2e/obsidian-navigator-t57.spec.ts --grep @t57
```

- `OBSIDIAN_BIN`: Linux das entpackte `obsidian-<version>.tar.gz` (Datei `obsidian`), macOS `…/Obsidian.app/Contents/MacOS/Obsidian`.
  Der Spec startet mit `--no-sandbox --disable-gpu` (Container ohne SUID-Sandbox). Auf Linux braucht Electron u. a. `libgtk-3`.
- Obsidian öffnet nach dem Vertrauensdialog ein eigenes Einstellungsfenster; der Spec schließt es, sonst erscheinen
  Hinweise (`Notice`) in diesem Fenster statt im Hauptfenster.
- Anfragen des Obsidian-Hauptprozesses (Update-Prüfung) sind für den Spec nicht sichtbar, nur die des Renderers.

## Specs mit Mock-API

Diese Specs ersetzen eine API per `page.route` durch eine feste Antwort, weil das Dev-System die Testdaten nicht hat. Sie laufen mit jeder Config (auch `playwright.config.ts` und der Testsystem-Config).

| Spec | Marke | Was der Mock ersetzt, was offen bleibt |
| --- | --- | --- |
| `wiki-sources-t87.spec.ts` | `@t87` | `GET /api/wiki` mit Quellenstatus `ok`/`changed`/`missing`/`unmonitored`; prüft nur die Darstellung (K1–K5). K4 (Englisch) ist `test.fixme`: `/wiki` hat keinen `LocaleProvider`. Das echte Erkennen geänderter oder gelöschter Quelldateien im Pod ist nicht geprüft (`route.test.ts`, `wiki-sources.test.ts`, `watch.test.ts`) |
