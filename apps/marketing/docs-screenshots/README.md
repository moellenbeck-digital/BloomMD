# Screenshots für die Online-Hilfe

Die Bilder der Hilfeseiten (`bloommd.io/docs`) entstehen reproduzierbar aus eingecheckten Fixtures
(`test-vault/`, Demo-Inhalte). Sie landen in `apps/marketing/public/docs/`, je Bild einmal pro Sprache:
`name.png` (Deutsch) und `name-en.png` (Englisch). Der normale E2E-Lauf bleibt unberührt: eigene
Config `playwright.docs-screenshots.config.ts`, eigene Specs (`*.capture.ts`) in diesem Ordner.

```bash
bun run --cwd apps/marketing docs:screenshots            # alle Bilder
bun run --cwd apps/marketing docs:screenshots:app        # Web-App, Registrierung, Vorlagen, Sync
bun run --cwd apps/marketing docs:screenshots:marketing  # Browser-Demo und Wiki-Ansicht (Bundle `test-wiki/`)
bun run --cwd apps/marketing docs:screenshots:gate       # Registrierung bei aktivem Zugangsschalter
```

Im Dev-Team-Pod über `scripts/team-lauf` starten (ein schwerer Lauf zugleich), zum Beispiel
`scripts/team-lauf bun run --cwd apps/marketing docs:screenshots:app`. Der Lauf startet
Dev-Server auf den Ports 3811/3812/4811 (`DOCS_SCREENSHOTS_*_PORT`) und braucht rund 1 GB freien Platz
für `.next`.

- Fest: Fenster 1280×800 (nur das Sync-Bild 1600 Pixel breit, weil der Status erst ab 1536 Pixel
  erscheint), Maßstab 1, helles Theme, UTC, reduzierte Bewegung.
- Datenquelle: nur eingecheckte Fixtures. Konten und Adressen sind Wegwerf- oder Beispielwerte
  (`alex@example.com`); nichts Privates, keine Tokens.
- Jede Datei höchstens 300 KB; ein größeres Bild lässt den Lauf fehlschlagen.
- `DOCS_SCREENSHOTS_OUT=/pfad` schreibt in einen anderen Ordner, um einen Lauf vor dem Einchecken
  anzusehen.
- Desktop-App und Obsidian laufen nicht headless; ihre Bilder (`desktop-ordner*.svg`,
  `obsidian-flow*.svg`) sind von Hand gepflegte Schemazeichnungen und im Alt-Text als „kein
  Screenshot“ gekennzeichnet.
