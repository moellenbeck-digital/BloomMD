---
title: Zusammenarbeit
description: Wie zwei Tester dieselbe BloomMD-Datei gemeinsam bearbeiten.
order: 4
---

# Zusammenarbeit

Mehrere Personen können dieselbe Markdown-Datei gleichzeitig in BloomMD bearbeiten. Dafür legt ein
Workspace-Owner einen Team-Workspace an und lädt die anderen Personen per E-Mail mit einer Rolle ein.
Alle Beteiligten melden sich mit ihrem eigenen Account an und öffnen dieselbe Datei.

> **Kurz gesagt:** Zusammenarbeit heißt in BloomMD nicht „Datei per E-Mail weitergeben“, sondern
> dieselbe Cloud-Datei öffnen. Änderungen werden über Yjs zusammengeführt, statt sich gegenseitig zu
> überschreiben.

## Welche Variante brauchst du?

- **Zwei Personen arbeiten im Browser:** Web-App + Cloud-Workspace. Beide brauchen eigene
  Testaccounts.
- **Eine Person im Browser, eine in der Desktop-App:** Web-App + Desktop-App im Server-Modus. Die Desktop-App
  braucht ein persönliches Token.
- **Eine vorhandene lokale Datei gezielt gemeinsam bearbeiten:** Lokaler Desktop-Modus + **Diese
  lokale Datei teilen**. Die Freigabe gilt nur für diese eine Datei und wird sichtbar bestätigt.
- **Einen ganzen lokalen Ordner bewusst als gemeinsamen Workspace veröffentlichen:** Lokaler
  Desktop-Modus + **Ordner als gemeinsamen Workspace veröffentlichen** in der Seitenleiste. Das ist
  ein eigener Ablauf, getrennt von der Einzeldatei-Freigabe.
- **Nur lokale Dateien auf deinem Rechner:** Lokaler Desktop-Modus. Ohne diese ausdrückliche
  Freigabe gibt es keine Zusammenarbeit und keinen Upload.

## Eine lokale Desktop-Datei bewusst teilen

Eine lokale Markdown-Datei bleibt zuerst auf deinem Rechner. Du entscheidest pro Datei, ob sie in
einen Workspace gespiegelt werden soll. Diese Einzeldatei-Freigabe lädt niemals einen Ordner oder
weitere lokale Dateien hoch; für einen ganzen Ordner gibt es den eigenen Ablauf „Einen lokalen
Ordner bewusst veröffentlichen“ weiter unten.

![Illustration: Eine gemeinsame BloomMD-Map mit Markdown als sichtbarer Grundlage](/blog/collaboration-sync.png)

*Die Illustration erklärt den Ablauf. Den tatsächlichen Freigabestatus zeigt die Desktop-App direkt
an der geöffneten Datei.*

### Ablauf

1. Öffne die lokale Markdown-Datei in der Desktop-App.
2. Wähle am Dateikopf **Diese lokale Datei teilen**.
3. Wähle ein gespeichertes Server-Profil, einen Workspace und bestätige den vorgeschlagenen
   Cloud-Dateinamen.
4. Bestätige **Datei jetzt teilen**. Erst jetzt wird genau diese Datei als Cloud-Dokument angelegt
   und mit ihrem lokalen Markdown-Spiegel verbunden.
5. Lade bei Bedarf weitere Personen im Workspace-Dialog der Web-App ein. Sie öffnen das
   Cloud-Dokument im Browser; Präsenzpunkte zeigen gemeinsame Arbeit an.

Der Server erhält dabei Workspace-ID, Cloud-Dokument-ID und Cloud-Dateiname. Der lokale Dateipfad,
dein Ordner und andere Markdown-Dateien bleiben auf dem Gerät. Die bewusste Bindung wird im
Workspace-Audit festgehalten.

> **Wichtig:** „Verbunden“ heißt nicht, dass ein lokaler Ordner nun allgemein synchronisiert wird.
> Die Freigabe umfasst weiterhin exakt diese eine Markdown-Datei. Für eine weitere Datei startest du
> erneut den sichtbaren Freigabeablauf.

### Status verstehen und sicher weiterarbeiten

- **Verbunden:** lokale und Cloud-Version sind aktiv gespiegelt.
- **Offline:** Die lokale Datei bleibt bearbeitbar. Neue lokale Änderungen werden nicht still als
  Cloud-Änderung ausgegeben; stelle zuerst die Verbindung wieder her und prüfe den Status.
