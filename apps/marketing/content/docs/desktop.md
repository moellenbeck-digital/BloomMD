---
title: Desktop-App
description: Der empfohlene Weg für die Closed Beta — lokal, ohne Konto auf macOS und Omarchy/Linux.
order: 2
---

# Desktop-App

Der Hauptweg der Beta. Läuft lokal, ohne Konto, ohne Netzwerk.

## Download

Die feste Download-Stelle für Tester ist [bloommd.io/download](/download). Dort stehen die aktuell
freigegebenen Desktop-Builds für macOS arm64 sowie Omarchy/Linux für x86_64 und aarch64 — jeweils
mit Version, Plattformstatus und Installationshinweis.

Die Desktop-Builds sind öffentlich verlinkt und lassen sich ohne Einladung oder BloomMD-Konto
herunterladen. Der Closed-Beta-Zugang gilt nur für Web-App, Cloud, Sync und Zusammenarbeit.
Falls ein Download-Link nicht funktioniert, schreibe an `feedback@bloommd.io`.

## Knoten bedienen ab 0.5.14

Ein Klick wählt einen Knoten aus, ohne die sichtbare Map neu zu zentrieren. Mit den Pfeiltasten
navigierst du zwischen Eltern, Kindern und Geschwistern; liegt das Ziel außerhalb der Ansicht,
wird es sichtbar gemacht. **Doppelklick** auf den Titel oder **R** startet in einer geöffneten
Markdown-Datei das Umbenennen, auch bei Ressourcenknoten. **Enter** übernimmt, **Escape** verwirft
die Eingabe. **Tab** legt einen Kindknoten an und zeigt dessen Titelfeld an.

Ressourcen öffnest du über **Ressource öffnen**. In der schreibgeschützten Workspace-Übersicht
führt **Quelldatei öffnen** von einem Dateiknoten oder einer Überschrift zur bearbeitbaren Datei.
Im Knoten-Editor sind **Cmd+I** und **Cmd+K** für Kursivschrift und Links verfügbar; auf der Map
öffnet **Cmd+K** die Befehlspalette. Unter Linux gelten die entsprechenden **Ctrl**-Kürzel.

## Dateien bearbeiten und speichern ab 0.5.13

Die Ordnerübersicht ist schreibgeschützt. Wähle einen Dateiknoten und **Ressource öffnen**
oder öffne die Datei im Datei-Browser. Neue Mindmaps wechseln direkt in die bearbeitbare
Dateiansicht. Ergänze deine Knoten und speichere mit **Cmd+S** (macOS) bzw. **Ctrl+S** (Linux).

Verspätete Ordner- und Dateiaktualisierungen verwerfen keine ungespeicherten Knoten mehr.
Bei externen Änderungen während deiner Bearbeitung bleibt dein Stand erhalten und ein
Konflikthinweis erscheint. Prüfe beide Stände, bevor du speicherst oder neu lädst.

Stimmen Dateititel und eine einzelne oberste Überschrift überein, zeigt die Ordnerübersicht
sie als einen Dateiknoten mit den zugehörigen Unterknoten. Die Markdown-Datei bleibt unverändert.

## Große lokale Workspaces ab 0.5.12

Ordner mit mindestens 100 Markdown-Dateien starten kompakt auf Datei-/Ordnerebene.
Klappe Dateiknoten auf, um ihre Überschriften zu sehen. Einzelne Dateien bleiben vollständig
nutzbar. Querverweise werden in der Übersicht auf sichtbare Knoten abgebildet.

Die Meldung „Mindmap wird angeordnet …“ kennzeichnet die Berechnung im Hintergrund.
Ein Ordnerwechsel verwirft veraltete Ergebnisse. Bei einem Layout-Fehler lässt sich die
Berechnung mit „Erneut versuchen“ wiederholen. Externe Änderungen einschließlich neuer
und gelöschter `.markdown`-Dateien aktualisieren die Ansicht automatisch.


## Installation in der Closed Beta

