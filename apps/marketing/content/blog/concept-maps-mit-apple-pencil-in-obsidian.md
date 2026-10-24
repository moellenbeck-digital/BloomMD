---
title: "Concept Maps mit dem Apple Pencil in Obsidian"
description: "Warum eine gute Concept Map knapp bleibt – und wie verknüpfte Handschrift in BloomMD Formeln, Pfeile und Obsidian-Notizen zusammenbringt."
date: 2026-09-28
tags:
  - Obsidian
  - Handschrift
  - Lernen
  - iPad
draft: true
---

# Concept Maps mit dem Apple Pencil in Obsidian

Wer lernt, sucht Zusammenhänge. Eine Formel, ein Pfeil, ein Wort daneben – auf Papier geht das
schnell. Auf dem Bildschirm wird daraus oft entweder eine lange Notiz oder eine Skizze, die mit dem
eigentlichen Wissen nichts zu tun hat.

BloomMD verbindet beides: Handschrift zeigt den Zusammenhang, die Details bleiben in Obsidian-Notizen.

## Ein Beispiel aus der Thermodynamik

Du notierst den ersten Hauptsatz handschriftlich im Knoten „Thermodynamik“:

`ΔU = Q + W`

Um zu klären, wofür die Variablen stehen, ziehst du einen Strich zum **W** und schreibst „Arbeit“
daneben. Die Definition der physikalischen Arbeit schreibst du nicht in die Map. Stattdessen
umkreist du „Arbeit“ mit dem Lasso und verknüpfst es mit deiner vorhandenen Notiz **Arbeit**.

- **Die Map bleibt knapp.** Sie zeigt nur, wie die Größen zusammenhängen.
- **Das Detail ist einen Blick entfernt.** Fährst du mit Maus oder Apple Pencil über „Arbeit“, zeigt
  Obsidian die Seitenvorschau der Notiz. Ein Tippen öffnet sie.
- **Obsidian kennt die Verbindung.** BloomMD schreibt die Verknüpfung zusätzlich als `[[Arbeit]]` in
  den Knoten – sie taucht in Graph und Rückverweisen auf und überlebt Umbenennungen.

![Eine BloomMD-Zeichnung in Obsidian: Beim Überfahren eines verknüpften Worts erscheint die Seitenvorschau der Notiz](/blog/obsidian-ink-hover-preview.png)

## Nachträglich umbauen

Concept Maps wachsen. Mit dem Lasso verschiebst du einen Gedanken dorthin, wo er besser passt, und
verkleinerst große Schrift über die Ecken der Auswahl, um Platz zu schaffen. Textmarker heben
Wichtiges hervor, der Radierer entfernt ganze Striche.

## Stift schreibt, Finger bewegt

Auf dem iPad arbeitet BloomMD wie Freeform: Der Apple Pencil zeichnet mit Druck, Finger verschieben
und zoomen die Fläche, ein aufgelegter Handballen zeichnet nicht. Ein schmaler Inspector wechselt
zum Schreiben in den Vollbildmodus.

Die Handschrift steht direkt im Knoten der Map – dort, wo das Thema ohnehin liegt.

![Die BloomMD-Map in Obsidian: Der Wurzelknoten zeigt die eingebettete Zeichnung als Vorschau](/blog/obsidian-ink-map-node.png)

Die Unterstützung für Obsidian auf dem iPad ist eine Beta. Wie du startest und welche Grenzen es gibt,
steht in der [Hilfe zum Obsidian-Plugin](/docs/obsidian).