- **Konflikt:** BloomMD überschreibt keinen abweichenden lokalen Stand. Prüfe die Datei und löse
  den Konflikt bewusst, bevor du weiter teilst.
- **Zugriff entzogen:** Der Server beendet die Sync-Verbindung. Die letzte lokale Kopie bleibt
  erhalten, kann aber nicht mehr zurück in den Workspace schreiben.

Mit **Freigabe trennen** beendest du nur die lokale Bindung. Die lokale Datei und das bereits
angelegte Cloud-Dokument werden nicht gelöscht. Diese Entscheidung ist ebenfalls auditierbar.

### Eine bereits geteilte Datei in Obsidian anbinden

Desktop und Obsidian müssen kein zweites Cloud-Dokument für dieselbe Arbeit anlegen. Wenn die
lokale Datei bereits über die Desktop-App geteilt wurde, kann die entsprechende Vault-Notiz diese
vorhandene Cloud-Datei ausdrücklich übernehmen:

1. Lege in den BloomMD-Obsidian-Einstellungen die Server-URL, die Workspace-ID (optional) und ein
   persönliches Zugriffstoken ab. Das Token bleibt in Obsidian Secret Storage und nicht im Vault.
2. Öffne die entsprechende Markdown-Notiz und führe über die Command Palette
   **BloomMD: Share current note with BloomMD workspace** aus.
3. Wähle im Dialog **Bind existing: _Dateiname.md_** – nicht **Create new**.
4. BloomMD liest die Cloud-Dokument-ID und Version, speichert nur die lokale Bindung und verbindet
   die Notiz mit demselben Sync-Room wie Desktop und Web-App.

Die Auswahl überträgt nur Workspace- und Cloud-Dokumentdaten. Der Vault-Pfad wird nicht an den
Server gesendet. Ist der lokale Notizstand nicht derselbe wie der Cloud-Stand, zeigt BloomMD einen
Konflikt an, statt eine Seite still zu überschreiben. Nach einem serverseitigen Entzug endet auch
die Obsidian-Verbindung; die letzte lokale Notiz bleibt erhalten und kann nicht zurückschreiben.

## Einen lokalen Ordner bewusst veröffentlichen

Für mehrere Markdown-Dateien gibt es einen zweiten, eigenen Weg: den ganzen lokalen Ordner als
gemeinsamen Workspace veröffentlichen. Er ist bewusst getrennt von **Diese lokale Datei teilen**
benannt und liegt an einem anderen Einstieg (Seitenleiste im lokalen Desktop-Modus). Ein Ordner wird
nie nebenbei geteilt: Nichts wird gelesen oder hochgeladen, bevor du in der Vorschau bestätigst.

### Ablauf

1. Wähle in der Seitenleiste **Ordner als gemeinsamen Workspace veröffentlichen**. BloomMD schlägt
   den aktuell geöffneten Ordner vor; mit **Anderen Ordner wählen …** öffnest du den nativen
   Auswahldialog. Die Auswahl allein ändert und überträgt nichts.
2. Wähle ein gespeichertes Server-Profil und den Ziel-Workspace. Workspaces, in denen du nur Viewer
   bist, lassen sich nicht wählen.
3. Prüfe die Vorschau: Ziel-Workspace, Anzahl der Markdown-Dateien, Gesamtgröße, Konfliktstrategie
   und die Liste aller Dateien und Unterordner. Mit dem Häkchen schließt du einzelne Dateien oder
   ganze Unterordner aus.
4. Bestätige mit **Veröffentlichen**. Erst jetzt werden genau die angehakten Dateien als
   Cloud-Dokumente angelegt.

### Was übertragen wird

- Nur Markdown-Dateien (`.md`, `.markdown`). Bilder, PDFs und andere Dateitypen werden nicht
  angeboten und nie hochgeladen. Versteckte Ordner (`.git`, `.obsidian` …), `node_modules` und
  Symlinks werden übersprungen.
- Die lokalen Dateien bleiben die Quelle und werden nicht verändert.
- Der Server erhält Workspace-ID, Cloud-Dokument-ID und Cloud-Dateiname. Der Ordnerpfad und die
  lokalen Unterordner bleiben auf dem Gerät. Die Bindung steht pro Dokument im Workspace-Audit.
- Nichts wird überschrieben und nichts gelöscht, weder lokal noch in der Cloud.

### Wie lokale Pfade zu Cloud-Namen werden