Der native Desktop-Client ist in der Closed Beta für **macOS und Omarchy/Linux** verfügbar. Der
macOS-Build zielt auf arm64; für Omarchy 4 und andere Arch-basierte Systeme gibt es Pacman-Pakete
für x86_64 und aarch64. Windows folgt als eigener Beta-Release.

**Ab Version 0.5.7 ist der macOS-arm64-Release mit Developer ID signiert und von Apple notarisiert.**

- **macOS:** DMG öffnen, BloomMD in den Programme-Ordner ziehen und dort per Doppelklick starten.
  Eine manuelle Gatekeeper-Ausnahme ist für diesen Release nicht vorgesehen. Falls macOS den Start
  blockiert, Version und Meldung an `feedback@bloommd.io` melden.
- **Omarchy/Linux:** passendes Pacman-Paket für die eigene Architektur herunterladen und mit
  `sudo pacman -U` installieren. Der Linux-Build ist nicht Developer-ID-signiert; das ist für
  Pacman nicht erforderlich.
- **Windows:** nicht Teil dieser Closed Beta; eigener Windows Beta Release folgt.

![DMG-Fenster von BloomMD 0.5.7 mit App und Verknüpfung zum Programme-Ordner](/releases/desktop-0.5.7-installer.png)

### Omarchy/Linux installieren

1. Auf [bloommd.io/download](/download) das Paket für `x86_64` oder `aarch64` herunterladen.
2. Im Download-Ordner installieren:

```bash
sudo pacman -U ./bloommd-desktop-<version>-<arch>.pacman
```

3. BloomMD starten:

```bash
bloommd-desktop
```

Das Paket registriert außerdem das URI-Schema `bloommd://`, sodass Dateien und Ordner direkt an
BloomMD übergeben werden können.

## Dateien und Ordner öffnen

Die App kann eine einzelne Markdown-Datei oder einen ganzen Ordner öffnen — über das Menü, per
Doppelklick im Dateimanager oder von der Kommandozeile:

```bash
bloommd ./notizen        # Ordner als Workspace
bloommd notiz.md         # einzelne Datei
```

## Mit der Web-App verbinden

Lokales Arbeiten braucht keinen Account. Wenn du aber zusammen mit jemandem in der Web-App an einer
Cloud-Datei arbeiten willst:

1. In `https://bloommd.app/account` unter **Desktop-Zugriff** ein persönliches Token erzeugen.
2. In der Desktop-App **Mit Server verbinden** öffnen.
3. Server-URL `https://bloommd.app` eintragen.
4. Token einfügen und dieselbe Cloud-Datei öffnen.

### Cloud-Workspace in der Desktop-App wechseln

Nach der Verbindung zeigt die Seitenleiste den aktiven Workspace mit deiner Rolle. Öffne den
Workspace-Selektor und wähle **Personal** oder einen eingeladenen Team-Workspace. Die Dateiliste
wird für den gewählten Workspace neu geladen; beim Wechsel trennt BloomMD den bisherigen Sync-Room
und verbindet die geöffnete Datei im neuen Workspace erneut.

- **Owner** und **Editor** können Dateien bearbeiten.
- **Viewer** kann Dateien und Präsenz ansehen, bleibt aber schreibgeschützt.
- Ein lokaler Ordner wird durch den Remote-Wechsel nicht verändert und bleibt getrennt vom
  Cloud-Workspace.
- Wird dein Zugriff entfernt, beendet der laufende Sync die Verbindung. Neue Datei- und Sync-
  Zugriffe werden vom Server abgewiesen.

Der genaue gemeinsame Ablauf steht unter [Zusammenarbeit](/docs/collaboration).

## Windows

Windows ist bewusst außerhalb dieser Closed Beta. Ein eigener Release folgt nach Installer-,
Handoff-, Tastatur- und Plattformtests.

Vor dem Windows-Beta-Release wird zusätzlich geprüft, wie Zugriffstoken im Cloud-Modus gespeichert
werden. Der lokale Modus bleibt davon unabhängig: Dort wird kein Geheimnis gespeichert.
