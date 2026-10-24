---
title: "BloomMD Web-App 0.5: Maps mit Lese-Links teilen, Aufgaben direkt am Knoten"
description: "Kolleg:innen sehen eine Map ohne Konto. Knoten zeigen Fälligkeit, Verantwortliche und Entscheidungen."
date: 2026-10-19
commitDate: 2026-10-19
tags:
  - Release
  - Web-App
version: "0.5.0"
---

# BloomMD Web-App 0.5: Maps mit Lese-Links teilen, Aufgaben direkt am Knoten

Eine Map ist oft die schnellste Art, einem Team einen Stand zu erklären – aber bisher brauchte
dafür jede Person ein BloomMD-Konto. Ab Web-App 0.5 erstellst du einen
**Lese-Link**: Wer ihn hat, sieht die Map ohne Anmeldung, wahlweise als Map oder als
Gliederung, nur lesend.

Du findest die Lese-Links über das Ketten-Symbol in der Werkzeugleiste einer Cloud-Map. Dort
legst du fest, wie lange ein Link gilt (1, 7, 30 oder 90 Tage), siehst alle Links der Map und
widerrufst sie – ein widerrufener Link funktioniert sofort nicht mehr. Ein Lese-Link zeigt nur
Titel, sichtbaren Text und Aufgaben-Infos; Frontmatter, Kommentare und Anhänge bleiben privat.
Suchmaschinen indexieren geteilte Maps nicht.

**Aufgaben und Entscheidungen am Knoten:** Im Knoten-Editor bekommt eine Aufgabe jetzt ein
Fälligkeitsdatum und eine verantwortliche Person, eine Entscheidung ihren Stand
(vorgeschlagen, angenommen, abgelehnt). Die Map und der Lese-Link zeigen das direkt am Knoten –
so ist auf einen Blick klar, wer was bis wann erledigt.

![Geteilte BloomMD-Map in der Gliederungsansicht mit Aufgaben, Fälligkeiten, Verantwortlichen und Entscheidungen](/releases/web-0.5.0-share-outline.png)

Außerdem in 0.5:

- Obsidian-Links `[[Notiz]]` und eingebettete Zeichnungen bleiben erhalten, wenn ein Knoten im
  Editor geöffnet wird. Zuvor konnte schon das Öffnen sie in der Datei unbrauchbar machen.
- Sicherheitsupdates für mehrere Abhängigkeiten und strengere Grenzen für Zugriffstoken.
- Grundlagen für die kommende BloomMD-App auf iPad, iPhone und Android sowie für KI-Agenten,
  die Notizen mit eigenen, begrenzten Rechten einpflegen. Beides stellen wir gesondert vor,
  sobald es verfügbar ist.

[Zur App](https://bloommd.app) · [Hilfe](/docs)
