---
title: Anleitung
---

# Anleitung zum Testen

Dieser Ordner ist **absichtlich** so gebaut, dass er jeden Grenzfall enthält. Er liegt in git —
das ist der Trick beim Testen:

```bash
# Nach dem Speichern in BloomMD:
git diff test-vault
```

Erwartet werden **nur** `<!-- bloommd:id=… -->`-Kommentare. Alles andere ist ein Fehler.

## Was hier absichtlich drin ist

| Datei | Enthält |
|---|---|
| `Buch/Teil-1/Kapitel 1.md` | Callouts, Task-Listen, Tag, Block-Referenz, Wiki-Link **im Code-Block** |
| `Buch/Teil-1/Kapitel 2.md` | Tabelle, verschachtelte Task-Liste, Link mit Alias |
| `Buch/Teil-2/Kapitel 3.md` | Zweiter Unterordner, Bild-Verweis, fehlende Datei |
| `Konzepte/Speicherung.md` | Setext-Überschriften (beide Stile) |
| `Personen/Ada Lovelace.md` | Ziel mehrerer Backlinks |
| `Personen/Charles Babbage.md` | Isolierter Knoten ohne Verbindungen |
| `Mehrdeutig.md` | `[[Notiz]]` — zwei Dateien heißen so, darf **nicht** geraten werden |
| `README.md` | `[[Gibt Es Nicht]]` — muss als defekt erscheinen |

## Erwartete Zahlen in der Workspace-Karte

- 5 Ordner, 12 Dateien
- 15 aufgelöste Verweise
- **1** defekter Link (`[[Gibt Es Nicht]]`)
- **1** mehrdeutiger Link (`[[Notiz]]`)

Weichen die Zahlen ab, stimmt etwas nicht.
