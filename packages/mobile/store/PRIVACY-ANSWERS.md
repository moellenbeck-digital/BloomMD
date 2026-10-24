# Datenschutz-, Altersfreigabe- und Export-Antworten

Abgeleitet aus dem Code-Stand von `packages/mobile` mit Anmeldung ([Archiv #503](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/503)) und iOS-Projekt ([Archiv #502](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/502)),
Oktober 2026. Maßgeblich für Apple ist `packages/mobile/ios/App/App/PrivacyInfo.xcprivacy`; die
Antworten hier stimmen damit überein. Jede Änderung an Netzwerk, Anmeldung oder SDKs macht eine neue
Prüfung nötig.

## Grundlage: was die App tatsächlich tut

- [x] **Keine Telemetrie:** Kein Sentry, PostHog, Plausible, Firebase, Crashlytics oder ähnliches in
  `packages/mobile`, `packages/ui`, `packages/ink`, `packages/capacitor-folder`,
  `packages/capacitor-keychain` (grep geprüft). Die Marketing-Website nutzt Sentry/Plausible/PostHog,
  die App nicht.
- [x] **Keine Werbung, kein Tracking, keine In-App-Käufe, keine Drittanbieter-SDKs** außer Capacitor
  (`@capacitor/app`, `browser`, `filesystem`, `share`) und den eigenen Plugins
  `@bloommd/capacitor-folder` und `@bloommd/capacitor-keychain`.
- [x] **Lokale Dateien werden nicht erhoben:** Maps liegen im App-Ordner oder in einem vom Nutzer
  gewählten Ordner (iOS: Dateien-App, Security-Scoped Bookmark in `UserDefaults`; Android: Storage
  Access Framework). Synchronisation dieses Ordners (iCloud Drive, Nextcloud, Syncthing …) macht das
  Betriebssystem bzw. der Speicheranbieter, nicht BloomMD.
- [x] **Anmeldung optional, im Browser:** „Mit BloomMD-Konto anmelden“ öffnet `bloommd.app` (oder
  einen selbst gehosteten Server) im In-App-Browser (Safari View Controller / Custom Tabs),
  Authorization Code + PKCE (`src/mobile-auth.ts`). Das Passwort gibt der Nutzer nur auf der Website
  ein. Das Zugangstoken liegt im iOS-Schlüsselbund bzw. Android Keystore, nie im WebView-Speicher;
  „Abmelden“ widerruft es auf dem Server und löscht es auf dem Gerät.
- [x] **Netzwerk nur mit Anmeldung:** Danach spricht `src/remote-client.ts` den Server des Kontos an
  (`/api/mindmaps`, `/api/sync-ticket`), dann WebSocket-Sync (Yjs) mit Präsenz (Name, Farbe,
  ausgewählter Knoten). Übertragen werden E-Mail-Adresse/Name des Kontos (in der App angezeigt) und
  die Maps, die der Nutzer im Cloud-Workspace öffnet oder bearbeitet.
- [x] **Link-Vorschau:** ruft im Mobile-Build eine relative URL `/api/link-preview` auf, die in der
  App nicht existiert – kein externer Aufruf.
- [x] **Inhalte des Nutzers:** Bilder oder Website-Vorschaubilder, die der Nutzer selbst in eine Notiz
  schreibt, lädt die WebView direkt vom jeweiligen Server. Das ist keine Datenerhebung durch den
  Entwickler, gehört aber in die Datenschutzerklärung.
- [x] **Teilen:** über das System-Teilen-Menü (`@capacitor/share`), nur auf Nutzeraktion.
- [x] **Deep Links:** `bloommd://open?path=…&node=…` öffnet nur eine Notiz im bereits geöffneten
  Ordner; `bloommd://auth?…` schließt nur eine in der App gestartete Anmeldung ab (State-Prüfung).
- [x] **Share-Links (nur lesen) und Agenten** werden in der Web-App (`bloommd.app`) angelegt, nicht in
  der Mobile-App.

## Apple: App Privacy („Datenschutz der App“)

- [ ] **Erheben Sie oder Drittanbieter Daten von dieser App?** → **Ja** – nur wenn sich der Nutzer
  mit einem BloomMD-Konto anmeldet. Ohne Anmeldung verlässt nichts das Gerät.
- [ ] **Datentypen** (genau wie im Privacy Manifest):

| Datentyp (App Store Connect) | Mit Identität verknüpft | Tracking | Zweck |
|---|---|---|---|
| Kontaktinformationen › E-Mail-Adresse | Ja | Nein | App-Funktionalität |
| Nutzerinhalte › Andere Nutzerinhalte | Ja | Nein | App-Funktionalität |

  Nicht erhoben: Name als eigener Typ (Anzeigename gehört zum Konto, nicht separat abgefragt),
  Identifikatoren, Diagnose, Nutzungsdaten, Standort, Kontakte, Fotos, Finanzen, Gesundheit,
  Browser-/Suchverlauf, sensible Daten.
  Hinweis: Wenn Apple im Review den Anzeigenamen/die Konto-ID als eigene Typen sehen will, im Manifest
  und hier gemeinsam ergänzen (*Kontaktinformationen › Name*, *Identifikatoren › Nutzer-ID*).
- [ ] **Tracking:** Nein. Kein App-Tracking-Transparency-Dialog (kein IDFA, keine Weitergabe an
  Datenhändler oder Werbenetzwerke). `NSPrivacyTracking` = false, keine Tracking-Domains.
- [ ] **Datenschutz-URL:** `https://bloommd.io/datenschutz` (App-Abschnitt ergänzen, siehe
  `PRIVACY-POLICY-APP-SECTION.md`).
- [ ] **Konto löschen (Guideline 5.1.1(v)):** Im Anmelde-Browser lässt sich über „Konto erstellen“
  ein Konto anlegen, also muss die Löschung aus der App heraus erreichbar sein. Die App zeigt
  angemeldet den Link **„Konto verwalten oder löschen“** (öffnet `https://bloommd.app/account`,
  Abschnitt „Account dauerhaft löschen“: E-Mail und Passwort bestätigen, löscht persönliche
  Workspaces, Cloud-Dokumente, Views, Sessions und Berechtigungen, `apps/app/src/app/api/account/delete`).
- [ ] **Privacy Manifest:** vorhanden ([Archiv #502](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/502)) – E-Mail und andere Nutzerinhalte wie oben; Required-
  Reason-APIs `FileTimestamp` (C617.1, 3B52.1) und `UserDefaults` (CA92.1). Nach dem Archivieren in
  Xcode *Generate Privacy Report* prüfen.

## Google Play: Data safety („Datensicherheit“)

- [ ] **Erhebt oder teilt die App erforderliche Nutzerdatentypen?** → **Ja** (nur bei Anmeldung).
- [ ] **Werden alle Daten bei der Übertragung verschlüsselt?** → **Ja**. `normalizeServerUrl` lässt
  nur `https://` zu (`http://` ausschließlich für localhost in der Entwicklung).
- [ ] **Können Nutzer die Löschung ihrer Daten beantragen?** → **Ja**.
  **Lösch-URL:** `https://bloommd.app/account` (Abschnitt „Account dauerhaft löschen“; nach Anmeldung,
  ohne App nutzbar). Alternativ per E-Mail an die Adresse aus dem Impressum – im Formular als
  zweiten Weg nennen, weil die Löschung auf der Website ein Passwort verlangt.
- [ ] **Kontoerstellung:** „Die App ermöglicht Nutzern, ein Konto zu erstellen“ → über die Website
  (Anmelde-Browser), Methode „Benutzername und Passwort“; Lösch-URL wie oben.
- [ ] **Datentypen** (jeweils *erhoben: ja*, *geteilt: nein*, *nur flüchtig verarbeitet: nein*,
  *optional: ja* – Anmeldung ist freiwillig; Zweck: *App-Funktionen*, *Kontoverwaltung*):
  - Persönliche Daten › E-Mail-Adresse
  - Dateien und Dokumente › Dateien und Dokumente (Maps im Cloud-Workspace)
- [ ] **Nicht erhoben:** Name (separat), Nutzer-IDs, Standort, Finanzdaten, Gesundheit, Nachrichten,
  Fotos/Videos, Audio, Kontakte, Kalender, App-Aktivität, Web-Browsing, App-Info und -Leistung
  (keine Absturzberichte), Geräte-IDs. Lokale Ordner (SAF) werden nur auf dem Gerät gelesen und
  geschrieben und zählen nicht als Erhebung.
- [ ] **Werbung:** „Enthält keine Werbung“.
- [ ] Gilt nur, solange der Android-Build (#28) keine zusätzlichen SDKs (Firebase, Crash-Reporting)
  erhält – vor dem Upload mit `packages/mobile/android/app/build.gradle` abgleichen.

## Altersfreigabe

### Apple (Fragebogen ab 2025, Stufen 4+/9+/13+/16+/18+)

- [ ] Gewalt (Cartoon/realistisch/drastisch), Horror, sexuelle Inhalte/Nacktheit, Obszönitäten/
  derber Humor, Alkohol/Tabak/Drogen, Glücksspiel (simuliert/real), Wettbewerbe, medizinische
  Informationen, Waffen → jeweils **Keine**.
- [ ] Nutzergenerierte Inhalte / Kommunikation zwischen Nutzern → **Nein**. Begründung: Die App zeigt
  nur eigene Dateien bzw. Maps aus Workspaces, zu denen der Nutzer gezielt eingeladen wurde; es gibt
  keine öffentliche Inhalte-Suche, keinen Chat, keine Profile. Share-Links entstehen in der Web-App
  und sind nur lesbar. Falls Apple nach „Teilen von Inhalten mit anderen Nutzern“ fragt:
  **Ja, nur mit eingeladenen Workspace-Mitgliedern** – das ändert die Stufe nicht.
- [ ] Uneingeschränkter Webzugang → **Nein**. Der In-App-Browser öffnet nur die Anmeldung und die
  Kontoseite des BloomMD-Servers; es gibt keine freie Adresseingabe.
- [ ] Werbung → **Nein**. Altersverifikation/Kindersicherung → **Nein**.
- [ ] Erwartetes Ergebnis: **4+**.
- [ ] „Made for Kids“/Kinder-Kategorie: **Nein**.

### Google Play (IARC)

- [ ] Kategorie: **Hilfsprogramm, Produktivität, Kommunikation oder Sonstiges**.
- [ ] Gewalt, Angst, Sexualität, Glücksspiel, Sprache, Drogen → **Nein**.
- [ ] Interagieren Nutzer miteinander oder tauschen Inhalte aus? → **Ja**, nur bei optionaler Cloud
  (gemeinsame Bearbeitung mit eingeladenen Workspace-Mitgliedern). Teilen von Standort → **Nein**.
  Käufe digitaler Güter → **Nein**.
- [ ] Erwartetes Ergebnis: **PEGI 3, USK 0, ESRB Everyone** (ggf. mit Hinweis „Users Interact“).
- [ ] **Zielgruppe:** 13–15, 16–17, 18+ (nicht unter 13). Damit gilt die Familienrichtlinie nicht;
  die App ist nicht für Kinder gestaltet. Für Schüler ab 13 passt das Lern-Szenario trotzdem.

## Exportkonformität (Verschlüsselung)

- [ ] Die App nutzt nur Verschlüsselung des Betriebssystems (HTTPS/TLS, WSS) und keine eigene
  Kryptografie → **ausgenommen**; Frage „Verwendet Ihre App Verschlüsselung?“ → nur Standard-
  Verschlüsselung / *Keine der genannten Algorithmen* (Ausnahme nach Kategorie 5 Teil 2).
- [x] **Info.plist:** `ITSAppUsesNonExemptEncryption` = `false` ist gesetzt ([Archiv #502](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/502)); TestFlight fragt
  deshalb nicht bei jedem Build nach. Schlüsselbund/Keystore und PKCE (SHA-256) nutzen nur
  Betriebssystem-Funktionen zum Schutz von Zugangsdaten bzw. zur Authentifizierung – ebenfalls
  ausgenommen.
- [ ] Frankreich-Erklärung: nicht nötig bei ausschließlich ausgenommener Verschlüsselung.
- [ ] Google Play: keine eigene Export-Erklärung; Verschlüsselung über Android/OkHttp-Standard.
