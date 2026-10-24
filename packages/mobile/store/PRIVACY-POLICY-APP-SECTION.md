# Vorschlag: App-Abschnitt für die Datenschutzerklärung

Die Datenschutzerklärung (`apps/marketing/src/app/datenschutz/page.tsx`) ist eine TSX-Seite ohne
Entwurfsmechanismus. Deshalb steht der Vorschlag hier und wird erst nach Owner-Freigabe (und am
besten juristischer Prüfung) als eigene `LegalSection` übernommen; danach `LEGAL_STATUS` in
`apps/marketing/src/lib/legal.ts` aktualisieren.

Grundlage: Code-Stand `packages/mobile` und `apps/app` (Share-Links), siehe `PRIVACY-ANSWERS.md`.

## Was die bestehende Seite abdeckt

- Verantwortlicher, Accountdaten, local-first, keine Zahlungen in M1, Resend, Sentry/Plausible/
  PostHog (Marketing/Web), optionaler Sync, Cookies, Warteliste, Rechtsgrundlagen, Betroffenenrechte.
- **Fehlt:** Mobile-App, Share-Links, Workspace-Agenten, Hosting-Standort, Speicherdauer der
  Cloud-Inhalte. Die neuen Abschnitte unten schließen die App-Lücke; Share-Links und Agenten sind
  kurz mit aufgenommen, weil App-Nutzer sie über den Workspace erreichen.

## Impressum / Anbieterkennzeichnung (Owner-Todo)

`apps/marketing/src/app/impressum/page.tsx` liest alle Angaben aus Umgebungsvariablen
(`BLOOMMD_LEGAL_*`). Ohne gesetzte Werte zeigt die Seite „Noch einzutragen vor Live-Verkauf“.
Vor dem Store-Eintrag müssen im Produktions-Deployment gesetzt sein: Name/Firma, Anschrift,
E-Mail, ggf. Telefon, USt-ID, inhaltlich Verantwortlicher. App Store Connect verlangt für den
EU-Digital-Services-Act-Händlerstatus Adresse, Telefon und E-Mail, die im EU-Store öffentlich
angezeigt werden; Google Play zeigt Entwickler-Adresse und E-Mail ebenfalls öffentlich. Die
Angaben sollten mit dem Impressum übereinstimmen.

---

## Deutsch

### BloomMD-App für iPad, iPhone, Mac und Android

**Lokale Dateien.** Die App bearbeitet Markdown-Dateien und Zeichnungen (SVG) entweder in ihrem
eigenen Ordner auf dem Gerät oder in einem Ordner, den du auswählst (iOS: Dateien-App, Android:
Ordnerauswahl), etwa deinem Obsidian-Vault in iCloud Drive. Diese Dateien werden nicht an uns übertragen. Ob und wohin
ein Ordner synchronisiert wird (z. B. iCloud Drive), bestimmt der jeweilige Speicheranbieter;
dafür gelten dessen Datenschutzbestimmungen, bei iCloud die von Apple. Damit der gewählte Ordner
nach einem Neustart wieder geöffnet werden kann, speichert die App einen Verweis darauf auf dem
Gerät.

**Keine Analyse, kein Tracking.** Die App enthält keine Analyse-, Werbe- oder Absturzbericht-Dienste
und verfolgt dich nicht über Apps und Websites anderer Anbieter hinweg.

**Optionale Anmeldung mit einem BloomMD-Konto.** Nur wenn du dich aktiv mit deinem BloomMD-Konto
anmeldest, überträgt die App Daten an unsere Server: die Inhalte der Maps, die du in deinen
Cloud-Workspaces öffnest und bearbeitest, sowie die zur Anmeldung nötigen Daten (E-Mail-Adresse,
Anzeigename, Zugangs-Token und ein Gerätename, damit du den Zugang in deinem Konto erkennen und
widerrufen kannst). Die Anmeldung selbst findet im Browser auf unserer Website statt; dein Passwort
gibst du nicht in der App ein. Während der gemeinsamen Bearbeitung sehen andere Mitglieder des
Workspaces deinen Namen und welchen Knoten du gerade ausgewählt hast. Die Übertragung erfolgt
verschlüsselt. Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Das
Zugangs-Token liegt verschlüsselt im Schlüsselbund (iOS) bzw. im Android Keystore; beim Abmelden
wird es auf dem Server widerrufen und auf dem Gerät gelöscht. Meldest du dich bei einem selbst
gehosteten BloomMD-Server an, ist dessen Betreiber verantwortlich. Die Server werden bei der
Hetzner Online GmbH betrieben [Standort: vom Owner zu bestätigen, z. B. Deutschland]. Inhalte
bleiben gespeichert, bis du sie oder dein Konto löschst; das Konto kannst du unter
https://bloommd.app/account löschen.

