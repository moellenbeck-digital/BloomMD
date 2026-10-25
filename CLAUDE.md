# BloomMD Agent Instructions

Die projektweiten Arbeitsanweisungen liegen in [AGENTS.md](AGENTS.md).

## Preferences

- BloomMD öffentliche Produktflächen, Marketing-Seiten, Hilfe/Dokumentation und Roadmap-UI grundsätzlich auf Deutsch und Englisch planen; GitHub-Tickets bleiben in der Sprache, in der sie erfasst wurden.

## Obsidian-Plugin

- Entwicklung ausschließlich in `plugins/obsidian` im Monorepo `moellenbeck-digital/BloomMD`.
- `moellenbeck-digital/bloommd-obsidian` ist ein Read-only-Release-Mirror; Änderungen dort werden nicht handgepflegt.
- Shared Markdown-/Struktur-Logik kommt aus Core (`@bloommd/core/obsidian-markdown`, schmaler Export für das Bundle-Budget); Obsidian-Vault/View/Settings/UI bleibt plugin-spezifisch.
- Aktueller synchronisierter Plugin-Stand: `0.7.1` (Desktop und Mobil, MIT-Lizenz). Mirror-Nachweis über `MIRROR.json` mit Version, Git-SHA und Core-Hashes.
- Sync/Prüfung: `scripts/sync-obsidian-repo.sh <checkout>` bzw. `scripts/sync-obsidian-repo.sh --check <checkout>`.
