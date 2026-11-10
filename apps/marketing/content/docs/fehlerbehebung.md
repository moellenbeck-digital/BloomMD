---
title: Fehlerbehebung
description: Gatekeeper und DMG, Ordnerrechte, Sync-Status, Einladungsprobleme und Browser-Demo — je Problem Symptom, Ursache und Schritte.
order: 10
---

# Fehlerbehebung

Je Problem steht hier, woran du es erkennst (**Symptom**), woran es liegt (**Ursache**) und was du
tun kannst (**Schritte**). Alle Meldungen sind so wiedergegeben, wie die App sie zeigt. Was Cloud,
Sync und Zusammenarbeit grundsätzlich bedeuten, steht unter [Lokal oder Cloud](/docs/lokal-oder-cloud).

Auf dieser Seite:

- macOS blockiert BloomMD (Gatekeeper, DMG)
- Ordner lässt sich nicht öffnen oder speichern
- Der Sync-Status zeigt nicht „Synchronisiert“
- Freischaltung oder Zugang funktioniert nicht
- Browser-Demo

## macOS blockiert BloomMD (Gatekeeper, DMG)

**Symptom:** Beim Start meldet macOS, dass BloomMD nicht geöffnet oder nicht überprüft werden kann.

**Ursache:** Ab Version 0.5.7 ist der macOS-arm64-Release mit Developer ID signiert und von Apple
notarisiert; die Release-Prüfung bewertet Notarisierung und Gatekeeper, bevor ein Build erscheint.
Eine manuelle Gatekeeper-Ausnahme ist für diese Builds nicht vorgesehen. Frühere Builds waren nicht
notarisiert, dort ist eine Gatekeeper-Warnung zu erwarten. Eine Sperre bei einem aktuellen Build ist
unerwartet und ein Fall für uns.

**Schritte:**

1. Die Version prüfen: in der App unter **Hilfe und Einstellungen → Über BloomMD**, oder am Dateinamen des
   Downloads.
2. Liegt sie unter 0.5.7, den aktuellen Build von [bloommd.io/download](/download) laden. Nimm
   Downloads nur von dort.
3. Die DMG-Datei öffnen, BloomMD in den Programme-Ordner ziehen und dort per Doppelklick starten, nicht
   aus dem DMG-Fenster.
4. Blockiert macOS trotzdem, Gatekeeper nicht abschalten. Schick Version und den genauen Wortlaut der
   Meldung (ein Bildschirmfoto reicht) an `feedback@bloommd.io`.

![DMG-Fenster von BloomMD 0.5.7 mit App und Verknüpfung zum Programme-Ordner](/releases/desktop-0.5.7-installer.png)

Omarchy/Linux kennt kein Gatekeeper: Das Pacman-Paket installierst du mit `sudo pacman -U`, siehe
[Desktop-App](/docs/desktop). Windows gehört nicht zur Beta.

## Ordner lässt sich nicht öffnen oder speichern

### Web-App im Browser

**Symptom:** In `/app` fehlt das Ordner-Symbol (Tooltip **Open local Markdown folder**).

**Ursache:** Der Browser unterstützt die File System Access API nicht; das gilt für Firefox und Safari.

**Schritte:** Chrome oder Edge verwenden, oder die [Desktop-App](/docs/desktop). Wer nur etwas
ausprobieren will, nimmt die [Browser-Demo](/demo).

**Symptom:** Neben dem Ordnernamen steht **Nur Lesen**.

**Ursache:** Der Ordner ist nur zum Lesen freigegeben.

**Schritte:** Auf **Nur Lesen** klicken. Der Browser fragt dann nach Schreibzugriff. Das geschieht
bewusst erst auf Klick, weil Browser eine Anfrage ohne Klick ablehnen.

![Echter Screenshot der Web-App: Ein lokaler Ordner ist geöffnet, neben dem Ordnernamen steht der Hinweis Nur Lesen](/docs/web-open-folder.png)

**Symptom:** Die Meldung „Schreibzugriff auf diesen Ordner wurde abgelehnt. Änderungen können nicht
gespeichert werden.“

**Ursache:** Der Schreibzugriff wurde im Browser-Dialog abgelehnt.

**Schritte:** Erneut auf **Nur Lesen** klicken und erlauben, oder den Ordner über das Ordner-Symbol neu
öffnen. Bis dahin lässt sich die Karte ansehen, aber nicht speichern. Brichst du den Auswahldialog
des Ordners ab, passiert nichts.

**Symptom:** Die Workspace-Karte lässt sich nicht bearbeiten; die App sagt, Workspace-Ansichten seien
abgeleitet.

**Ursache:** Die Workspace-Karte ist eine abgeleitete Übersicht und immer schreibgeschützt.

**Schritte:** Eine Datei in der Auswahlliste neben dem Ordnernamen öffnen oder in der Karte einen
Datei-Knoten wählen und dort bearbeiten.

### Desktop-App

