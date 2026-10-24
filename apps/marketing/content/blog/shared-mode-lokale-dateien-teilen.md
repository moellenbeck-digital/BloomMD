---
title: "Eine lokale Markdown-Datei teilen — ohne den Ordner freizugeben"
description: "Shared Mode verbindet genau eine bewusst ausgewählte lokale Datei mit einem BloomMD-Workspace und macht Grenzen, Rollen und Zustände sichtbar."
date: 2026-09-22
tags:
  - Shared Mode
  - Zusammenarbeit
  - Markdown
  - Desktop
  - Obsidian
draft: false
---

# Eine lokale Markdown-Datei teilen — ohne den Ordner freizugeben

Lokale Markdown-Dateien sind oft genau deshalb wertvoll, weil sie in einem eigenen Ordner, Vault
oder Git-Repository liegen. Zusammenarbeit soll diese Grenze nicht auflösen. Wer nur ein Kapitel
besprechen möchte, muss weder den gesamten Vault hochladen noch Kopien per E-Mail verteilen.

Shared Mode in BloomMD nimmt diese Grenze ernst: Du teilst bewusst **eine Datei** mit **einem
Workspace**. Nicht den Ordner. Nicht alle Markdown-Dateien. Nicht den lokalen Pfad.

## Der Moment der Freigabe ist sichtbar

Der Ablauf startet an einer geöffneten lokalen Datei in der Desktop-App:

1. Wähle **Diese lokale Datei teilen**.
2. Wähle ein vorhandenes Server-Profil und den Workspace.
3. Prüfe den vorgeschlagenen Cloud-Dateinamen.
4. Bestätige die Freigabe.

Erst die letzte Bestätigung legt das zugehörige Cloud-Dokument an und bindet es an die lokale
Markdown-Datei. Der Server kennt dabei Workspace-ID, Cloud-Dokument-ID und Cloud-Dateiname. Der
Pfad auf deinem Rechner, der Ordnername und benachbarte Dateien bleiben lokal.

![BloomMD Desktop zeigt einen Konflikt zwischen einer lokalen Markdown-Datei und dem zugehörigen Cloud-Dokument mit den expliziten Entscheidungen „Cloud-Version verwenden“ und „Lokale Version beibehalten“](/blog/shared-mode-conflict-desktop.png)

*Geprüfter Screenshot der BloomMD-Desktop-App: Bei einem Konflikt wird nichts automatisch
überschrieben. Die Person wählt bewusst, welcher Stand weitergeführt wird.*

Diese bewusste Auswahl macht einen praktischen Unterschied: Ein Buch-Vault kann lokal bleiben,
während nur `Kapitel 3.md` für ein Lektorat freigegeben wird. Ein Projektordner kann in Git liegen,
während nur ein Entscheidungsdokument gemeinsam bearbeitet wird.

## Status ist eine Entscheidungshilfe, keine Diagnoseaufgabe

Beim Teilen muss erkennbar sein, ob eine weitere Aktion nötig ist. Deshalb trägt die Datei einen
sichtbaren Zustand:

- **Verbunden:** Lokaler Stand und Cloud-Dokument werden aktiv gespiegelt.
- **Offline:** Die lokale Datei bleibt les- und bearbeitbar; vor gemeinsamer Arbeit stellst du die
  Verbindung wieder her.
- **Konflikt:** Lokaler und Cloud-Stand weichen ab. BloomMD überschreibt nichts still, sondern
  fordert eine bewusste Prüfung.
- **Zugriff entzogen:** Die Workspace-Berechtigung ist nicht mehr gültig. Die lokale Kopie bleibt
  erhalten, kann aber nicht zurückschreiben.

Ein Konflikt ist damit kein versteckter Synchronisationsfehler. Er ist ein Sicherheitsgeländer: Die
App macht sichtbar, dass zwei Stände nicht einfach zusammengeworfen werden dürfen.

## Menschen bekommen Rollen, nicht bloß einen Link

Die Freigabe einer Datei setzt einen Workspace voraus. Dort regeln Rollen, was andere Personen tun
können: Owner laden ein und verwalten Rechte, Editoren bearbeiten, Viewer lesen. Der Entzug greift
nicht nur in der Oberfläche. Neue Dokument- und Sync-Tickets werden serverseitig abgewiesen. Die
letzte lokale Datei bleibt davon unberührt; BloomMD löscht sie nicht als Folge einer Rollenänderung.

## Desktop, Browser und Obsidian können dieselbe Datei meinen

Ist eine Datei bereits aus der Desktop-App geteilt, muss eine gleichnamige Obsidian-Notiz kein
zweites Cloud-Dokument erzeugen. Im Obsidian-Dialog wählst du stattdessen **bestehende Datei
anbinden**. Desktop, Browser und Obsidian nutzen dann denselben Sync-Raum. Die Bindung speichert
Cloud-Dokumentdaten, nicht den Vault-Pfad.

## Trennen heißt nicht löschen

Mit **Freigabe trennen** löst du die Verbindung zwischen lokaler Datei und Cloud-Dokument. Beide
Dokumente bleiben erhalten. Das ist absichtlich: Eine Freigabe kann für einen Workshop enden, ohne
dass die lokale Arbeitsgrundlage oder die gemeinsame Historie verschwinden.

> Den vollständigen Ablauf mit Fehlerfällen und Rollen findest du in der
> [Zusammenarbeits-Hilfe](/docs/collaboration). Die Desktop-App gibt es unter
> [Download](/download).
