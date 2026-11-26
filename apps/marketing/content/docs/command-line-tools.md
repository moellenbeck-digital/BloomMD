---
title: Optionale Kommandozeilen-Tools
description: Native BloomMD-Binaries für lokale Wiki-Workflows, CI und kontrollierte Agent-Automatisierung.
order: 7
---

# Optionale Kommandozeilen-Tools

Die BloomMD-Desktop-App und das OpenClaw-Plugin funktionieren ohne zusätzliche Kommandozeilen-Tools. Die beiden nativen Binaries sind für lokale Automatisierung, CI und Integrationsentwicklung gedacht:

- **`bloommd-wiki`** prüft Markdown-Ordner, verwaltet OKF/LLM-Wiki-Bundles und stellt einen MCP-Transport bereit.
- **`bloommd-agent`** ist die kontrollierte Agent-Runtime für Diagnose und Automatisierung. Bei normalem OpenClaw-Betrieb ist sie bereits im BloomMD-Plugin enthalten.

## Das passende Binary laden

Auf der [Download-Seite](/download) stehen aktuelle Binaries für macOS auf Apple Silicon sowie Linux auf x86_64 und ARM64 bereit. Für einen direkten, immer aktuellen Download kannst du auch diese URLs verwenden:

```bash
# macOS auf Apple Silicon
curl -fL https://bloommd.io/command-tools/bloommd-wiki-darwin-arm64 -o bloommd-wiki

# Linux auf Intel/AMD
curl -fL https://bloommd.io/command-tools/bloommd-wiki-linux-x64 -o bloommd-wiki

# Linux auf ARM64
curl -fL https://bloommd.io/command-tools/bloommd-wiki-linux-arm64 -o bloommd-wiki

chmod 755 bloommd-wiki
./bloommd-wiki --help
```

