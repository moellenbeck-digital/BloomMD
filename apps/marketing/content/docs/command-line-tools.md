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

`workspace index` zeigt je Datei und je Überschrift, wer darauf verweist (ein Link mit Anker zählt für die Überschrift, einer ohne Anker für die Datei), und meldet drei Befunde: defekte oder mehrdeutige Links, veraltete Ziele (Anker ohne Überschrift; Zieldatei mit Status `veraltet`/`ersetzt` oder abgelaufenem `stale_after`, mit `replaced_by` als Nachfolger) und doppelte `bloommd:id`. Optionen wie bei `workspace lint`: `--format text|json|github`, `--strict`, `--quiet`; Fehler (defekte Links) ergeben Exit-Code 1, mit `--strict` auch Warnungen. `workspace lint` bleibt unverändert.

`init`, `index`, `log`, `approve` und `apply` schreiben nur in den ausdrücklich angegebenen Wiki-Ordner. Die anderen Befehle lesen und berichten.

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
