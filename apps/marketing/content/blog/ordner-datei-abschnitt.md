---
title: "Ordner, Datei oder Abschnitt bearbeiten"
description: "Die Ordnerübersicht in Desktop 0.6.0 erklärt den Weg von der Datei zur passenden Überschrift."
date: 2026-11-24
tags:
  - Desktop
  - Markdown
  - Release
---

# Ordner, Datei oder Abschnitt: Wo bearbeite ich meinen Inhalt?

Ein Ordner enthält Dateien. Eine Markdown-Datei enthält Überschriften und Text. In einer gemeinsamen Karte können diese drei Dinge ähnlich aussehen, obwohl sie unterschiedliche Aufgaben haben. BloomMD Desktop 0.6.0 macht diese Unterscheidung sichtbar.

Ordner haben einen gestrichelten Rahmen und ein Ordnersymbol. Dateien tragen einen blauen Rand, den Typ „Markdown-Datei“ und ihren relativen Pfad. Die Überschriften einer Datei erscheinen als kompakte Inhaltsvorschauen. Die Farben sind eine zusätzliche Orientierung; Typnamen und Symbole bleiben auch ohne sie verständlich.

![Native Ordnerübersicht mit Ordnern, einer Markdown-Datei und ausgewähltem Abschnitt Ziele](/releases/desktop-0.6.0-overview.png)

Wähle **Öffnen** an der Datei, wenn du ihre gesamte Mindmap bearbeiten möchtest. Geht es um einen bestimmten Text, wähle dessen Inhaltsvorschau und **Abschnitt bearbeiten**. BloomMD öffnet die Quelldatei und wählt den passenden Abschnitt im Editor aus. Die Übersicht selbst bleibt eine Navigationsansicht.

Der Rückweg ist ebenfalls ausdrücklich benannt: **Zur Ordnerübersicht** speichert Änderungen und stellt die vorherige Auswahl und Ansicht wieder her. Schlägt das Speichern fehl, bleibt die Datei geöffnet und der Fehler wird angezeigt. So führt der Weg über die tatsächliche Markdown-Datei, ohne eine zweite Kopie des Inhalts anzulegen.

Dieser Ablauf gehört zum [Desktop-Release 0.6.0](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.0). Die Aufnahme entstand in der nativen macOS-Testversion mit neutralen Beispieldaten. Details stehen in der [Desktop-Hilfe](/docs/desktop).
