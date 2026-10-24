---
title: "Zwei kleine Werkzeuge für lokale BloomMD-Automatisierung"
description: "Die Agent-Runtime und die Wiki-CLI werden getrennt ausgeliefert – klarer für OpenClaw, CI und lokale Workflows."
date: 2026-09-12
tags:
  - OpenClaw
  - Automatisierung
  - Wiki
  - Entwickler
---

# Zwei kleine Werkzeuge für lokale BloomMD-Automatisierung

BloomMD trennt die bisher zusammengewachsenen Terminal-Funktionen in zwei klar benannte Tools: `bloommd-agent` für kontrollierte Workspace-Agenten und `bloommd-wiki` für lokale Markdown- und Wiki-Workflows.

Für OpenClaw-Nutzer ändert sich der normale Einstieg nicht: Das BloomMD-Plugin enthält Runtime und Skill bereits. Ein zusätzlicher Download ist nicht nötig. Die neuen Single-Binaries sind optional – für CI, MCP-Clients, Diagnose und eigene Automatisierung.

Die Release-Pipeline erzeugt signierbare, native Binaries für macOS auf Apple Silicon sowie Linux auf x86_64 und ARM64. Jede Veröffentlichung enthält zusätzlich SHA-256-Prüfsummen.

Mehr dazu in der [Anleitung zu den Kommandozeilen-Tools](/docs/command-line-tools) und im Beitrag [Warum BloomMD zwei Werkzeuge statt einer großen CLI hat](/blog/warum-bloommd-zwei-werkzeuge-hat).
