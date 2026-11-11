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

## Releases (Dev-Team, Stufen-Ablauf)

- **Tag-Präfix für Dev-Releases: `dev-v`** (z. B. `dev-v0.6.0-develop.1`). Nie `v*`, `cli-v*`, `openclaw-v*` oder `mobile-v*` für Dev-Releases: Diese Tags lösen den signierten Desktop-, CLI-, Plugin- bzw. Mobile-Release aus. Stable-Tags (`v<X.Y.Z>`) setzt nur ein Mensch nach Owner-Freigabe.
- **Version:** Development = `X.Y+1.0-develop.N` (Basis = letzte Stable `v<X.Y.Z>`, `git tag -l 'v[0-9]*' | grep -v -- -`; `dev-v…`-Tags zählen nicht als Stable, N = höchstes vorhandenes `dev-v<basis>-develop.*` + 1).
- **Versionsdateien:** `version` in `apps/app/package.json`, `apps/marketing/package.json` und `packages/sync/package.json` gemeinsam auf dieselbe Version (Testsystem `bloommd-test` besteht aus app, marketing, sync); berührt das Release zusätzlich `apps/cms`, `packages/desktop`, `packages/agent-runtime`, `packages/wiki-cli` oder `packages/mobile`, deren `package.json` ebenfalls (Regel „Version und Build-Info“ in `AGENTS.md`).
- **Release-Commit:** `chore: release dev-v<version>` per Pull Request auf `main`: setzt die Versionen, verschiebt „In Entwicklung“ in `Changelog.md` unter die neue Version. Danach Tag `dev-v<version>` auf den Merge-Commit.
- **Kein GitHub-Release** anlegen (löst `marketing-news-draft.yml` aus) und keine Stable-/Store-Veröffentlichung. Das Image des Commits entsteht wie bisher über den Build-Trigger im bloommd-cluster (Tag `{sha}`); das Testsystem `dev` rollt mit dem Commit-Tag aus.
