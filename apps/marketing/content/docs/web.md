---
title: Web-App
description: Lokale Ordner im Browser, ohne Upload.
order: 3
---

# Web-App

Unter `/app`. Zwei Betriebsarten, die sich deutlich unterscheiden.

## Lokaler Ordner im Browser

Über die File System Access API öffnest du einen echten Ordner. Die Dateien bleiben auf deinem
Rechner — **es wird nichts hochgeladen**, auch keine Anhänge oder PDFs. Eine Vorschau baut die
Datei aus dem lokalen Handle zusammen, nicht über einen Server.

Der Berechtigungszustand ist sichtbar: Ist der Ordner nur zum Lesen freigegeben, erscheint ein
Hinweis **Nur Lesen** mit einer Schaltfläche, um Schreibzugriff anzufragen. Das passiert bewusst
erst auf Klick — Browser lehnen eine Berechtigungsanfrage ohne Nutzergeste ab.

Verfügbar in Chrome und Edge. Firefox und Safari unterstützen die API nicht.

## Cloud-Workspace

Mit Konto. Dokumente liegen in der Datenbank, Zusammenarbeit läuft über den Sync-Server. Der
Closed-Beta Ablauf ist unter [Closed-Beta Zugang](/docs/closed-beta-zugang) beschrieben.

### Markdown-Datei in den Cloud-Workspace laden

1. Melde dich auf `https://bloommd.app` mit deinem Beta-Account an.
2. Öffne die App und wähle den Cloud-Workspace, in dem die Datei landen soll.
3. Nutze in der Toolbar oder Command-Palette **Markdown importieren**.
4. Wähle eine `.md`- oder `.markdown`-Datei aus.
5. Öffne die importierte Datei aus der Dateiliste und prüfe die Karte.

Ab diesem Moment liegt die Markdown-Datei serverseitig im Cloud-Workspace und kann mit Sync und
Zusammenarbeit genutzt werden. Das ist bewusst anders als **Lokaler Ordner im Browser**: Dort bleibt
alles auf deinem Rechner und es wird nichts hochgeladen.

Bitte lade in der Beta keine Zugangsdaten, Secrets, personenbezogenen Daten Dritter oder
produktionskritischen Inhalte hoch. Für Fehlermeldungen reicht fast immer ein reduziertes
Markdown-Beispiel.

Wenn zwei Personen dieselbe Datei speichern, gewinnt nicht einfach die letzte: Du bekommst einen
Vergleich beider Fassungen und drei Möglichkeiten — die gespeicherte Fassung laden, deine behalten
oder als Kopie sichern.

## Feedback geben

Eingeloggte Beta-Tester nutzen den Feedback-Button in der App. Ein Screenshot ist Pflicht, ein
kurzes Video ist optional. Bitte keine privaten Markdown-Inhalte, Zugangsdaten oder personenbezogene
Daten Dritter hochladen. Wenn Login oder App nicht erreichbar sind, antworte auf deine
Beta-Einladungs-Mail oder schreibe an `feedback@bloommd.io`. GitHub ist nur unser internes
Triage-Ziel.

## Zwei Kartenansichten

- **Dokument** — die Gliederung der geöffneten Datei.
- **Workspace** — Ordner, Dateien und ihre Verweise. Mit Layern für Struktur, Verweise und
  Backlinks, damit die Karte nicht unlesbar wird.