Ein Cloud-Workspace kennt keine Unterordner, nur Dateinamen. BloomMD verbindet den relativen Pfad
deshalb nach einer festen Regel mit `__`, und die Vorschau zeigt jeden Namen vorab:

| Lokal | Im Workspace |
| --- | --- |
| `idee.md` | `idee.md` |
| `notizen/2026/idee.md` | `notizen__2026__idee.md` |

Dateien, die nicht passen, stehen mit Grund in der Vorschau und lassen sich nicht einschließen: Namen
mit Zeichen, die der Workspace ändern würde (zum Beispiel `: * ? " < > |`, ein Punkt am Anfang oder
doppelte Leerzeichen), Dateien, deren Cloud-Name nach dem Zusammenführen mit einer anderen lokalen
Datei übereinstimmt (`a/b.md` und `a__b.md`), und Dateien über 1 MB.

### Wenn der Name im Workspace schon existiert

Die Konfliktstrategie wählst du in der Vorschau. Keine Variante überschreibt eine vorhandene Datei.

- **Vorhandene Cloud-Datei nicht anfassen, als Konflikt melden** (Standard): Die lokale Datei wird
  nicht hochgeladen und in der Vorschau als Konflikt markiert.
- **Lokale Datei unter anderem Namen hochladen (Suffix):** Die Datei wird als `name-local.md`
  angelegt (bei Bedarf `name-local-2.md` …); die vorhandene Datei bleibt unberührt.

Dateien, die du schon einzeln geteilt oder aus diesem Ordner in denselben Workspace veröffentlicht
hast, werden nicht noch einmal angeboten.

### Der Ordner danach: Ordnerfreigaben und Aktivität

**Veröffentlichen** lädt die bestätigten Dateien hoch und merkt sich die Zuordnung lokal. Danach
erscheint in der Seitenleiste **Ordnerfreigaben**; ein Zähler zeigt, wie viele Änderungen auf deine
Entscheidung warten. BloomMD zeigt Änderungen im Ordner nur an. Es lädt nichts hoch und löscht
nichts von allein, in keine Richtung.

Eine geöffnete Datei einer Ordnerfreigabe wird wie eine einzeln geteilte Datei mit dem
Cloud-Dokument gespiegelt. Sie hat dort keinen eigenen „Freigabe trennen“-Knopf; getrennt wird nur
die ganze Ordnerfreigabe.

Die Aktivitätsliste einer Ordnerfreigabe kennt drei Arten von Einträgen:

- **neu, noch nicht geteilt:** Eine Markdown-Datei, die es bei der Veröffentlichung noch nicht gab.
  Sie wird erst nach **Hochladen** angelegt, unter dem Cloud-Namen nach dem Schema oben und mit der
  Konfliktstrategie, die du bei der Veröffentlichung gewählt hast. Mit **Nicht teilen** verschwindet
  der Eintrag, ohne dass etwas hochgeladen wird. Dateien mit Namenskonflikt oder ungeeignetem Namen
  lassen sich nur ignorieren.
- **lokal entfernt:** Eine veröffentlichte Datei fehlt im Ordner. Du entscheidest pro Eintrag:
  **Cloud-Dokument behalten** (nur die lokale Zuordnung endet) oder **Cloud-Dokument entfernen**
  (nach einer zweiten, ausdrücklichen Bestätigung). Ein Cloud-Dokument wird nie automatisch
  gelöscht.
- **lokal umbenannt:** Eine Datei fehlt unter dem alten Namen und es gibt genau eine neue Datei mit
  demselben Inhalt. **Neu zuordnen** verbindet das vorhandene Cloud-Dokument (mit unverändertem
  Cloud-Namen) mit dem neuen lokalen Pfad; **Als neue Datei behandeln** macht daraus „lokal
  entfernt“ plus „neu“. Eine Umbenennung wird nur erkannt, wenn der Inhalt seit der
  Veröffentlichung unverändert ist. Sonst erscheint „lokal entfernt“, und du kannst die Datei dort
  selbst der neuen Datei zuordnen.

**Zugriff entzogen:** Beendet der Server den Zugriff oder wird deine Rolle im Workspace zu Viewer,
stoppt der Abgleich dieser Ordnerfreigabe. Die Ordnerfreigabe zeigt **Zugriff entzogen**, lokale
Dateien bleiben unverändert (nichts wird gelöscht oder zurückgeschrieben), und Hochladen sowie
Entfernen sind gesperrt. BloomMD prüft das beim Start, beim Öffnen der Ordnerfreigaben und beim
Öffnen einer Datei der Ordnerfreigabe. Ein nicht erreichbarer Server gilt nicht als Entzug.

