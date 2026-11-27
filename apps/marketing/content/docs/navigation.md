---
title: Knoten finden und Ladehinweise verstehen
description: Navigation in Desktop 0.6.1, Mobile 1.1.0 und Obsidian 0.8.0 – mit geprüften Bedienwegen und klaren Grenzen.
order: 8
---

# Knoten finden und Ladehinweise verstehen

Diese Anleitung gilt für **Desktop 0.6.1**, den **Mobile-Teststand 1.1.0** und das **Obsidian-Plugin 0.8.0**.

## Einen Knoten wiederfinden

1. Öffne **Knoten suchen** über das Suchsymbol der Karte.
2. Gib einen Teil des Knotentitels oder des Dateipfads ein.
3. Wähle einen Treffer. Die Karte klappt seine übergeordneten Zweige auf, wählt ihn aus und bringt ihn in den sichtbaren Bereich.
4. Wenn du die Karte anschließend verschoben hast, führt **Ausgewählten Knoten zeigen** zurück zur Auswahl.

Große Ordnerübersichten starten kompakt. Klappe den gewünschten Ordner auf oder springe über die Suche zu einer Datei. Die Suche erfasst geladene Knoten; sie ist keine Volltextsuche über sämtliche ungelesenen Dateien.

![Mobile-App im Browser-Touchtest: Der Knoten Transfer ist ausgewählt und zentriert; Suche und Auswahlzentrierung sind oberhalb der Karte erreichbar](/releases/mobile-1.1.0-node-search.png)

Der Screenshot zeigt den gebauten Mobile-Stand in einer iPhone-großen Browseransicht, kein physisches iPhone.

## Warum eine Datei nicht geladen wurde

Desktop und Mobile zeigen einen kompakten Hinweis. **Details** nennt betroffene Pfade und die Ursache, etwa ungültige YAML-Kopfdaten oder fehlenden Dateizugriff. Bei einem YAML-Fehler beziehen sich Zeile und Spalte auf den YAML-Block.

- Mit **×** blendest du den Hinweis aus. Du kannst ihn später wieder öffnen.
- Korrigiere die Quelldatei beziehungsweise den Dateizugriff und wähle **Erneut prüfen**.
- Eine beim Laden übersprungene Datei erhält erst nach erfolgreichem Laden einen Knoten.

In Obsidian bleibt bei einer fehlgeschlagenen Inhaltsvorschau der Dateiknoten sichtbar. Der Hinweis erklärt die Ursache; du kannst ihn ausblenden und die Vorschau erneut versuchen. Noch nicht geladene Inhalte sind nicht durchsuchbar.

![Obsidian in mobiler Emulation: Die Suche findet Projekt; der Treffer ist in der Karte ausgewählt und zentriert](/releases/obsidian-0.8.0-node-search.png)

Dieser Screenshot stammt aus echtem Obsidian mit mobiler Emulation. Zusätzlich wurde die Prüfliste für 0.8.0 auf einem iPad Pro 11″ mit Obsidian 1.15 einschließlich Suche, Navigation und Pencil-Bedienung bestätigt.

## Verfügbare Versionen

- **Desktop:** [Version 0.6.1 herunterladen](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.1). Mehr zur Einrichtung in der [Desktop-Hilfe](/docs/desktop).
- **Obsidian:** [Plugin 0.8.0](https://github.com/moellenbeck-digital/bloommd-obsidian/releases/tag/0.8.0), ab Obsidian 1.13. Für BRAT lautet das Repository `moellenbeck-digital/bloommd-obsidian`. Bei manueller Installation gehören `manifest.json`, `main.js`, `shared-runtime.js` und `styles.css` gemeinsam in `.obsidian/plugins/bloommd/` des Vaults; danach das Plugin neu laden beziehungsweise aktivieren.
- **iOS:** 1.1.0 wurde zu App Store Connect hochgeladen. Die Verteilung über TestFlight folgt nach Apples Verarbeitung; damit ist keine öffentliche App-Store-Freigabe angekündigt.
- **Android:** Das signierte App Bundle (AAB) für 1.1.0 ist gebaut. Der Google-Play-Upload ist zurückgestellt; ein AAB lässt sich nicht direkt als App installieren.
