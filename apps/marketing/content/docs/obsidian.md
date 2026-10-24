---
title: Obsidian-Plugin
description: Markdown-Notizen in Obsidian als Map bearbeiten, mit Handschrift im Knoten-Inspector – auf dem Mac und als Beta auf dem iPad.
order: 5
draft: true
---

# Obsidian-Plugin

Das BloomMD-Plugin zeigt eine Obsidian-Notiz als Map. Jede Überschrift ist ein Knoten, die Datei
bleibt eine normale Markdown-Datei in deinem Vault.

## Installation

- **Obsidian auf dem Mac, Windows oder Linux:** über BRAT mit dem Repository
  `moellenbeck-digital/bloommd-obsidian` oder durch Kopieren von `manifest.json`, `main.js`,
  `shared-runtime.js` und `styles.css` nach `.obsidian/plugins/bloommd/`.
- **Obsidian auf dem iPad (Beta):** ab Version 0.6.0. Installation ebenfalls über BRAT. Die
  Mobile-Unterstützung ist eine Beta; bekannte Grenzen stehen unten.

Befehle: **Visualize current note** öffnet die aktuelle Notiz als Map, **Visualize current folder**
den Ordner.

## In BloomMD Desktop öffnen

**Open app** (Pfeil-Symbol in der Toolbar) öffnet die Notiz in BloomMD Desktop, direkt am
ausgewählten Knoten. Eingeklappte Zweige darüber klappen auf. Läuft die App schon, wechselt sie zur
Notiz und kommt nach vorn. Auf macOS und Linux (installiertes Paket) startet das Plugin BloomMD mit
der Notiz, wenn die App noch nicht läuft. Unter Windows bitte BloomMD Desktop zuerst starten und
dann **Open app** wählen. Übergeben werden nur Dateipfad und Knoten-ID, kein Notizinhalt. Findet
das Plugin die App nicht, sagt ein Hinweis das und verlinkt den Download. Auf iPad und iPhone
erscheint der Knopf, sobald in den Plugin-Einstellungen *BloomMD app on this iPad* an ist – die
BloomMD-App muss dafür denselben Vault als Ordner geöffnet haben (Beta).

## Handschrift im Knoten

1. Einen Knoten auswählen und **Edit content** öffnen.
2. Im Inspector auf **Handwriting** wechseln und **New drawing** wählen. Ein schmaler Inspector
   wechselt dafür automatisch in den Vollbildmodus; der Umschalter oben rechts funktioniert jederzeit.
3. Schreiben oder zeichnen:
   - **Apple Pencil** oder Maus zeichnen, der Druck des Stifts verändert die Strichstärke.
   - **Finger** verschieben die Fläche, zwei Finger zoomen. Die aufgelegte Hand verschiebt nichts,
     auch wenn sie einen Moment vor der Stiftspitze aufliegt.
   - Auf Geräten ohne Stift lässt sich **Mit Finger zeichnen** (Hand-Symbol) einschalten.
4. Werkzeuge: Stift, Textmarker, Radierer (ganzer Strich), Lasso, fünf Farben, drei Stärken,
   Rückgängig/Wiederholen und **Fit drawing**.
5. **Done** speichert und kehrt zum Text zurück. Gespeichert wird zusätzlich automatisch.

Die Zeichnung landet als SVG-Datei im Anhangsordner deines Vaults und wird im Knoten als
`![[Notiz ink.svg]]` eingebettet. Obsidian zeigt sie deshalb überall an – auch ohne Plugin und auf
Geräten, auf denen BloomMD nicht installiert ist.

### Nachträglich ändern

Mit dem **Lasso** Geschriebenes umkreisen. Die Auswahl lässt sich verschieben, über die Ecken
proportional skalieren, umfärben oder löschen.

### Handschrift mit Notizen verknüpfen

Die Map soll Zusammenhänge zeigen, Details bleiben in eigenen Notizen:

1. Ein Wort oder Symbol mit dem Lasso auswählen.
2. **Link to note** wählen und eine Notiz aus dem Vault aussuchen.

Das verknüpfte Wort ist gestrichelt unterstrichen. Fährt man in der Vorschau mit Maus oder Apple
Pencil (Hover auf unterstützten iPads) darüber, zeigt Obsidian die Seitenvorschau; ein Tippen oder
Klicken öffnet die Notiz. BloomMD ergänzt die Verknüpfung zusätzlich als `[[Notiz]]` im Knoten, damit
Graph, Rückverweise und Umbenennen in Obsidian sie kennen. Wird die Notiz umbenannt, zieht die
Zeichnung mit.

## Concept Map: Knoten, Notizen und Verbindungen

Die Map zeigt Zusammenhänge, Details stehen in eigenen Notizen.

- **Knoten mit einer Notiz verknüpfen:** Knoten wählen → **Edit content** → **Link a note**. Am Knoten
  erscheint ein Notiz-Symbol; Tippen öffnet die Notiz, Hover mit Maus oder Apple Pencil zeigt die
  Seitenvorschau. BloomMD ergänzt zusätzlich `[[Notiz]]` im Knoten.
- **Beliebige Knoten verbinden:** Im Inspector unter **Connections** einen anderen Knoten wählen, optional
  eine Beschriftung eintragen und hinzufügen. Verbindungen erscheinen gestrichelt, unabhängig von der
  Überschriften-Struktur.
- **Verschieben:** Knoten mit Maus, Finger oder Pencil ziehen. Die Position bleibt gespeichert, Verbindungen
  wandern mit, die Notiz selbst ändert sich dabei nicht.
- **Größe ändern:** Knoten auswählen und an den Ecken ziehen; **Reset size** stellt die Standardgröße wieder her.

Verknüpfte Notizen und Verbindungen stehen im Markdown des Knotens und bleiben auch beim Bearbeiten in den
BloomMD-Apps erhalten. Positionen und Größen speichert das Plugin je Notiz.

## Fokusmodus und Präsentation

- **Fokusmodus** (Symbol in der Toolbar oder Befehl **Toggle focus mode**) legt die Map über das ganze
  Obsidian-Fenster, auch in der geteilten Ansicht auf dem iPad. **Esc** oder das Symbol beendet ihn.
- Der **Präsentationsmodus** zeigt Knoteninhalte wie Obsidian – Zeichnungen als Bild, Links klickbar.

## Direkt auf der Map schreiben

**Draw on map** (Signatur-Symbol in der Toolbar) schaltet den Zeichenmodus ein: Apple Pencil oder Maus
schreiben direkt auf der Map, Finger verschieben und zoomen weiter. Stift, Textmarker, Radierer, Lasso
und Rückgängig funktionieren wie im Knoten. Ein Strich, der auf einem Knoten beginnt und auf einem
anderen endet, legt eine **Verbindung** zwischen beiden an. Die Zeichnung wird als eigene SVG-Datei
gespeichert und über die Eigenschaft `bloommd-map-ink` der Notiz verknüpft. **Esc** oder **Done**
beendet den Zeichenmodus. Während der Stift schreibt, bleiben Map und Knoten still, auch wenn die Hand
aufliegt.

### Alles mit dem Stift

Im Zeichenmodus lässt sich die ganze Map mit dem Apple Pencil (oder der Maus) bedienen:

| Geste | Wirkung |
|---|---|
| Kurz auf einen Knoten tippen | Knoten auswählen |
| Zweimal auf einen Knoten tippen | Inhalt öffnen (Inspector) |
| Stift auf einem Knoten halten und loslassen | Knoten-Menü |
| Stift auf einem Knoten halten, dann ziehen | Knoten verschieben |
| Linie von Knoten zu Knoten | Verbindung |
| Gerade Linie von einem Knoten ins Freie | Neuer Unterknoten am Ende der Linie, Titel gleich eintippen oder per Scribble schreiben |
| Zickzack über Tinte | Tinte durchstreichen und löschen |
| Tinte mit dem Lasso wählen, dann **New node from selection** | Neuer Knoten mit dieser Handschrift an ihrer Stelle |

