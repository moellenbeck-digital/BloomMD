---
title: "Warum BloomMD zwei Werkzeuge statt einer großen CLI hat"
description: "OpenClaw-Agenten sollen einfach installierbar bleiben. Lokale Wiki- und CI-Workflows brauchen trotzdem ein verlässliches Werkzeug."
date: 2026-09-12
tags:
  - OpenClaw
  - Automatisierung
  - Markdown
  - Entwickler
---

# Warum BloomMD zwei Werkzeuge statt einer großen CLI hat

Ein Terminal-Tool kann schnell zum Sammelplatz werden: ein Befehl für lokale Dateien, einer für Wiki-Bundles, einer für Agenten, einer für den Betrieb. Das ist für die Entwicklung bequem, für Menschen aber oft unklar. Muss ich das installieren, um BloomMD zu benutzen? Muss mein OpenClaw-Agent noch eine zweite Anwendung kennen? Wo liegt dann ein Token?

BloomMD trennt diese Fragen bewusst.

![OpenClaw-Plugin, Agent-Runtime und Wiki-CLI sind getrennte Werkzeuge mit klaren Grenzen.](/blog/bloommd-command-tools.svg)

## Das Plugin bleibt der einfache Agenten-Einstieg

Wer einen OpenClaw-Agenten im Workspace einladen möchte, installiert das BloomMD-Plugin. Das Plugin bringt alles mit, was dieser Ablauf braucht: Pairing-Befehle, lokalen Secret Store, den nodebezogenen Skill und den Runner. Nach dem Pairing holt der Runner ausschließlich eigene Aufträge ab. Ohne Auftrag findet kein Modellturn statt.

Entscheidend ist: Für diesen normalen Weg musst du **keine** zweite BloomMD-Binary suchen, herunterladen oder aktuell halten. Das Plugin ist der Vertrag zwischen OpenClaw und BloomMD.

## `bloommd-agent`: bewusst für kontrollierte Automatisierung

Die Agent-Runtime existiert trotzdem als eigenständiges, natives Tool. Sie ist nützlich, wenn ein Betreiber den Runner gezielt diagnostizieren, einen kontrollierten Cron konfigurieren oder die Laufzeit in eine eigene Infrastruktur integrieren möchte.

Ihre Aufgabe ist eng: einen Pairing-Code aus einer privaten Datei lesen, das Token im Betriebssystem-Secret-Store ablegen, genau einen eigenen Auftrag beanspruchen und das Ergebnis als Vorschlag zurückgeben. Sie darf keine Workspace-Datei direkt schreiben.

Damit ist sie kein zweiter Agentendienst und auch kein Weg, die Freigabe zu umgehen. Sie ist die Laufzeit hinter einem klaren Sicherheitsvertrag.

## `bloommd-wiki`: lokal, deterministisch und ohne Modell

Wiki-Arbeit ist ein anderer Fall. Ein lokaler Markdown-Check oder ein OKF-Wiki-Lint benötigt weder OpenClaw noch einen Modellzugang. `bloommd-wiki` kann einen Ordner prüfen, einen Wiki-Status ausgeben, einen diffbaren Vorschlag vorbereiten oder einem lokalen MCP-Client Werkzeuge bereitstellen.

Das ist gerade für CI wichtig: Der Ablauf bleibt reproduzierbar, auch wenn gerade kein Modell erreichbar ist. Schreibende Schritte sind explizit benannt; `apply` braucht eine namentliche Freigabe und prüft Quellen vor dem Schreiben erneut.

## Zwei Binaries, ein nachvollziehbarer Release

Beide Tools werden als native Bun-Single-Binaries für Apple-Silicon-macOS sowie Linux auf x86_64 und ARM64 gebaut. Die Veröffentlichungen enthalten SHA-256-Prüfsummen. Dadurch kann eine Infrastruktur-Version gepinnt werden, ohne dass dafür ein Repository-Checkout oder eine globale Bun-Installation nötig ist.

Die Trennung hilft auch bei Updates: Ein Update des Wiki-Tools ändert nicht den Installationsweg eines OpenClaw-Agenten. Ein Plugin-Release bleibt ein Plugin-Release. Und in der Oberfläche bleibt klar, was für den aktuellen Auftrag zählt: Knoten, Vorschlag, menschliche Entscheidung.

> **Der einfache Weg bleibt einfach:** [OpenClaw-Plugin installieren](/docs/openclaw-agent). Für CI, MCP und lokale Prozesse gibt es die [Kommandozeilen-Tools](/docs/command-line-tools).
