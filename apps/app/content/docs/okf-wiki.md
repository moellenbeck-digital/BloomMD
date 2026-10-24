---
title: OKF und LLM-Wiki
description: Wissensseiten mit nachprüfbarer Herkunft.
order: 5
---

# OKF und LLM-Wiki

Ein Wiki Bundle ist ein Ordner mit Markdown-Dateien im **Open Knowledge Format** (OKF v0.2). Kein
Datenbankformat, kein Export — dieselben Dateien lassen sich in Obsidian öffnen und nach git
committen.

## Wozu das gut ist

Von einer KI geschriebene Dokumentation liest sich autoritativ und lässt sich meist nicht
überprüfen. OKF hängt an jede Seite, woher sie stammt:

- **Vertrauensstufe:** von einem Menschen geprüft, KI-generiert und ungeprüft, oder ohne Angabe.
- **Quellen** mit Inhalts-Hash. Ändert sich die Quelle, wird die Seite als *Quelle hat sich
  geändert* markiert — genau der Moment, in dem eine Aussage ihre Grundlage verliert.
- **Lebenszyklus:** Entwurf, stabil, veraltet, samt Ablaufdatum.

## Vorschauen sind freiwillig

Eine Wiki-Seite lädt **keine** externen Bilder von selbst. Eine Vorschau braucht einen Klick, und
die Schaltfläche nennt vorher den Server, der kontaktiert wird. Vorher verlässt keine Anfrage die
Seite — sonst würde allein das Lesen einer Seite verraten, wer gerade was liest.

Defekte Verweise und fehlende Dateien bleiben sichtbar. Ein Wiki, dessen tote Verweise unsichtbar
sind, wirkt gesünder als es ist.

## KI-Vorschläge

Ein Agent kann Seiten **vorschlagen**, nicht schreiben. Jeder Vorschlag braucht eine ausdrückliche
Freigabe, und beim Anwenden werden die Inhalts-Hashes erneut geprüft: Hat sich die Seite seit dem
Vorschlag geändert, wird er abgelehnt statt fremde Arbeit zu überschreiben. Vorschläge ohne
Quellenangabe werden verworfen.

Das gilt unabhängig vom Anbieter — OpenAI, Anthropic, lokale Modelle oder MCP-Clients laufen alle
durch dieselbe Prüfung.
