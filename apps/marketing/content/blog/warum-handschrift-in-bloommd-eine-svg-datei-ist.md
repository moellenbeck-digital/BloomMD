---
title: "Warum Handschrift in BloomMD eine SVG-Datei ist"
description: "Handschrift ohne Format-Lock-in: Zeichnungen sind normale Dateien im Vault, lesbar ohne Plugin und trotzdem verlustfrei bearbeitbar."
date: 2026-09-28
tags:
  - Obsidian
  - Handschrift
  - Markdown
  - Local-first
draft: true
---

# Warum Handschrift in BloomMD eine SVG-Datei ist

BloomMD speichert Maps als Markdown, damit deine Notizen dir gehören. Für Handschrift gilt dasselbe
Versprechen. Deshalb ist jede Zeichnung eine eigene **SVG-Datei** im Anhangsordner deines Vaults, und
der Knoten bettet sie mit einer ganz normalen Obsidian-Zeile ein:

```markdown
![[Thermodynamik ink.svg]]
```

## Überall lesbar

SVG ist ein offenes Bildformat. Obsidian zeigt die Zeichnung in der Notizansicht, auf dem Handy und in
Vaults ohne BloomMD. Git, iCloud, Obsidian Sync oder ein anderer Vault-Sync übertragen sie wie jede
andere Datei. Wer das Plugin deinstalliert, verliert keine einzige Zeichnung.

## Trotzdem verlustfrei bearbeitbar

Ein Bild allein wäre eine Sackgasse. BloomMD legt deshalb die Rohdaten jedes Strichs – Punkte, Druck,
Werkzeug, Farbe – und die Verknüpfungen zu Notizen zusätzlich in die SVG-Datei. Öffnest du die
Zeichnung wieder, ist alles genau wie vorher: Striche lassen sich radieren, verschieben und skalieren.

## Markdown bleibt schlank

In der Notiz steht nur die Einbettung und, wenn du Handschrift verknüpfst, ein `[[Link]]`. Kein
Datenblock mit Tausenden Koordinaten stört beim Lesen, beim Durchsuchen oder wenn ein Agent die Notiz
verarbeitet.

## Sicher über Geräte hinweg

Wer zwischen Mac und iPad wechselt, synchronisiert irgendwann gleichzeitig. BloomMD überschreibt eine
Zeichnung nur, wenn sie seit dem Öffnen unverändert ist. Hat ein anderes Gerät inzwischen eine neuere
Fassung gespeichert, meldet BloomMD das, statt sie still zu überschreiben.

Mehr zur Bedienung steht in der [Hilfe zum Obsidian-Plugin](/docs/obsidian).
