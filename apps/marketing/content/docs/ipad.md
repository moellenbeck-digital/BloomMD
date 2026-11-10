---
title: BloomMD auf iPad und iPhone
description: Die BloomMD-App für iPad und iPhone – Obsidian-Vault direkt bearbeiten, Handschrift mit dem Apple Pencil, optionale Anmeldung, Hilfe und Kontakt.
order: 7
draft: true
---

# BloomMD auf iPad und iPhone

Die App zeigt Markdown-Notizen als Mind Map: Jede Überschrift ist ein Knoten, die Datei bleibt eine
gewöhnliche Markdown-Datei. Sie läuft auf iPad und iPhone und auf Macs mit Apple Silicon und folgt
der Gerätesprache (Deutsch oder Englisch). Voraussetzung ist iOS bzw. iPadOS 15 oder neuer.

## Einrichtung

1. BloomMD aus dem App Store laden und öffnen. Ein Konto brauchst du nicht, die App funktioniert
   auch ohne Internetverbindung.
2. Ohne Ordnerauswahl liegen deine Maps im App-eigenen Ordner auf dem Gerät (*Auf diesem Gerät*).
   *Neu* legt eine Map an, *Import* übernimmt eine Markdown- oder OPML-Datei (bis 10 MB).
3. Wer schon einen Obsidian-Vault hat, öffnet ihn wie unten beschrieben.

## Einen Ordner öffnen

Seitenmenü → *Ordner öffnen* → in der Dateien-App den Ordner wählen, zum Beispiel deinen
Obsidian-Vault in iCloud Drive. BloomMD bearbeitet die Notizen dort, wo sie liegen: ohne Import,
ohne Kopie. Der Ordner bleibt nach einem Neustart geöffnet. Notizen, die iCloud noch nicht auf das
Gerät geladen hat, werden nachgeladen. *Nur hier* wechselt zurück in den App-eigenen Ordner.

Ob und wohin der Ordner synchronisiert wird (iCloud Drive, Nextcloud, Syncthing …), regelt der
jeweilige Speicheranbieter, nicht BloomMD.

## Gespeichert wird nur, was du änderst

Öffnen schreibt keine Notiz um. Hat ein anderes Gerät die Notiz inzwischen geändert oder gelöscht,
überschreibt BloomMD sie nicht: Deine Fassung landet als „… (iPad-Konflikt).md“ daneben, die
Version vom anderen Gerät wird geöffnet, und du bekommst einen Hinweis.

## Map, Gliederung, Präsentation

Mit den Canvas-Modi wechselst du zwischen Mindmap, Gliederung und Präsentation. Auf dem iPad öffnet sich der
Knoten-Editor als Seitenleiste neben der Map, auf dem iPhone als Fenster am unteren Rand. Knoten
können Aufgaben (Status, Fälligkeit) oder Entscheidungen sein.

## Mit dem Apple Pencil schreiben

Öffne den Knoten-Editor eines Knotens (in der Gliederung die Zeile antippen) und wähle im Abschnitt
*Handschrift* → *Neue Zeichnung*. Mit dem Stift zeichnest du mit Druck, mit dem Finger verschiebst
und zoomst du, ein aufgelegter Handballen zeichnet nicht. Werkzeuge: Pen, Highlighter, Eraser,
Lasso (verschieben, skalieren, löschen) und Text; handschriftliche Wörter lassen sich mit anderen
Notizen verknüpfen.

Jede Zeichnung ist eine SVG-Datei neben deinen Notizen und wird im Knoten eingebettet. Das
BloomMD-Plugin für Obsidian zeigt dieselben Zeichnungen und öffnet sie zum Weiterzeichnen.

## Teilen und Exportieren

Das Teilen-Symbol oben öffnet das System-Teilen-Menü: Die Map als Markdown, OPML, PDF, PNG oder SVG
(zum Beispiel „In Dateien sichern“). Nichts davon ist gesperrt.

## Anmeldung mit einem BloomMD-Konto (optional)

Für lokale Ordner brauchst du kein Konto. Mit einem BloomMD-Konto (Beta) bearbeitest du Maps aus
deinen Cloud-Workspaces gemeinsam in Echtzeit.

1. Seitenmenü → *Anmelden*. BloomMD öffnet die Anmeldeseite im Browser; dein Passwort gibst du nur
   dort ein. Ein Konto lässt sich auf dieser Seite auch anlegen.
2. Prüfe die Rückfrage („BloomMD-App auf … verbinden?“) und bestätige sie. Die App kehrt zurück.
3. *Verbinden* öffnet die Cloud-Maps. *Lokal arbeiten* wechselt zurück zu den Dateien auf dem Gerät.
4. *Abmelden* widerruft den Zugang auf dem Server und löscht ihn auf dem Gerät. Der Zugang liegt im
   Schlüsselbund des Geräts und gilt ein Jahr; du kannst ihn auch im Konto unter *Desktop- und
   Agenten-Zugriff* widerrufen.

Selbst gehostete Server trägst du unter *Erweitert: eigener Server* ein (nur `https://`).
*Konto verwalten oder löschen* öffnet die Kontoseite; dort lässt sich das Konto samt Cloud-Daten
dauerhaft löschen.

## Links in die App

`bloommd://open?path=Ordner/Notiz.md&node=<id>` öffnet eine Notiz des geöffneten Ordners am Knoten
– zum Beispiel aus Kurzbefehlen oder anderen Notizen.

## Kontakt und Hilfe

Fragen, Fehler, ein Problem mit der Anmeldung: schreibe an `feedback@bloommd.io` (bitte Gerät,
iOS-Version und App-Version nennen). Anbieter und Datenschutz: [Impressum](/impressum), [Datenschutzerklärung](/datenschutz).