**Inhalte aus dem Internet.** Enthält eine Notiz ein Bild oder eine Vorschau von einer fremden
Website, lädt die App diese direkt von dort. Dabei erhält der jeweilige Anbieter deine IP-Adresse.

**Teilen.** Über das Teilen-Menü gibst du eine Map als Markdown an eine App deiner Wahl weiter; was
dort passiert, regelt diese App.

**Links in die App.** Links der Form `bloommd://open` öffnen eine Notiz des bereits geöffneten
Ordners. Dabei werden keine Daten übertragen.

### Share-Links (nur lesen)

In der Web-App kannst du für eine Map einen Link erzeugen, mit dem Personen ohne BloomMD-Konto die Map
lesen können. Der Link zeigt Titel, sichtbaren Text sowie Aufgaben- und Entscheidungsangaben der
Knoten. Frontmatter, Kommentare im Markdown und eingebettete Dateien wie Zeichnungen werden nicht
angezeigt. Ein Link kann ablaufen (1 bis 365 Tage) und jederzeit widerrufen werden. Wer den Link
kennt, kann die Map lesen.

### Workspace-Agenten

Workspace-Agenten (z. B. OpenClaw) laufen auf einem Rechner deiner Wahl, nicht bei uns. Ein Agent
erhält nur die Aufträge, die ihm im Workspace zugewiesen werden, und bei einem Knoten-Auftrag nur
diesen Knoten. Seine Ergebnisse sind Vorschläge, die ein Mitglied des Workspaces übernehmen muss.
Welche Dienste der Agent selbst nutzt (etwa ein Sprachmodell), entscheidest du bei seiner
Einrichtung. Die Mobile-App enthält keine Agenten-Funktionen.

---

## English

### BloomMD app for iPad, iPhone, Mac and Android

**Local files.** The app edits Markdown files and drawings (SVG) either in its own folder on the
device or in a folder you pick (iOS: Files app, Android: folder picker), such as your Obsidian
vault in iCloud Drive. These
files are not transmitted to us. Whether and where a folder is synced (e.g. iCloud Drive) is
decided by the respective storage provider, whose privacy policy applies – for iCloud, Apple's. To
reopen the chosen folder after a restart, the app stores a reference to it on the device.

**No analytics, no tracking.** The app contains no analytics, advertising or crash-reporting
services and does not track you across apps and websites owned by other companies.

**Optional sign-in with a BloomMD account.** Only when you actively sign in with your BloomMD account
does the app transmit data to our servers: the content of the maps you open and edit in your cloud
workspaces and the data needed to sign in (email address, display name, access token and a device
name so you can recognise and revoke the access in your account). Signing in happens in the browser
on our website; you never enter your password in the app. While editing
together, other members of the workspace see your name and which node you have selected. Data is
transmitted encrypted. The legal basis is performance of a contract (Art. 6(1)(b) GDPR). The
access token is stored encrypted in the keychain (iOS) or the Android Keystore; signing out revokes
it on the server and deletes it on the device. If you sign in to a self-hosted BloomMD server, its
operator is responsible. The servers are operated by
Hetzner Online GmbH [location: to be confirmed by the owner, e.g. Germany]. Content is kept until
you delete it or your account; you can delete your account at https://bloommd.app/account.

**Content from the internet.** If a note contains an image or a preview from another website, the
app loads it directly from there. The provider of that website receives your IP address.

**Sharing.** The share sheet hands a map as Markdown to an app of your choice; what happens there is
governed by that app.

**Links into the app.** Links like `bloommd://open` open a note in the folder that is already open.
No data is transmitted.

### Share links (read-only)

In the web app you can create a link that lets people without a BloomMD account read a map. The link
shows titles, visible text and task and decision details of the nodes. Frontmatter, Markdown
comments and embedded files such as drawings are not shown. A link can expire (1 to 365 days) and
can be revoked at any time. Anyone who knows the link can read the map.

### Workspace agents

Workspace agents (e.g. OpenClaw) run on a computer of your choice, not on our servers. An agent only
receives tasks assigned to it in the workspace, and for a node task only that node. Its results are
proposals that a workspace member has to accept. Which services the agent itself uses (such as a
language model) is up to you when you set it up. The mobile app contains no agent features.
