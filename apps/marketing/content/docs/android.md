---
title: BloomMD auf Android
description: Die BloomMD-App für Android-Smartphones und -Tablets – Obsidian-Vault direkt bearbeiten, Handschrift mit dem Stift, Konfliktschutz.
order: 8
draft: true
---

# BloomMD auf Android

Die Android-App ist dieselbe App wie auf dem iPad: Mindmaps aus Markdown-Notizen, Knoten-Editor,
Handschrift. Sie ist noch nicht im Play Store, sondern zunächst im geschlossenen Test.

## Einen Vault öffnen

Seitenmenü → *Ordner öffnen* → in der Android-Ordnerauswahl den Vault wählen, z. B. im internen
Speicher, auf der SD-Karte oder in einem synchronisierten Ordner. BloomMD fragt nach dem Zugriff auf
genau diesen Ordner und behält ihn über Neustarts. Notizen werden direkt dort gelesen und
geschrieben; `.obsidian` und `.trash` werden übersprungen. *Nur hier* wechselt zurück in den
App-eigenen Speicher (*Auf diesem Gerät*).

## Gespeichert wird nur, was du änderst

Öffnen schreibt keine Notiz um. Hat ein anderes Gerät die Notiz inzwischen geändert oder gelöscht,
überschreibt BloomMD sie nicht: Deine Fassung landet als „… (Android-Konflikt).md“ daneben.

## Mit dem Stift schreiben

Stifte wie der S Pen werden erkannt: Mit dem Stift zeichnen, mit dem Finger verschieben und zoomen,
der aufgelegte Handballen zeichnet nicht. Zeichnungen sind SVG-Dateien im Vault und erscheinen auch
im Obsidian-Plugin.

## Links

`bloommd://open?path=Ordner/Notiz.md&node=<id>` öffnet eine Notiz des geöffneten Ordners am Knoten.
