---
title: Lokal oder Cloud
description: Was auf deinem Rechner bleibt, was in die Cloud geht und wann Zusammenarbeit greift.
order: 3.5
---

# Lokal oder Cloud

BloomMD arbeitet auf zwei Arten: **lokal** mit Dateien auf deinem Rechner und **in der Cloud** mit
Dokumenten auf dem Server. Ob etwas die Cloud erreicht, hängt davon ab, wo du die Datei öffnest und
ob du sie bewusst teilst — nie vom bloßen Öffnen.

## Auf einen Blick

| Du arbeitest mit | Wo liegen die Dateien | Konto nötig | Upload | Zusammenarbeit |
|---|---|---|---|---|
| [Desktop-App](/docs/desktop), lokaler Ordner | auf deinem Rechner | nein | nein | nein |
| [Web-App](/docs/web), lokaler Ordner im Browser | auf deinem Rechner | Anmeldung für `/app` | nein | nein |
| [Browser-Demo](/demo) | im Browser, bis du sie herunterlädst | nein | nein | nein |
| [Obsidian-Plugin](/obsidian) | in deinem Vault | nein | nein | nein |
| [Web-App](/docs/web), Cloud-Workspace | in der Datenbank des Servers | ja | ja | ja |

## Was lokal bleibt

- **Desktop-App:** arbeitet vollständig lokal, ohne Konto und ohne Netzwerk. Die Markdown-Datei
  bleibt eine gewöhnliche Datei in deinem Ordner.
- **Lokaler Ordner in der Web-App:** Du öffnest den Ordner über die File System Access API des
  Browsers. Es wird nichts hochgeladen, auch keine Anhänge oder PDFs.
- **Browser-Demo:** Dein Markdown bleibt im Browser, solange du es nicht herunterlädst.
- **Obsidian-Plugin:** bearbeitet die Notizen deines Vaults, ohne BloomMD-Konto.

![Schema, kein Screenshot: Dieselbe Markdown-Datei im Obsidian-Vault erscheint in Obsidian als Text und über das BloomMD-Plugin als Karte](/docs/obsidian-flow.svg)

## Was in die Cloud geht

Nur, was du ausdrücklich in einen Cloud-Workspace bringst:

- **Markdown importieren** in der Web-App legt die Datei als Cloud-Dokument im gewählten Workspace
  an.
- **Diese lokale Datei teilen** (Desktop-App) legt genau diese eine Datei als Cloud-Dokument an. Es
  wird kein Ordner und keine weitere Datei hochgeladen.
- **Ordner als gemeinsamen Workspace veröffentlichen** (Desktop-App) überträgt nur die Markdown-Dateien,
  die du in der Vorschau angehakt lässt. Die lokalen Dateien bleiben die Quelle, der Ordnerpfad
  verlässt dein Gerät nicht.

Lade in der Beta keine Zugangsdaten, Secrets, personenbezogenen Daten Dritter oder
produktionskritischen Inhalte hoch. Für Cloud-Daten gibt es keine Wiederherstellungszusage.

## Wann Zusammenarbeit greift

Zusammenarbeit gibt es nur für **Cloud-Dokumente**. Mehrere Personen öffnen dieselbe Cloud-Datei in
einem Team-Workspace, jede mit eigenem Account; ihre Änderungen werden zusammengeführt, statt sich
zu überschreiben. Rollen im Workspace: **Owner** und **Editor** bearbeiten, **Viewer** sieht nur zu.

Eine rein lokale Datei wird dadurch nicht automatisch geteilt. Erst **Diese lokale Datei teilen**
oder das Veröffentlichen eines Ordners macht sie zum Cloud-Dokument.

Den vollständigen Ablauf beschreibt [Zusammenarbeit](/docs/collaboration).

## Welchen Weg wählen?

- **Du willst nur mit eigenen Dateien arbeiten:** Desktop-App oder lokaler Ordner in der Web-App.
- **Du willst BloomMD ausprobieren:** [Browser-Demo](/demo), ohne Konto.
- **Du willst mit anderen an derselben Datei arbeiten:** Cloud-Workspace. Das Konto legst du unter
  [Closed-Beta Zugang](/docs/closed-beta-zugang) an.
