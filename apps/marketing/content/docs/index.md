---
title: Erste Schritte
description: Was BloomMD ist, was die Closed Beta umfasst und wo du anfängst.
order: 1
---

# Erste Schritte

BloomMD macht aus Markdown-Dateien eine Karte — und schreibt sie unverändert zurück. Kein eigenes
Dateiformat, kein Export nötig, keine Bindung an dieses Programm.

## Der wichtigste Punkt zuerst

Deine Datei bleibt eine gewöhnliche Markdown-Datei. Du kannst sie parallel in Obsidian öffnen, nach
git committen oder mit einem Texteditor bearbeiten. BloomMD fügt lediglich unsichtbare
HTML-Kommentare für stabile Knoten-IDs hinzu; jeder Markdown-Renderer ignoriert sie.

## Womit anfangen

Die Closed Beta führt mit der **Desktop-App**. Sie arbeitet vollständig lokal, braucht kein Konto
und keine Internetverbindung. Die **Web-App** unter `/app` ist der zweite Weg. Was dabei lokal bleibt
und was in die Cloud geht, steht unter [Lokal oder Cloud](/docs/lokal-oder-cloud).

### Erste Schritte mit der Desktop-App (macOS)

1. Den Desktop-Build für macOS arm64 über [bloommd.io/download](/download) herunterladen. (Omarchy/Linux:
   Pacman-Paket, siehe [Desktop-App](/docs/desktop).)
2. Die DMG-Datei öffnen und BloomMD in den Programme-Ordner ziehen.

   ![DMG-Fenster von BloomMD 0.5.7 mit App und Verknüpfung zum Programme-Ordner](/releases/desktop-0.5.7-installer.png)

3. BloomMD im Programme-Ordner per Doppelklick starten.
4. Einen Ordner mit Markdown-Dateien öffnen — oder einen neuen anlegen.
5. Eine Datei auswählen. Die Überschriften werden zur Karte.

![Schema, kein Screenshot: Links die Dateiliste des geöffneten Ordners, rechts die Karte der ausgewählten Datei mit Überschriften als Knoten](/docs/desktop-ordner.svg)

### Erste Schritte mit der Web-App

1. Ein Konto anlegen, die E-Mail-Adresse bestätigen und anmelden. Die Schritte stehen unter
   [Closed-Beta Zugang](/docs/closed-beta-zugang).
2. In `/app` oben das Ordner-Symbol (Tooltip **Open local Markdown folder**) wählen und einen Ordner freigeben.
   Chrome und Edge unterstützen das; es wird nichts hochgeladen.
3. Ist der Ordner nur zum Lesen freigegeben, erscheint **Nur Lesen**. Ein Klick darauf fragt den
   Schreibzugriff an.
4. In der Auswahlliste neben dem Ordnernamen eine Datei wählen. Die Überschriften werden zur Karte.

![Echter Screenshot der Web-App: Die Datei Kapitel 1 aus einem lokalen Ordner als Karte mit drei Unterknoten](/docs/web-app-map.png)

Ohne Konto geht es sofort mit der [Browser-Demo](/demo). Sie lädt eine eingebaute Vorlage und
speichert nichts.

![Echter Screenshot der Browser-Demo: Links ein Markdown-Eingabefeld, rechts die Karte der Vorlage Software Architecture Map](/docs/demo.png)

Für Web-App, Cloud-Workspace, Sync und Collaboration brauchst du einen Account. Du
registrierst dich direkt selbst, ohne Einladung und ohne Warteliste. Registrierung, E-Mail-Bestätigung
und Login stehen unter [Closed-Beta Zugang](/docs/closed-beta-zugang).

Hakt etwas bei Installation, Ordnerrechten, Sync oder Einladung? Die [Fehlerbehebung](/docs/fehlerbehebung)
führt Symptom, Ursache und Schritte auf.

**Ohne Einladung verfügbar:** [Browser-Demo](/demo), Desktop-Builds auf der
[Download-Seite](/download) und das [Obsidian-Plugin](/obsidian) über BRAT oder
GitHub-Releases. Nur bei aktivem Zugangsschalter betrifft eine Einladung den Web- und Cloud-Zugang.

## Was in der Beta nicht enthalten ist

- Die eigenständige BloomMD-App für iPad, iPhone und Android hat noch keinen
  öffentlichen App-Store-Download. Das Obsidian-Plugin ist davon getrennt und
  auch auf Mobilgeräten als Beta verfügbar.
- Keine Wiederherstellungszusage für Cloud-Daten. Lade nichts hoch, was du nicht auch anderswo hast.
- Windows-Desktop-Builds sind nicht Teil dieser Closed Beta.