Für reproduzierbare Automatisierung lädst du das Asset mit der zugehörigen SHA-256-Prüfsumme aus dem Release `cli-v<version>` auf der [BloomMD-Release-Seite](https://github.com/moellenbeck-digital/BloomMD/releases). Lege die Binary in einen privaten Tool-Ordner, zum Beispiel `~/.local/bin`, statt sie in ein Workspace-Repository zu kopieren.

## Wiki und Markdown prüfen

```bash
bloommd-wiki workspace lint ./docs --format github --strict
bloommd-wiki workspace check ./vault
bloommd-wiki workspace index ./docs
bloommd-wiki init ./wiki "Projektwissen"
bloommd-wiki status ./wiki
bloommd-wiki mcp ./wiki
```

**Noch nicht veröffentlicht:** `workspace index` ist erst in der nächsten Version nach 0.4.4 enthalten. Das aktuelle Release `cli-v0.4.4` kennt den Befehl noch nicht.

`workspace index` zeigt je Datei und je Überschrift, wer darauf verweist (ein Link mit Anker zählt für die Überschrift, einer ohne Anker für die Datei), und meldet drei Befunde: defekte oder mehrdeutige Links, veraltete Ziele (Anker ohne Überschrift; Zieldatei mit Status `veraltet`/`ersetzt` oder abgelaufenem `stale_after`, mit `replaced_by` als Nachfolger) und doppelte `bloommd:id`. Optionen wie bei `workspace lint`: `--format text|json|github`, `--strict`, `--quiet`; Fehler (defekte Links) ergeben Exit-Code 1, mit `--strict` auch Warnungen. `workspace lint` bleibt unverändert.

`init`, `index`, `log` und `apply` schreiben in den angegebenen Wiki-Ordner. `propose` schreibt die angegebene Vorschlagsdatei, `approve` trägt die Freigabe in die angegebene Vorschlagsdatei ein. Die Vorschlagsdatei kann auch außerhalb des Wiki-Ordners liegen. `status`, `lint` sowie `workspace lint`, `check`, `search` und `backlinks` lesen und berichten.

## Wiki-Änderungen vorschlagen

`propose` macht aus einer Liste von Änderungen einen Vorschlag. Der Vorschlag ändert noch keine Wiki-Seite. `approve` gibt ihn mit dem Namen der prüfenden Person frei. Erst danach schreibt `apply` ihn in den Wiki-Ordner.

```bash
bloommd-wiki propose ./wiki ./changes.json ./proposal.json
bloommd-wiki approve ./proposal.json "Name der prüfenden Person"
bloommd-wiki apply ./wiki ./proposal.json
```

Argumente von `propose <pfad> <changes.json> <proposal.json>`, alle drei Pflicht:

- **`<pfad>`**: der Wiki-Ordner. `propose` liest dort den aktuellen Stand jeder betroffenen Seite.
- **`<changes.json>`**: ein JSON-Array. Jeder Eintrag hat `path` (Seite relativ zum Wiki-Ordner, Endung `.md`), `content` (der vollständige neue Seiteninhalt) sowie optional `reason` und `sourceIds`.
- **`<proposal.json>`**: die Zieldatei für den Vorschlag. Eine vorhandene Datei wird überschrieben.

```json
[
  {
    "path": "concepts/launch.md",
    "content": "---\ntype: concept\n---\n# Launch\n\nNeuer Plan.\n",
    "reason": "Plan aktualisiert",
    "sourceIds": ["docs:launch"]
  }
]
```

Die Vorschlagsdatei enthält `version: 1`, eine `id`, `createdAt` und die Änderungen. Jede Änderung trägt zusätzlich `beforeHash` (SHA-256 der Seite beim Vorschlag, `null` für eine neue Seite) und `afterHash`. Ein eigenes Statusfeld gibt es nicht: Ohne `approvedBy` und `approvedAt` ist der Vorschlag nicht freigegeben, und `apply` lehnt ihn ab. `apply` lehnt ihn auch ab, wenn sich eine Seite seit dem Vorschlag geändert hat.

Bei Erfolg gibt `propose` JSON aus, zum Beispiel `{ "ok": true, "command": "wiki propose", "proposalId": "…", "outputPath": "…" }`, und endet mit Exit-Code 0.

`propose` bricht mit Exit-Code 2 ab und schreibt keine Datei, wenn ein Argument fehlt, ein `path` absolut ist, `..` enthält oder nicht auf `.md` endet, ein `path` doppelt vorkommt oder ein `content` größer als 2.000.000 Bytes ist. Eine Quellenangabe erzwingt `propose` nicht: `sourceIds` ist optional. Ein `type` im Frontmatter prüft erst `apply`: Fehlt er, bricht `apply` mit Exit-Code 2 ab.

## Agent-Runtime nur für Automatisierung

Das normale Pairing bleibt ein OpenClaw-Befehl:

```bash
openclaw bloommd pair --server https://bloommd.app \
  --bloommd-profile research \
  --pairing-code-file ~/.config/bloommd/pairing-code
```

Installiere `bloommd-agent` nur, wenn du die Runtime außerhalb des Plugins bewusst automatisieren oder diagnostizieren möchtest. Pairing-Codes gehören immer in eine private Datei, nie in die Shell-Historie, einen Prompt oder ein Repository:

```bash
# macOS auf Apple Silicon: darwin-arm64
# Linux auf Intel/AMD: linux-x64
# Linux auf ARM64: linux-arm64
curl -fL https://bloommd.io/command-tools/bloommd-agent-linux-x64 -o bloommd-agent
chmod 755 bloommd-agent

bloommd-agent status --profile research
bloommd-agent cron install --profile research --interval-seconds 60
```

Auch die Runtime startet ein Modell erst, nachdem sie einen eigenen, explizit zugewiesenen Auftrag beansprucht hat. Ergebnisse bleiben Vorschläge, bis ein Mensch sie in BloomMD übernimmt.

Als Nächstes: [OpenClaw-Agenten im Workspace](/docs/openclaw-agent) oder [LLM-Wiki](/docs/okf-wiki).
