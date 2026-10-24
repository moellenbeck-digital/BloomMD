---
title: "BloomMD Desktop 0.5.14: Knoten ohne Sprünge bearbeiten"
description: "Die Map bleibt beim Auswählen sichtbarer Knoten ruhig. Umbenennen, Tastaturnavigation und Editor-Shortcuts sind zuverlässiger."
date: 2026-10-21
commitDate: 2026-10-21
tags:
  - Release
  - Desktop
version: "0.5.14"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.14"
---

# BloomMD Desktop 0.5.14: Knoten ohne Sprünge bearbeiten

Beim Auswählen eines sichtbaren Knotens bleibt die Mindmap jetzt an ihrer Position. Wenn du mit
den Pfeiltasten zu einem Knoten außerhalb des sichtbaren Bereichs navigierst, bringt BloomMD nur
diesen Knoten in die Ansicht. Das erleichtert die Orientierung beim Bearbeiten größerer Maps.

In einer geöffneten Markdown-Datei kannst du einen Knotentitel mit **Doppelklick** oder **R**
umbenennen. **Enter** übernimmt den Titel, **Escape** verwirft die Eingabe. Danach liegt der Fokus
wieder auf dem Knoten. Das gilt auch für Ressourcenknoten; ihre verknüpfte Datei öffnest du über
die separate Aktion **Ressource öffnen**. Ein mit **Tab** angelegter Kindknoten wird vor der
Titelbearbeitung sichtbar.

![Native BloomMD-Mindmap mit Produktplan und geöffnetem Inline-Titelfeld am ausgewählten Knoten Konzept](/releases/desktop-0.5.14-rename.jpg)

Die Workspace-Übersicht bleibt schreibgeschützt. Von einem Dateiknoten oder einer Überschrift
führt die Aktion **Quelldatei öffnen** zur bearbeitbaren Markdown-Datei. Im Knoten-Editor kannst
du **Cmd+I** für Kursivschrift und **Cmd+K** für Links verwenden. Die übrigen Shortcuts und ihre
Kontexte stehen in der [Desktop-Hilfe](/docs/desktop).

Wir haben den Ablauf in der nativen macOS-App mit einer isolierten Markdown-Datei geprüft:
Umbenennen und Abbrechen, Kindknoten, Editor, Navigation und Speichern. Der Desktop-Build enthält
außerdem ein Sicherheitsupdate für Vite.

Aktualisiere über **Hilfe und Einstellungen → Über BloomMD → Nach Updates suchen** oder nutze
die [Download-Seite](/download).