**Ordnerfreigabe trennen:** Beendet nur die lokale Bindung. Weder lokale Dateien noch
Cloud-Dokumente werden gelöscht. Die Trennung wird im Workspace-Audit festgehalten, sofern der
Server erreichbar ist und der Zugriff noch besteht; bei entzogenem Zugriff bleibt sie lokal.

## Zwei Personen in der Web-App

### Ablauf

1. Person A meldet sich auf `https://bloommd.app` an und öffnet den Workspace-Selektor.
2. Person A wählt **Neuer Team-Workspace**, vergibt einen Namen und erstellt die erste Datei.
3. Unter **Mitglieder einladen** trägt Person A die E-Mail-Adresse von Person B und die Rolle
   **Editor** oder **Viewer** ein.
4. Person B folgt dem Einladungslink, erstellt bei Bedarf zuerst den eigenen Account und meldet sich
   an.
5. Beide wählen denselben Workspace und dieselbe Datei.
6. Beide prüfen, ob farbige Präsenzpunkte an Nodes sichtbar sind und der Sync-Status verbunden ist.
7. Beide bearbeiten unterschiedliche Nodes oder denselben Markdown-Text und laden anschließend die
   Seite neu, um die Persistenz zu prüfen.

### Woran du erkennst, dass es funktioniert

- Präsenzpunkte erscheinen an Nodes, wenn die andere Person in derselben Datei ist.
- Änderungen tauchen ohne manuelles Kopieren im zweiten Fenster auf.
- Nach Reload bleibt der letzte gespeicherte Stand erhalten.

> **Wenn Person B den Workspace nicht sieht:** Prüfe zuerst, ob die Einladung angenommen wurde und
> ob Person B mit genau der eingeladenen E-Mail-Adresse angemeldet ist. Ein Konto allein
> gibt keinen Zugriff auf den Workspace.

## Rollen und Mitgliedschaft

- **Owner:** kann Workspace umbenennen, Mitglieder einladen, Rollen ändern und Mitglieder ausladen.
- **Editor:** kann gemeinsame Markdown-Dateien lesen und bearbeiten.
- **Viewer:** kann Dateien und Präsenz sehen, aber nicht schreiben.
- Ein Mitglied kann einen Team-Workspace über den Workspace-Dialog verlassen. Der letzte Owner muss
  zuerst einen weiteren Owner bestimmen.

Einladung, Rollenprüfung und Entfernung werden serverseitig geprüft. Ein gelöschtes Mitglied erhält
keine neuen Dokument- oder Sync-Tickets mehr.

## Cloud-Workspace benennen

Der aktive Cloud-Workspace steht oben in der App-Leiste als **Cloud**-Chip. Besitzer können den
Namen dort über das Stift-Symbol ändern. Ein lokaler Browser-Ordner wird separat als **Lokal**
markiert, damit du beim Testen nicht versehentlich Cloud-Collaboration und lokale Dateien
verwechselst.

## Web-App und Desktop-App gemeinsam

Das funktioniert, wenn die Desktop-App mit demselben Cloud-Server verbunden ist. Ein lokal geöffneter
Ordner in der Desktop-App reicht dafür nicht.

### Verbindung einrichten

1. Öffne in der Web-App `Account` und erzeuge unter **Desktop-Zugriff** ein persönliches Token.
   Kopiere es sofort; es wird nur einmal vollständig angezeigt.
2. Starte die Desktop-App auf macOS oder Omarchy/Linux.
3. Öffne links die Dateiliste und wähle **Mit Server verbinden**.
4. Trage als Server-URL `https://bloommd.app` ein.
5. Füge das persönliche Token ein und verbinde die App.
6. Öffne in der Desktop-App dieselbe Cloud-Datei wie im Browser.
7. Prüfe, ob Präsenzpunkte mit unterschiedlichen Farben und Namenskürzeln in beiden Fenstern sichtbar werden.
8. Bewege den Mauszeiger über ein Kürzel, um Anzeigename und – sofern verfügbar – E-Mail-Adresse zu sehen.

### Workspace in der Desktop-App wechseln

Nach der Verbindung zeigt die Seitenleiste den aktiven Workspace und deine Rolle. Wähle dort den
persönlichen oder einen eingeladenen Team-Workspace aus. BloomMD lädt danach nur dessen Dateien,
trennt den bisherigen Sync-Room und verbindet die geöffnete Datei im neuen Workspace erneut.

