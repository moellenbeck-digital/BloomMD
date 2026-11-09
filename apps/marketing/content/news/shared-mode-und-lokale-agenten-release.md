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

![BloomMD Desktop zeigt den Freigabestatus „Konflikt“ für „Kapitel 2.md“ mit den Entscheidungen „Cloud-Version verwenden“ und „Lokale Version beibehalten“](/blog/shared-mode-conflict-desktop.png)

*Bei einem Konflikt überschreibt BloomMD nichts automatisch. Du wählst bewusst, ob die Cloud-Version
verwendet oder die lokale Version beibehalten wird.*

Für Teams gilt weiterhin das Rollenmodell im Workspace: Owner laden ein und verwalten Rechte,
Editoren bearbeiten, Viewer lesen. Dasselbe Cloud-Dokument kann von Browser, Desktop und einer
ausdrücklich angebundenen Obsidian-Notiz geöffnet werden.

OpenClaw ergänzt diesen Ablauf, ohne daraus einen unkontrollierten Schreibzugriff zu machen. Ein
Auftrag startet am ausgewählten Knoten, der Agent erhält nur diesen Kontext und liefert seine
Änderung als prüfbaren Vorschlag. Struktur wird als Baum, Text als Markdown geprüft; erst
**Übernehmen** schreibt die Änderung in den Workspace.

![Echte BloomMD-Aufnahme: Die Vorschau zeigt den Ausgangsknoten „Welcome“ als geändert und darunter die vorgeschlagene Erweiterung mit den neuen Knoten „Prüffragen“ und „Nächste Schritte“ als Baum.](/docs/openclaw-agent-proposal.png)

*Echte Produktaufnahme: Die vorgeschlagene Struktur lässt sich vor der Entscheidung als Baum prüfen.*

Weitere Details: [lokale Datei teilen und zusammenarbeiten](/docs/collaboration) und
[OpenClaw-Agenten einrichten](/docs/openclaw-agent).

**Release-Status:** Veröffentlicht am 22.09.2026 mit Desktop `0.5.6` und Hosted `0.4.18`.