## Handschrift zu Text und zu Knoten

- Das Werkzeug **Text** setzt ein Textfeld auf die Zeichnung. Auf dem iPad schreibst du mit dem Pencil
  hinein, iPadOS-Scribble macht daraus Text.
- Geschriebenes per Lasso auswählen und **New node from selection** wählen: Es entsteht ein Kindknoten
  mit eigener Zeichnung; ein Textfeld in der Auswahl wird zum Knotentitel.
- Zeichnungen haben wählbares **Papier, dunkles Papier oder einen transparenten** Hintergrund.

## Knoten-Menü, Lernmodus und Export

- **Langes Drücken** (iPad) bzw. **Rechtsklick** auf einen Knoten öffnet ein Menü mit allen Aktionen.
- **Lernmodus** (Hut-Symbol): Knoteninhalte sind verdeckt, Tippen deckt sie einzeln auf.
- **Export** (Bild-Symbol): die ganze Map als PNG oder PDF im Anhangsordner.

## Lernfortschritt auf der Map

Im Lernmodus bewertest du jeden aufgedeckten Knoten selbst: standardmäßig **New**, **Unsure** und
**Got it**, wahlweise fünf Stufen mit eigenen Namen. Tippe mit Apple Pencil oder Finger, klicke, oder
nutze die Tastatur: **Leertaste** deckt den ausgewählten Knoten auf, **1–5** bewerten ihn und springen
zum nächsten.

- **Auf der Map** zeigt jeder Knoten seine Stufe als farbigen Rand, Füllung oder Badge (oder gar
  nicht). Fällige Knoten tragen die Marke **Due**; auf Wunsch zeigt jeder Zweig, wie viel davon sitzt.
- **In der Lernleiste** stehen z. B. „12/30 mastered · 5 due“, die Reihenfolge (fällige zuerst, nur
  fällige, nur unsichere), **Next** und ein optionales Prüfungsdatum mit verbleibenden Tagen und wie
  viele Knoten du pro Tag schaffen musst.
- **Wiederholung in Abständen** (abschaltbar): Jede Stufe hat ein Intervall in Tagen (Standard New 0,
  Unsure 1, Got it 4). Mehrmals hintereinander „Got it“ verlängert das Intervall jeweils um den Faktor
  2,5 (4 → 10 → 25 → 63 Tage, höchstens 180); eine schlechtere Bewertung setzt es zurück.
- **Gespeichert** wird der Fortschritt nicht in der Notiz, sondern im Vault unter
  `.bloommd/learning/` – er wandert also mit dem Vault (z. B. über iCloud) zwischen Mac und iPad.
  Bewertungen hängen an der Knoten-ID; Umbenennen von Knoten oder Notiz verliert nichts, und zwei
  Geräte überschreiben sich nicht gegenseitig. Obsidian Sync überträgt versteckte Ordner nicht.
- Alles stellst du unter **Einstellungen → BloomMD → Learning** ein, dort lässt sich der Fortschritt der
  geöffneten Map auch zurücksetzen.

## Grenzen

- **Shared Mode** (Zusammenarbeit) ist vorerst nur auf dem Desktop verfügbar.
- Gesten des **Apple Pencil Pro** (Drücken, Drehen) und der Doppeltipp stehen Plugins in Obsidian
  nicht zur Verfügung; Werkzeuge wechselst du über die Leiste.
- Eine **Erkennung bereits gezeichneter Tinte** gibt es noch nicht; für Text nutzt du Textfelder mit Scribble.
- Wählst du beim Umbenennen einer Notiz in Obsidian „Nicht aktualisieren“, zeigt die Zeichnung auf die
  neue Notiz, das `[[…]]` im Knoten bleibt aber alt.