- **Owner** und **Editor** können Dateien bearbeiten.
- **Viewer** bleibt schreibgeschützt; der Server erzwingt diese Berechtigung zusätzlich.
- Lokale Ordner und lokale Markdown-Dateien bleiben unverändert und werden nicht in den Cloud-
  Workspace kopiert.
- Nach einer Ausladung wird ein aktiver Sync beendet; neue Dokument- und Sync-Tickets werden
  abgewiesen.

### Lokaler Desktop-Modus ohne Freigabe

Der lokale Desktop-Modus arbeitet bewusst ohne Konto und ohne Upload, bis du eine einzelne Datei
ausdrücklich teilst. Wenn du einfach einen lokalen Ordner öffnest, bleibt alles auf deinem Rechner.
Für reine Cloud-Dateien in WebApp + Desktop-App muss die Desktop-App im Server-Modus verbunden sein.

## Feedback beim Testen

Nutze für Probleme den Feedback-Button in der App. Ein Screenshot ist Pflicht, weil wir Sync-,
Ordner- und Panel-Probleme schneller zuordnen können. Wenn die App gar nicht erreichbar ist,
schreibe an `feedback@bloommd.io`.

Bitte lade keine echten Zugangsdaten, Tokens oder personenbezogenen Daten Dritter hoch. Ein kleines
Markdown-Beispiel reicht meistens.

## Typische Fehler

Einladungs-, Sync- und Ordnerprobleme sind außerdem auf einer Seite gebündelt: [Fehlerbehebung](/docs/fehlerbehebung).

- **Die zweite Person sieht den Workspace nicht.** Der Account ist nicht für denselben Workspace
  freigeschaltet. Sende Feedback oder antworte auf die E-Mail zu deinem Testaccount.
- **Die Desktop-App zeigt nur lokale Dateien.** Sie ist nicht im Server-Modus verbunden. Öffne
  **Mit Server verbinden** und trage `https://bloommd.app` plus Token ein.
- **Der falsche Workspace ist aktiv.** Öffne in der Remote-Seitenleiste den Workspace-Selektor und
  wähle den gewünschten Eintrag. Name und Rolle werden direkt unter dem Selektor angezeigt.
- **Der Workspace-Wechsel schlägt fehl.** Prüfe, ob die Einladung noch besteht. Die Desktop-App stellt
  bei einem abgewiesenen Wechsel den vorherigen Workspace wieder her; lokale Dateien bleiben dabei
  unangetastet.
- **Präsenz fehlt nach Schlafmodus oder Netzwerkwechsel.** Die Verbindung wurde unterbrochen.
  Öffne die Datei neu oder trenne die Server-Verbindung und verbinde sie erneut.
- **Eine bewusst geteilte lokale Datei zeigt Offline, Konflikt oder Zugriff entzogen.** Die lokale
  Datei bleibt erhalten. Teile sie nicht erneut blind: prüfe erst Verbindung, Rollen und den
  sichtbaren Freigabestatus. Nach einem Entzug kann nur ein Owner wieder Zugriff geben.
- **Neue Dateien anderer Teilnehmer fehlen.** In der Beta kann die Dateiliste einen Reload brauchen.
  Änderungen in bereits geöffneten Dateien sollten dagegen live erscheinen.

## Was der Server prüft

Jede Verbindung braucht ein **kurzlebiges Ticket** (fünf Minuten), signiert und gebunden an Nutzer,
Workspace, Dokument, Dateiname und Berechtigung.

Der Server prüft zusätzlich:

- Eine gültige Signatur für jemanden, der nicht Mitglied des Workspace ist, wird abgewiesen.
- Ein Ticket, das `write` behauptet, während die Datenbank `viewer` sagt, wird serverseitig auf
  Lesen herabgestuft.
- Abgelaufene Tickets, manipulierte Signaturen und nicht erlaubte Origins werden abgewiesen.

Diese Fälle sind gegen einen laufenden Server mit echter Datenbank geprüft, nicht nur in Unit-Tests.

## Grenzen der Beta

Genau **eine** Sync-Instanz. Mehrere Replicas bräuchten verteilte Raumkoordination, die es nicht
gibt — zwei Instanzen würden Bearbeiter desselben Dokuments auf getrennte, nicht abgeglichene Räume
verteilen. Das Release-Gate lehnt eine solche Konfiguration ab, statt den Fehler erst im Betrieb
sichtbar werden zu lassen.
