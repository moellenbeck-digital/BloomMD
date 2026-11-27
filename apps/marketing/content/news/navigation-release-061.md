---
title: "Knoten finden, große Karten bedienen"
description: "Nach Titel oder Dateipfad suchen, eingeklappte Zweige finden und Ladehinweise verstehen."
date: 2026-11-27
commitDate: 2026-11-27
tags:
  - Release
  - Desktop
  - Mobile
version: "0.6.1"
draft: false
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.1"
---

# Knoten wiederfinden: bessere Navigation in großen Karten

Große Ordnerübersichten starten jetzt kompakt. **Knoten suchen** durchsucht Titel und Dateipfade. Ein Treffer klappt seine übergeordneten Zweige auf und erscheint im sichtbaren Bereich. **Ausgewählten Knoten zeigen** bringt die Auswahl nach dem Verschieben der Karte zurück.

Desktop 0.6.1 und Mobile 1.1.0 erklären außerdem Ladeprobleme. **Details** nennt die Ursache und bei ungültigen YAML-Kopfdaten die Zeile und Spalte innerhalb des YAML-Blocks. Mit × lässt sich der Hinweis ausblenden und später wieder aufrufen. Nach der Korrektur im Texteditor prüft **Erneut prüfen** die Dateien nochmals. Eine übersprungene Datei erhält erst nach erfolgreichem Laden einen Knoten.

![Echte Mobile-Touch-Testansicht: Der gefundene Knoten Transfer ist ausgewählt und zentriert, darüber befinden sich Suche und Auswahlzentrierung](/releases/mobile-1.1.0-node-search.png)

Das Bild zeigt den gebauten Mobile-Stand im Browser-Touchtest mit iPhone-Ansichtsgröße, kein physisches iPhone. iOS 1.1.0 wird über TestFlight verteilt, sobald Apple den hochgeladenen Build verarbeitet hat. Für Android 1.1.0 liegt ein signiertes App Bundle (AAB) vor; der Upload zu Google Play steht wegen des noch fehlenden Servicekonto-Zugangs aus. Eine öffentliche App-Store- oder Google-Play-Freigabe ist damit nicht verbunden. Das separate [Obsidian-Plugin 0.8.0](https://github.com/moellenbeck-digital/bloommd-obsidian/releases/tag/0.8.0) bringt Suche und Zentrierung auch in schmale Ansichten. Bei fehlgeschlagenen Vorschauen bleibt der Dateiknoten sichtbar; der Hinweis erklärt die Ursache und bietet einen neuen Versuch. Die Freigabe umfasst automatisierte Prüfungen und die bestätigte Prüfliste auf einem iPad Pro 11″ mit Obsidian 1.15.

Mehr in der [Desktop-Hilfe](/docs/desktop), der [iPad-Hilfe](/docs/ipad) und beim [Desktop-Release](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.1).