**Symptom:** Die Ordnerübersicht lässt sich nicht bearbeiten; die App sagt „Die Workspace-Übersicht ist
nur lesbar. Öffne die Quelldatei zum Bearbeiten.“

**Ursache:** Die Ordnerübersicht ist schreibgeschützt, nur die einzelnen Dateien sind bearbeitbar.

**Schritte:** Einen Dateiknoten wählen und **Quelldatei öffnen** (oder **Ressource öffnen**), oder die
Datei im Datei-Browser öffnen. Gespeichert wird mit **Cmd+S** (macOS) bzw. **Ctrl+S** (Linux).

**Symptom:** Ein Konflikthinweis erscheint, während du eine Datei bearbeitest.

**Ursache:** Die Datei wurde außerhalb von BloomMD geändert.

**Schritte:** Dein Stand bleibt erhalten. Beide Stände prüfen, bevor du speicherst oder neu lädst.

## Der Sync-Status zeigt nicht „Synchronisiert“

Der Sync-Status steht in der Web-App in der Kopfzeile neben dem Dateititel. Er erscheint nur, wenn ein
Sync eingerichtet ist, und in Fenstern ab 1536 Pixel Breite. Sind mehrere Personen in der Datei,
zeigt er ihre Zahl in Klammern.

![Echter Screenshot der Kopfzeile der Web-App: Neben dem Dateititel Graphentheorie steht der Sync-Status Synchronisiert](/docs/sync-status.png)

- **Synchronisiert:** Die Verbindung steht, alles ist in Ordnung.
- **Verbinde … / Verbinde erneut …:** BloomMD baut die Verbindung auf. Dauert das an, das Netzwerk
  prüfen und die Datei neu öffnen. Nach Schlafmodus oder Netzwerkwechsel kann das nötig sein.
- **Offline:** Es gibt keine Verbindung. Bei einer geteilten lokalen Datei bleibt die lokale Datei
  bearbeitbar; neue lokale Änderungen gibt BloomMD nicht still als Cloud-Änderung aus. Stelle zuerst
  die Verbindung wieder her.
- **Verbindung fehlgeschlagen:** Daneben steht der Grund und der Link **Erneut verbinden**.

Die Gründe bei „Verbindung fehlgeschlagen“:

- **„Workspace-Datei nicht gefunden“:** Die Cloud-Datei gibt es im aktiven Workspace nicht. Den
  richtigen Workspace wählen und die Dateiliste neu laden.
- **„Workspace ist voll“:** Der Sync-Server hat sein Limit erreicht und nimmt für diese Datei keine
  weitere Verbindung an. Später mit **Erneut verbinden** noch einmal versuchen; hilft das nicht, melde
  es per Feedback.
- **„Zugriff auf diesen Workspace wurde entzogen“:** Du wurdest aus dem Workspace ausgeladen. Die letzte lokale Kopie bleibt erhalten, kann aber nicht mehr zurückschreiben. Nur ein Owner
  kann wieder Zugriff geben.
- **„Zugriff nicht autorisiert“:** Neu anmelden und prüfen, dass du mit der Adresse angemeldet bist, mit
  der du eingeladen wurdest.
- **„Sync-Ticket konnte nicht erneuert werden“:** Jede Verbindung braucht ein kurzlebiges Ticket.
  **Erneut verbinden**; klappt das nicht, neu anmelden.
- **„Verbindung konnte nicht wiederhergestellt werden“:** Die automatischen Versuche sind aufgebraucht.
  Netzwerk prüfen, dann **Erneut verbinden**.

**Konflikt beim Speichern:** Wurde die Datei gespeichert, während du daran gearbeitet hast, zeigt BloomMD
„Diese Datei wurde zwischenzeitlich geändert“ mit einem Vergleich (rot ist die gespeicherte Fassung,
grün ist deine). Nichts wird still überschrieben. Du wählst **Gespeicherte Fassung laden**, **Als Kopie
speichern** oder **Meine Fassung behalten**.

**Schreibgeschützt:** „Dieser Workspace ist schreibgeschützt (Viewer).“ heißt, deine Rolle ist Viewer.
Ein Owner kann dir die Rolle Editor geben.

**Neue Dateien anderer fehlen:** In der Beta kann die Dateiliste einen Reload brauchen. Änderungen in
bereits geöffneten Dateien erscheinen live.

In der Desktop-App heißen die Zustände einer geteilten lokalen Datei **Verbunden**, **Offline**,
**Konflikt** und **Zugriff entzogen**. Die Bedeutung ist dieselbe; mehr dazu unter
[Zusammenarbeit](/docs/collaboration).

## Freischaltung oder Zugang funktioniert nicht

![Echter Screenshot: Die Registrierungsseite bei aktivem Zugangsschalter mit dem Hinweis, dass der kostenlose Testaccount noch nicht freigeschaltet ist, und einem Feld für die E-Mail-Adresse](/docs/signup-gate.png)

