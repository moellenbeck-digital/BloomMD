---
title: Zusammenarbeit
description: Wie zwei Tester dieselbe BloomMD-Datei gemeinsam bearbeiten.
order: 4
---

# Zusammenarbeit

Mehrere Personen können dieselbe Markdown-Datei gleichzeitig in BloomMD bearbeiten. Für die Closed
Beta passiert das über einen Cloud-Workspace: alle Beteiligten melden sich mit ihrem Beta-Account an
und öffnen dieselbe Datei.

> **Kurz gesagt:** Zusammenarbeit heißt in BloomMD nicht „Datei per E-Mail weitergeben“, sondern
> dieselbe Cloud-Datei öffnen. Änderungen werden über Yjs zusammengeführt, statt sich gegenseitig zu
> überschreiben.

## Welche Variante brauchst du?

- **Zwei Personen arbeiten im Browser:** Web-App + Cloud-Workspace. Beide brauchen eigene
  Beta-Accounts.
- **Eine Person im Browser, eine in der Mac-App:** Web-App + Mac-App im Server-Modus. Die Mac-App
  braucht ein persönliches Token.
- **Nur lokale Dateien auf deinem Rechner:** Lokaler Desktop-Modus. Keine automatische
  Zusammenarbeit, kein Upload.

## Zwei Personen in der Web-App

### Ablauf

1. Person A meldet sich auf `https://bloommd.app` an.
2. Person A öffnet die App und legt im Cloud-Workspace eine Markdown-Datei an.
3. Person B meldet sich mit einem eigenen Beta-Account auf `https://bloommd.app` an.
4. Beide wählen denselben Workspace und dieselbe Datei.
5. Beide prüfen, ob farbige Präsenzpunkte an Nodes sichtbar sind und der Sync-Status verbunden ist.
6. Beide bearbeiten unterschiedliche Nodes oder denselben Markdown-Text.
7. Beide laden die Seite neu und prüfen, ob die Änderung erhalten bleibt.

### Woran du erkennst, dass es funktioniert

- Präsenzpunkte erscheinen an Nodes, wenn die andere Person in derselben Datei ist.
- Änderungen tauchen ohne manuelles Kopieren im zweiten Fenster auf.
- Nach Reload bleibt der letzte gespeicherte Stand erhalten.

> **Wenn Person B den Workspace nicht sieht:** Der Account ist noch nicht für denselben Workspace
> freigeschaltet. Melde das über den Feedback-Button in der App oder antworte auf deine
> Beta-Einladung mit der E-Mail-Adresse der zweiten Person.

## Cloud-Workspace benennen

Der aktive Cloud-Workspace steht oben in der App-Leiste als **Cloud**-Chip. Besitzer können den
Namen dort über das Stift-Symbol ändern. Ein lokaler Browser-Ordner wird separat als **Lokal**
markiert, damit du beim Testen nicht versehentlich Cloud-Collaboration und lokale Dateien
verwechselst.

## Web-App und Mac-App gemeinsam

Das funktioniert, wenn die Mac-App mit demselben Cloud-Server verbunden ist. Ein lokal geöffneter
Ordner in der Mac-App reicht dafür nicht.

### Verbindung einrichten

1. Öffne in der Web-App `Account` und erzeuge unter **Desktop-Zugriff** ein persönliches Token.
   Kopiere es sofort; es wird nur einmal vollständig angezeigt.
2. Starte die macOS-Desktop-App.
3. Öffne links die Dateiliste und wähle **Mit Server verbinden**.
4. Trage als Server-URL `https://bloommd.app` ein.
5. Füge das persönliche Token ein und verbinde die App.
6. Öffne in der Mac-App dieselbe Cloud-Datei wie im Browser.
7. Prüfe, ob Präsenzpunkte und Änderungen in beiden Fenstern sichtbar werden.

### Lokaler Desktop-Modus

Der lokale Desktop-Modus arbeitet bewusst ohne Konto und ohne Upload. Wenn du einfach einen lokalen
Ordner öffnest, bleibt alles auf deinem Rechner. Für WebApp + MacApp muss die Mac-App im
Server-Modus verbunden sein.

## Feedback beim Testen

Nutze für Probleme den Feedback-Button in der App. Ein Screenshot ist Pflicht, weil wir Sync-,
Ordner- und Panel-Probleme schneller zuordnen können. Wenn die App gar nicht erreichbar ist,
antworte auf deine Beta-Einladungs-Mail oder schreibe an `feedback@bloommd.io`.

Bitte lade keine echten Zugangsdaten, Tokens oder personenbezogenen Daten Dritter hoch. Ein kleines
Markdown-Beispiel reicht meistens.

## Typische Fehler

- **Die zweite Person sieht den Workspace nicht.** Der Account ist nicht für denselben Workspace
  freigeschaltet. Sende Feedback oder antworte auf die Beta-Mail.
- **Die Mac-App zeigt nur lokale Dateien.** Sie ist nicht im Server-Modus verbunden. Öffne
  **Mit Server verbinden** und trage `https://bloommd.app` plus Token ein.
- **Präsenz fehlt nach Schlafmodus oder Netzwerkwechsel.** Die Verbindung wurde unterbrochen.
  Öffne die Datei neu oder trenne die Server-Verbindung und verbinde sie erneut.
- **Neue Dateien anderer Teilnehmer fehlen.** In der Beta kann die Dateiliste einen Reload brauchen.
  Änderungen in bereits geöffneten Dateien sollten dagegen live erscheinen.

## Was der Server prüft

Jede Verbindung braucht ein **kurzlebiges Ticket** (fünf Minuten), signiert und gebunden an Nutzer,
Workspace, Dokument, Dateiname und Berechtigung.

Der Server prüft zusätzlich:

- Eine gültige Signatur für jemanden, der nicht Mitglied des Workspace ist, wird abgewiesen.
- Ein Ticket, das `write` behauptet, während die Datenbank `viewer` sagt, wird serverseitig auf
  Lesen herabgestuft.
- Abgelaufene Tickets, manipulierte Signaturen und nicht erlaubte Origins werden abgewiesen.

Diese Fälle sind gegen einen laufenden Server mit echter Datenbank geprüft, nicht nur in Unit-Tests.

## Grenzen der Beta

Genau **eine** Sync-Instanz. Mehrere Replicas bräuchten verteilte Raumkoordination, die es nicht
gibt — zwei Instanzen würden Bearbeiter desselben Dokuments auf getrennte, nicht abgeglichene Räume
verteilen. Das Release-Gate lehnt eine solche Konfiguration ab, statt den Fehler erst im Betrieb
sichtbar werden zu lassen.
