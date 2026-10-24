---
title: "Das Obsidian-Plugin hat jetzt eine klare Entwicklungsquelle"
description: "Plugin-Code und gemeinsame Markdown-Logik werden im Monorepo entwickelt; das öffentliche Repo bleibt ein Release-Mirror."
date: 2026-08-24
commitDate: 2026-08-24
tags:
  - Obsidian
  - Open source
  - Markdown
version: "0.5.6"
---

# Das Obsidian-Plugin hat jetzt eine klare Entwicklungsquelle

Das BloomMD-Obsidian-Plugin wird im Monorepo gemeinsam mit der Markdown- und Struktur-Logik entwickelt. Das öffentliche Repository `bloommd-obsidian` dient als nachvollziehbarer Release-Mirror für Nutzer und BRAT.

Gemeinsame Logik bleibt damit an einer Stelle, während Obsidian-spezifische Vault-, View- und Einstellungslogik im Plugin bleibt. Releases können reproduzierbar aus dem kanonischen Entwicklungsstand erzeugt werden.

**Commit-Datum:** 24. August 2026
