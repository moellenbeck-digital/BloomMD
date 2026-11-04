---
title: Web-App
description: Lokale Ordner im Browser, ohne Upload.
order: 3
---

# Web-App

Unter `/app`. Zwei Betriebsarten, die sich deutlich unterscheiden.

## Lokaler Ordner und Cloud im Überblick

| | Lokaler Ordner im Browser | Cloud-Workspace |
|---|---|---|
| Konto nötig | nein für die [Browser-Demo](/demo); die Web-App unter `/app` verlangt Anmeldung | ja |
| Wo liegen die Dateien | in deinem Ordner auf dem Rechner | in der Datenbank des Servers |
| Upload | nein, nichts wird hochgeladen | ja, Dateien werden importiert |
| Zusammenarbeit | nein | ja, über den Sync-Server |

Die Gegenüberstellung ausführlich: [Lokal oder Cloud](/docs/lokal-oder-cloud).

![Echter Screenshot der Web-App: Die Datei Kapitel 1 aus einem lokalen Ordner als Karte mit drei Unterknoten](/docs/web-app-map.png)

## Lokaler Ordner im Browser

Über die File System Access API öffnest du einen echten Ordner. Die Dateien bleiben auf deinem
Rechner — **es wird nichts hochgeladen**, auch keine Anhänge oder PDFs. Eine Vorschau baut die
Datei aus dem lokalen Handle zusammen, nicht über einen Server.

Der Berechtigungszustand ist sichtbar: Ist der Ordner nur zum Lesen freigegeben, erscheint ein
Hinweis **Nur Lesen** mit einer Schaltfläche, um Schreibzugriff anzufragen. Das passiert bewusst
erst auf Klick — Browser lehnen eine Berechtigungsanfrage ohne Nutzergeste ab.

Verfügbar in Chrome und Edge. Firefox und Safari unterstützen die API nicht.

![Echter Screenshot der Web-App: Ein lokaler Ordner ist geöffnet, neben dem Ordnernamen steht der Hinweis Nur Lesen](/docs/web-open-folder.png)

### Ordner öffnen, Schritt für Schritt

1. In `/app` oben das Ordner-Symbol (Tooltip **Open local Markdown folder**) wählen.
2. Den Ordner im Browser-Dialog freigeben.
3. Steht neben dem Ordnernamen **Nur Lesen**, ist der Ordner nur zum Lesen freigegeben. Ein Klick auf
   den Hinweis fragt den Schreibzugriff an; der Browser fragt dich dann.
4. In der Auswahlliste neben dem Ordnernamen eine Datei öffnen.

### Neue Datei aus einer Vorlage

Mit Schreibzugriff legst du über **+ Datei** eine neue Mindmap im Ordner an. Im Dialog wählst du
Ordner, **Vorlage** und Name. Eingebaut sind Vorlesung, Cornell, Literaturnotiz, Prüfungsvorbereitung
und Projekt; **Leer** legt nur die Überschrift an. Eigene Vorlagen liegen als Markdown im
Ordner `Vorlagen` deines Workspaces.

![Echter Screenshot der Web-App: Der Dialog für eine neue Datei mit Ordner, Vorlage Vorlesung und Name](/docs/templates.png)

### Browser-Demo

Die [Browser-Demo](/demo) braucht kein Konto. Sie lädt eine eingebaute Vorlage; dein Markdown bleibt
im Browser, solange du es nicht herunterlädst. Eigenes Markdown fügst du links ein oder wählst eine
lokale Datei.

![Echter Screenshot der Browser-Demo: Links ein Markdown-Eingabefeld, rechts die Karte der Vorlage Software Architecture Map](/docs/demo.png)

## Cloud-Workspace

Mit Konto. Dokumente liegen in der Datenbank, Zusammenarbeit läuft über den Sync-Server.
Die Registrierung (offen, ohne Einladung) ist unter
[Closed-Beta Zugang](/docs/closed-beta-zugang) beschrieben.

Ist ein Sync-Server verbunden, steht im Kopf neben dem Dateititel der Sync-Status, zum Beispiel
**Synchronisiert**. Er erscheint nur bei breiten Fenstern (ab 1536 Pixel).

![Echter Screenshot der Kopfzeile der Web-App: Neben dem Dateititel Graphentheorie steht der Sync-Status Synchronisiert](/docs/sync-status.png)

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
Daten Dritter hochladen. Wenn Login oder App nicht erreichbar sind, schreibe an
`feedback@bloommd.io`. GitHub ist nur unser internes
Triage-Ziel.

## Zwei Kartenansichten

- **Dokument** — die Gliederung der geöffneten Datei.
- **Workspace** — Ordner, Dateien und ihre Verweise. Mit Layern für Struktur, Verweise und
  Backlinks, damit die Karte nicht unlesbar wird.
