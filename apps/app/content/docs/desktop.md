---
title: Desktop-App
description: Der empfohlene Weg für die Closed Beta — lokal, ohne Konto.
order: 2
---

# Desktop-App

Der Hauptweg der Beta. Läuft lokal, ohne Konto, ohne Netzwerk.

## Download

Die feste Download-Stelle für Tester ist [bloommd.io/download](/download). Dort steht der aktuell
freigegebene macOS-arm64-Build für M1 mit Version, Plattformstatus und Installationshinweis.

In der geschlossenen Beta ist der Build nicht öffentlich gelistet. Wenn dein Account freigeschaltet
ist, bekommst du den konkreten Download-Link über die Beta-Freigabe. Falls der Link fehlt oder
abgelaufen ist, schreibe an `feedback@bloommd.io`.

## Installation in der Closed Beta

Der native Desktop-Client startet in der Closed Beta **macOS-first**. Der freigegebene M1-Build ist
macOS arm64. Windows und Linux folgen als eigene Beta-Releases, sobald Installer, OS-Handoff,
Tastaturverhalten und Plattform-Smokes sauber geprüft sind.

**Der macOS-Build ist ad-hoc signiert, aber noch nicht Developer-ID-signiert oder notarisiert.**
Die finale Apple-Signatur wartet auf die Freigabe des Apple Developer Accounts.

- **macOS:** Gatekeeper meldet einen unbekannten Entwickler. Rechtsklick → Öffnen → Öffnen.
- **Windows:** nicht Teil der M1 Closed Beta; eigener Windows Beta Release folgt.
- **Linux:** nicht Teil der M1 Closed Beta; eigener Linux Beta Release folgt.

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
2. In der Mac-App **Mit Server verbinden** öffnen.
3. Server-URL `https://bloommd.app` eintragen.
4. Token einfügen und dieselbe Cloud-Datei öffnen.

Der genaue gemeinsame Ablauf steht unter [Zusammenarbeit](/docs/collaboration).

## Windows und Linux

Windows und Linux sind bewusst aus dem M1-Desktop-Scope herausgenommen. Das schließt Tester auf
diesen Systemen zunächst aus, verhindert aber, dass die Closed Beta an noch nicht belegtem
Plattform-Packaging hängt.

Vor dem Windows-Beta-Release wird zusätzlich geprüft, wie Zugriffstoken im Cloud-Modus gespeichert
werden. Der lokale Modus bleibt davon unabhängig: Dort wird kein Geheimnis gespeichert.
