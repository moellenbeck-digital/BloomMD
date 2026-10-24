---
title: "BloomMD für Obsidian 0.7: jetzt auf iPad, iPhone und Android"
description: "Handschrift mit dem Apple Pencil im Knoten, Lernfortschritt auf der Map und ein Agenten-Panel – auf Desktop und Mobilgeräten. Das Plugin bleibt MIT-lizenziert."
date: 2026-10-24
commitDate: 2026-10-24
tags:
  - Release
  - Obsidian
version: "0.7.0"
---

# BloomMD für Obsidian 0.7: jetzt auf iPad, iPhone und Android

Bisher lief das BloomMD-Plugin nur in Obsidian auf dem Desktop. Mit Version 0.7 läuft es auch in Obsidian auf iPad, iPhone und Android – derselbe Vault, dieselben Maps, dieselben Markdown-Dateien.

## Handschrift im Knoten

Im Node-Inspector gibt es einen Tab **Handschrift**. Mit dem Apple Pencil, dem Finger oder der Maus schreibst und zeichnest du direkt im Knoten: Druckstufen, Textmarker, Radierer, Lasso und Rückgängig. Eine aufgelegte Hand zeichnet nicht, Finger verschieben die Fläche. Jede Zeichnung ist eine normale SVG-Datei im Vault und als `![[… ink.svg]]` im Knoten eingebettet – Obsidian zeigt sie überall, auch ohne Plugin.

Auf der Map selbst lässt sich ebenfalls zeichnen: Ein Strich von Knoten zu Knoten verbindet sie, eine Linie ins Leere legt einen neuen Kindknoten an, Durchkritzeln löscht.

## Lernen auf der Map

Im Lernmodus deckst du Knoten auf und bewertest, wie sicher du sie kannst. Die Map zeigt den Stand farbig an, auf Wunsch mit Wiederholungsintervallen und einem Plan bis zum Prüfungstermin. Der Fortschritt liegt im Vault unter `.bloommd/learning/`, nie in der Notiz selbst, und lässt sich in den Einstellungen anpassen oder abschalten.

## Agenten-Panel

Agenten wie OpenClaw, die über `bloommd-wiki agent mcp` Notizen pflegen, machen ihre Vorschläge im neuen **BloomMD-Agent**-Panel. Du siehst die Änderung als Gliederungs-Diff, nimmst sie an oder lehnst sie ab, und kannst angenommene Änderungen rückgängig machen. Rechte pro Ordner legst du selbst fest.

## Weiterhin MIT-lizenziert

Das Obsidian-Plugin bleibt unter der MIT-Lizenz. Die übrigen Teile von BloomMD stehen unter der Elastic License 2.0, siehe [Lizenz](/lizenz).

Das Update kommt über **Einstellungen → Community-Plugins → Nach Updates suchen**. Die vollständige Liste der Änderungen steht im [Changelog des Plugins](https://github.com/moellenbeck-digital/bloommd-obsidian/blob/main/CHANGELOG.md).