### Registrierung

Normalerweise legst du den kostenlosen Testaccount selbst an, ohne Einladung und ohne Warteliste. Nur wenn der Betreiber den Zugangsschalter
aktiviert hat, siehst du „Dein kostenloser Testaccount ist noch nicht freigeschaltet.“ statt des Formulars.

- **„Dein kostenloser Testaccount ist für diese E-Mail-Adresse noch nicht freigeschaltet.“** Nimm genau die Adresse, für die
  der Testaccount freigeschaltet wurde. Ist sie noch nicht freigeschaltet, wende dich an das BloomMD-Team.
- **„Der Zugangscode ist ungültig.“** Den Code prüfen. Das Feld **Zugangscode (optional)** ist nur
  nötig, wenn du einen Code erhalten hast.
- **E-Mail zur Freischaltung nicht angekommen:** Spam- und Promotions-Ordner prüfen; ein Admin kann sie erneut
  senden.

![Echter Screenshot: Die Registrierungsseite, geöffnet über den Link aus der Freischaltungs-E-Mail, mit schon eingetragener E-Mail-Adresse](/docs/signup-invited.png)

### E-Mail-Bestätigung

- **„Bitte bestätige zuerst deine E-Mail-Adresse.“** Ohne bestätigte Adresse gibt es weder Login noch
  Sitzung. Öffne den Link aus der Bestätigungs-E-Mail; er ist 24 Stunden gültig.
- **„Der Bestätigungslink ist ungültig oder abgelaufen.“** Auf der Anmeldeseite **Bestätigungs-E-Mail
  erneut senden**.

### Einladung zu einem Workspace

Nach der Anmeldung bestätigst du den Beitritt ausdrücklich mit **Workspace beitreten**.

- **„Dieser Einladungslink ist ungültig oder nicht mehr verfügbar.“** oder **„Diese Workspace-Einladung
  ist nicht mehr aktiv.“** Den Einladenden um eine neue Einladung bitten.
- **„Diese Einladung ist abgelaufen.“** oder **„… wurde vom Workspace-Inhaber widerrufen.“** Auch hier
  hilft nur eine neue Einladung; die Seite bietet **Einladenden um eine neue Einladung bitten** an.
- **„Du bist bereits Mitglied in diesem Workspace.“** Mit **Workspace öffnen** weitermachen.
- **„Diese Einladung wurde an … gesendet. Du bist als … angemeldet.“** Du bist mit einer anderen Adresse
  angemeldet. **Abmelden und mit eingeladener Adresse anmelden** wählen.
- **„Dieser Einladungsübergang ist ungültig oder abgelaufen.“** Den Link in der Einladungsmail noch einmal
  öffnen; hilft das nicht, neu einladen lassen.
- **Die zweite Person sieht den Workspace nicht:** Prüfen, ob die Einladung angenommen wurde und ob sie mit
  genau der eingeladenen Adresse angemeldet ist. Ein Konto allein gibt keinen Zugriff.

Der vollständige Ablauf steht unter [Kostenloser Testaccount](/docs/closed-beta-zugang) und
[Zusammenarbeit](/docs/collaboration).

## Browser-Demo

![Echter Screenshot der Browser-Demo: Links ein Markdown-Eingabefeld, rechts die Karte der Vorlage Software Architecture Map](/docs/demo.png)

Die [Browser-Demo](/demo) braucht weder Konto noch die File System Access API. Sie öffnet einzelne
Markdown-Dateien oder eingefügten Text, keine Ordner.

**Symptom:** Es gibt keine Möglichkeit, einen Ordner zu öffnen.

**Ursache:** Die Demo arbeitet mit einer Datei oder mit eingefügtem Markdown.

**Schritte:** Für Ordner die Web-App in Chrome oder Edge oder die [Desktop-App](/docs/desktop) nutzen.

**Symptom:** Meine Änderungen sind nach dem Neuladen weg.

**Ursache:** Die Demo speichert nichts automatisch; dein Markdown bleibt im Browser, sofern du es nicht
herunterlädst.

**Schritte:** Vor dem Schließen **Download** wählen. Das Ergebnis ist eine `.md`-Datei.

**Symptom:** Meine Datei lässt sich nicht auswählen oder lädt nicht.

**Ursache:** Die Auswahl akzeptiert Markdown- und Textdateien (`.md`, `.markdown`).

**Schritte:** Die Datei umbenennen, oder den Text kopieren, in das Eingabefeld einfügen und **Eingefügtes
Markdown visualisieren** wählen.

## Wenn nichts davon passt

Nutze den Feedback-Button in der App; ein Screenshot ist Pflicht. Ist die App nicht erreichbar,
schreibe an `feedback@bloommd.io` mit Version, Wortlaut der Meldung und den Schritten bis zum Fehler.
Lade keine privaten Markdown-Inhalte, Zugangsdaten oder personenbezogenen Daten Dritter hoch.
