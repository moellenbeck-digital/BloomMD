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
| `mobile-smoke.spec.ts` | Mobile-Projekt; die Testsystem-Config hat nur Desktop Chrome |

`theme-matrix.spec.ts` bleibt drin: Die Standard-Config führt es auch im Projekt `chromium` aus (nicht nur im Mobile-Projekt), hier läuft es entsprechend nur in Desktop Chrome.

## Tests einem Ticket zuordnen

Neue Specs für ein Ticket tragen `@t<nr>` im Testtitel, z. B. `test("Einladung bleibt sichtbar @t147", …)`.
Ausgewählt wird nur auf der Kommandozeile mit `--grep @t<nr>`; die Config setzt kein `grep`.
