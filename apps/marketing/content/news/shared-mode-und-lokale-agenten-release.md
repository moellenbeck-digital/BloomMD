---
title: "Shared Mode und lokale Agenten: Zusammenarbeit mit klaren Grenzen"
description: "Eine lokale Markdown-Datei gezielt teilen, Rollen im Workspace vergeben und OpenClaw-Vorschläge am Knoten prüfen."
date: 2026-09-22
commitDate: 2026-09-22
tags:
  - Shared Mode
  - Zusammenarbeit
  - OpenClaw
  - Desktop
  - Obsidian
version: "0.5.6"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.6"
draft: false
---

# Shared Mode und lokale Agenten: Zusammenarbeit mit klaren Grenzen

Dieses Release bündelt zwei zusammengehörige Arbeitsweisen: Eine vorhandene lokale Markdown-Datei
wird bewusst mit genau einem Workspace geteilt; ein lokaler OpenClaw-Agent kann innerhalb dieses
Workspaces anschließend einen ausgewählten Knoten untersuchen und einen Vorschlag zurückgeben.

Die Datei bleibt dabei eine Markdown-Datei. BloomMD lädt weder den restlichen Ordner noch weitere
Notizen automatisch hoch. Nach dem Teilen zeigt die Desktop-App den Zustand direkt an der Datei:
**verbunden**, **offline**, **Konflikt** oder **Zugriff entzogen**. Mit **Freigabe trennen** endet
nur die Bindung — die lokale Datei und das Cloud-Dokument bleiben erhalten.

Für Teams gilt weiterhin das Rollenmodell im Workspace: Owner laden ein und verwalten Rechte,
Editoren bearbeiten, Viewer lesen. Dasselbe Cloud-Dokument kann von Browser, Desktop und einer
ausdrücklich angebundenen Obsidian-Notiz geöffnet werden.

OpenClaw ergänzt diesen Ablauf, ohne daraus einen unkontrollierten Schreibzugriff zu machen. Ein
Auftrag startet am ausgewählten Knoten, der Agent erhält nur diesen Kontext und liefert seine
Änderung als prüfbaren Vorschlag. Struktur wird als Baum, Text als Markdown geprüft; erst
**Übernehmen** schreibt die Änderung in den Workspace.

Weitere Details: [lokale Datei teilen und zusammenarbeiten](/docs/collaboration) und
[OpenClaw-Agenten einrichten](/docs/openclaw-agent).

**Release-Status:** Dieser Beitrag wird mit Desktop `0.5.6` und Hosted `0.4.18` veröffentlicht.
