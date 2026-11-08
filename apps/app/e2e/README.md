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

## Specs mit Mock-API

Diese Specs ersetzen eine API per `page.route` durch eine feste Antwort, weil das Dev-System die Testdaten nicht hat. Sie laufen mit jeder Config (auch `playwright.config.ts` und der Testsystem-Config).

| Spec | Marke | Was der Mock ersetzt, was offen bleibt |
| --- | --- | --- |
| `wiki-sources-t87.spec.ts` | `@t87` | `GET /api/wiki` mit Quellenstatus `ok`/`changed`/`missing`/`unmonitored`; prüft nur die Darstellung (K1–K5). Das echte Erkennen geänderter oder gelöschter Quelldateien im Pod ist nicht geprüft (`route.test.ts`, `wiki-sources.test.ts`, `watch.test.ts`) |
