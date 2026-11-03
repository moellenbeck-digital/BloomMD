---
title: Export und Import
description: Alle Exporte sind frei – Markdown, OPML, PDF, PNG und SVG. Deine Dateien gehören dir.
order: 9
draft: true
---

# Export und Import

**Deine Dateien gehören dir.** Jeder Export steht jedem Nutzer zur Verfügung, ohne Abo und ohne
Sperre. Das Export-Menü ist auf allen Plattformen gleich aufgebaut.

## Das Export-Menü

Der Export-Knopf in der Werkzeugleiste (auf dem Handy der Teilen-Knopf oben rechts) oder **Cmd/Strg+E** öffnet das Menü:

| Eintrag | Ergebnis |
| --- | --- |
| **Markdown (.md)** | `<Titel>.md` – die Datei, wie sie ist |
| **OPML (.opml)** | `<Titel>.opml` – Überschriften als verschachtelte Outlines, Notizen im Attribut `_note` |
| **PDF (.pdf)** | die aktuelle Karte als eine PDF-Seite |
| **PNG (.png)** | die aktuelle Karte als Bild |
| **SVG (.svg)** | die aktuelle Karte als Vektordatei: Verbindungen als Pfade, Knoten als Text |

PNG, SVG und PDF zeigen die Karte ohne Griffe, Aktionsleisten und Auswahl. Die Workspace-Ansicht (Übersicht über viele Dateien) wird nicht als einzelne
Datei exportiert; öffne dafür eine Datei.

## Wo die Datei landet

- **Web-App:** normaler Browser-Download.
- **Desktop:** der Ordner Downloads; die Datei wird dort angezeigt. Bereits vorhandene Dateien
  werden nie überschrieben, es entsteht `Name (1).ext`.
- **Mobile:** der Teilen-Dialog des Geräts, z. B. „In Dateien sichern“, AirDrop oder Mail.
- **Obsidian-Plugin:** Export-Symbol in der Karte; die Datei liegt im Anhangsordner der Notiz.

## OPML importieren

Wer von MindNode, Xmind oder einem anderen Outliner wechselt, importiert die OPML-Datei: In der
Werkzeugleiste (Web, Desktop) bzw. im Dateimenü (Mobile) **Importieren** wählen und eine `.opml`-Datei öffnen. Daraus
entsteht eine neue Karte, benannt nach der Datei. `text` wird zur Überschrift, `_note` zum Inhalt
darunter. Im Obsidian-Plugin legt der Befehl **Import OPML** eine neue Notiz an.

Beim Import gilt:

- Mehr als sechs Ebenen kennt Markdown nicht; tiefere Outlines werden als Aufzählung in der
  sechsten Ebene übernommen.
- Leere oder kaputte Dateien, Dateien ohne Outlines und Outlines ohne `text` werden mit einer
  klaren Meldung abgelehnt; es wird nichts angelegt.
- Eine Dokumenttyp-Deklaration (DOCTYPE) und externe Entities werden nie aufgelöst.
