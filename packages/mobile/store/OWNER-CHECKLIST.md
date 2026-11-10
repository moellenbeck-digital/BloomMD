# Owner-Checkliste: App Store Connect und Play Console

Klickliste für die Einträge von BloomMD (`app.bloommd.mobile`, Version 1.0.0). Stand: 4. November
2026, Texte und Antworten gegen den Code geprüft (Ticket #26, Epic #30). **Nichts davon ist
veröffentlicht oder hochgeladen.** Tags, Deployments und Store-Uploads machst du selbst oder gibst
sie ausdrücklich frei (AGENTS.md, „Release- und Kommunikationspflichten“). Die Menünamen in
App Store Connect und Play Console ändern sich gelegentlich; maßgeblich sind die Inhalte.

Quellen in diesem Ordner: Texte unter `ios/metadata/` und `android/metadata/`, Antworten in
`PRIVACY-ANSWERS.md`, Text für die Reviewer in `REVIEW-NOTES.md` (Englisch), Screenshots unter
`screenshots/`.

## 1. Reihenfolge

1. **Website vorbereiten** (Abschnitt 2): Pull Request #240 prüfen und freigeben, Hilfeseite
   freischalten, `BLOOMMD_LEGAL_*` setzen, Datenschutzerklärung juristisch prüfen, deployen.
2. **Demo-Konto anlegen** (Abschnitt 3).
3. **Entwicklerkonten und Händlerangaben** (Abschnitt 4).
4. **App Store Connect** (Abschnitt 5): App anlegen → Metadaten → Screenshots → App-Datenschutz →
   Altersfreigabe → Verschlüsselung → Review-Angaben → Build → einreichen.
5. **Play Console** (Abschnitt 6), sobald der Android-Build (#28) steht.
6. **Nach der Freigabe** (Abschnitt 8): Universal Links prüfen, News und Blog freischalten.

Warum diese Reihenfolge: Apple und Google rufen Support-, Datenschutz- und Lösch-URL beim Review
auf. Sie müssen vorher öffentlich erreichbar sein, sonst wird der Eintrag abgelehnt.

## 2. Website (bloommd.io) vor dem ersten Klick

Der Pull Request ändert Texte und Seiten, **deployt aber nichts**.

- [ ] **Hilfeseite `docs/ipad`:** Liegt als `apps/marketing/content/docs/ipad.md` und `ipad-en.md`
  mit `draft: true`, damit sie erst mit dem Release live geht (wie `android.md`). Zum Freischalten
  `draft: true` in beiden Dateien entfernen, deployen und prüfen:
  `https://bloommd.io/docs/ipad` und `https://bloommd.io/docs/ipad?lang=en`. Kontaktadresse darin:
  `feedback@bloommd.io` (steht schon auf den Seiten Desktop, Web und Download).
- [ ] **Datenschutzerklärung:** `apps/marketing/src/app/datenschutz/page.tsx` hat jetzt Abschnitte
  für die App, Share-Links und Workspace-Agenten (DE/EN), `LEGAL_STATUS` ist „4. November 2026“.
  **Juristische Prüfung und deine Freigabe vor dem Deployment.** Offen im Text: Hosting-Anbieter und
  Standort der Server sind bewusst nicht genannt (nicht belegt); ergänze sie nach Prüfung.
- [ ] **Impressum** (`/impressum`): Die Seite liest alle Angaben aus der Umgebung des
  Marketing-Deployments. Ein Test (`src/app/legal-pages.test.tsx`) belegt, dass sie mit gesetzten
  Werten korrekt rendert (DE und EN). Du setzt die Werte; im Repo steht keiner.

  | Variable | Pflicht | Hinweis |
  |---|---|---|
  | `BLOOMMD_LEGAL_BUSINESS_NAME` | ja | Name der Firma / des Anbieters |
  | `BLOOMMD_LEGAL_OWNER_NAME` | ja | Inhaber/Vertretungsberechtigte |
  | `BLOOMMD_LEGAL_STREET` | ja | ladungsfähige Anschrift |
  | `BLOOMMD_LEGAL_POSTAL_CITY` | ja | PLZ und Ort |
  | `BLOOMMD_LEGAL_EMAIL` | ja | muss eine gültige Adresse sein; Kontakt im Impressum und in der Datenschutzerklärung |
  | `BLOOMMD_LEGAL_RESPONSIBLE_CONTENT` | ja | inhaltlich Verantwortlicher |
  | `BLOOMMD_LEGAL_COUNTRY` | nein | Standard: Deutschland |
  | `BLOOMMD_LEGAL_PHONE` | für den Store ja | Apple verlangt für den Händlerstatus (DSA) eine Telefonnummer, Google ebenfalls; sie sollte mit dem Impressum übereinstimmen |
  | `BLOOMMD_LEGAL_REGISTER_COURT`, `BLOOMMD_LEGAL_REGISTER_NUMBER` | falls eingetragen | sonst „Nicht angegeben“ |
  | `BLOOMMD_LEGAL_VAT_ID` | falls vorhanden | sonst „Nicht angegeben“ |

  Ohne die sechs Pflichtwerte zeigt die Seite „Noch einzutragen vor Live-Verkauf“ und
  `release:check` lehnt das Deployment ab. Vorlagen: `apps/marketing/.env.example`.
- [ ] **Universal Links / App Links** (optional vor dem Upload, nötig für `https://bloommd.io/open`):
  `APPLE_TEAM_ID` (10 Zeichen, Apple Developer → Membership) und `ANDROID_CERT_SHA256`
  (SHA-256-Fingerabdruck des **Play-App-Signing-Zertifikats**, mehrere durch Komma) im
  Marketing-Deployment setzen. Ohne Werte antworten `/.well-known/apple-app-site-association` und
  `/.well-known/assetlinks.json` mit 404; die App funktioniert dann nur mit `bloommd://`.
- [ ] **bloommd.app:** Muss beim Review erreichbar sein, mit der Mobile-Anmeldung
  (`/auth/mobile`, `/api/mobile/*`) und der Kontoseite `https://bloommd.app/account` (Konto
  löschen). Die App-Variante der Datenschutzerklärung (`apps/app/src/app/datenschutz/page.tsx`) hat
  eine eigene Kopie und ist in diesem Ticket **nicht** angepasst.
- [ ] `bun run --cwd packages/mobile store:check` ist grün (Zeichenlimits, Pflichtdateien).

## 3. Demo-Konto

- [ ] Konto auf `https://bloommd.app` anlegen, **E-Mail-Adresse bestätigen** (ohne Bestätigung ist
  kein Login möglich).
- [ ] Steht `BLOOMMD_BETA_ACCESS=1`, die Adresse auf die Allowlist setzen
  (`BLOOMMD_BETA_ALLOWED_EMAILS`), sonst fehlt der Cloud-Zugang.
- [ ] Einen Cloud-Workspace mit ein, zwei harmlosen Maps anlegen, nichts Privates.
- [ ] Zugangsdaten **nur** in die Review-Felder eintragen (App Store Connect: *App-Review-Informationen
  → Anmeldeinformationen*; Play Console: *App-Inhalte → App-Zugriff*), **nie** ins Repo, in einen PR
  oder in den Chat. In `REVIEW-NOTES.md` stehen nur die Platzhalter `<DEMO-ACCOUNT-EMAIL>` und
  `<DEMO-ACCOUNT-PASSWORD>`; beim Einfügen des Textes ersetzt du sie.
- [ ] Passwort nach der Prüfung ändern oder das Konto löschen, wenn es nicht dauerhaft für Reviews
  bleiben soll.

## 4. Konten und Händlerangaben

- [ ] **Apple Developer Program:** Mitgliedschaft aktiv, Vereinbarungen akzeptiert (für eine
  kostenlose App genügt die Entwicklervereinbarung; ein Vertrag für kostenpflichtige Apps ist nicht
  nötig, es gibt keine In-App-Käufe).
- [ ] **Händlerangaben (Digital Services Act, „Trader“):** In App Store Connect (Geschäftsangaben /
  Compliance) angeben, dass du Händler bist, mit Anschrift, Telefonnummer und E-Mail-Adresse. Diese
  Angaben sind im Store der EU öffentlich sichtbar. **Gleich dem Impressum halten** (Abschnitt 2).
- [ ] **Google Play:** Entwicklerkonto mit Adresse, E-Mail und Telefon; Name, Adresse und E-Mail
  werden öffentlich angezeigt. Das Profil prüfen und mit dem Impressum abgleichen. Bei einem
  *persönlichen* Konto, das neu angelegt wurde, verlangt Google vor der Produktion einen
  geschlossenen Test mit einer Mindestzahl Testern über 14 Tage; bei einem Organisationskonto
  entfällt das (Stand der Google-Richtlinien prüfen).
- [ ] **Bundle-ID** `app.bloommd.mobile` unter *Certificates, Identifiers & Profiles* registriert,
  Capability *Associated Domains* aktiv (`App.entitlements` enthält `applinks:bloommd.io`).

## 5. App Store Connect

### 5.1 App anlegen

- [ ] *Apps → Neue App*: Plattform iOS, Name **BloomMD**, Primärsprache Deutsch, Bundle-ID
  `app.bloommd.mobile`, SKU frei wählbar (z. B. `bloommd-mobile`). Zweite Sprache **Englisch (USA)**
  unter *Lokalisierungen* hinzufügen. Ist der Name vergeben: Entscheidung D2 (Abschnitt 7).
- [ ] *Preise und Verfügbarkeit*: kostenlos, Länder nach Wunsch. Die App ist auch auf Macs mit Apple
  Silicon verfügbar (entschieden; der Satz am Ende der Beschreibung bleibt).
- [ ] Kategorien: primär **Produktivität**, sekundär **Bildung** (`primary_category.txt`,
  `secondary_category.txt`). Urheberrecht: `2026 Möllenbeck Digital` (`copyright.txt`).

### 5.2 Metadaten (Version 1.0.0, je Sprache)

Per `fastlane deliver --metadata_path packages/mobile/store/ios/metadata --skip_screenshots` oder
von Hand aus den Dateien kopieren:

| Feld in App Store Connect | Datei in `ios/metadata/de-DE/` bzw. `en-US/` |
|---|---|
| Name (≤ 30) | `name.txt` |
| Untertitel (≤ 30) | `subtitle.txt` |
| Werbetext (≤ 170) | `promotional_text.txt` |
| Beschreibung (≤ 4000) | `description.txt` |
| Schlüsselwörter (≤ 100) | `keywords.txt` |
| Support-URL | `support_url.txt` → `https://bloommd.io/docs/ipad` (EN: `?lang=en`) |
| Marketing-URL | `marketing_url.txt` |
| Datenschutz-URL | `privacy_url.txt` → `https://bloommd.io/datenschutz` (EN: `?lang=en`) |
| Neue Funktionen | `release_notes.txt` (bei der ersten Version zeigt Apple das Feld nicht) |

- [ ] Support-URL und Datenschutz-URL öffnen und prüfen, dass sie ohne Anmeldung laden.

### 5.3 Screenshots

- [ ] iPhone **6,9"** (1320 × 2868) und iPad **13"** (2064 × 2752), je Sprache sechs Bilder:
  `screenshots/ios/<de-DE|en-US>/<iphone-6.9|ipad-13>/01…06`. Apple skaliert kleinere Displays daraus.
  Die gerahmten Varianten (`screenshots/ios-framed/…`) sind optional; Entscheidung D1.
- [ ] Reihenfolge 01 Map, 02 Handschrift, 03 Vault, 04 Gliederung, 05 Aufgaben, 06 Präsentation.
  Die Bilder zeigen den Stand des Aufnahmetags (iOS 26.4); nach UI-Änderungen neu aufnehmen
  (README, „Neu aufnehmen“).

### 5.4 App-Datenschutz, Altersfreigabe, Verschlüsselung

- [ ] **App-Datenschutz:** Antworten und Datentypen stehen in `PRIVACY-ANSWERS.md` („Apple: App
  Privacy“): Daten werden nur bei optionaler Anmeldung erhoben: *E-Mail-Adresse* und *Andere
  Nutzerinhalte*, mit Identität verknüpft, kein Tracking, Zweck *App-Funktionalität*. Muss mit
  `ios/App/App/PrivacyInfo.xcprivacy` übereinstimmen. Nach dem Archivieren in Xcode *Generate
  Privacy Report* prüfen.
- [ ] **Konto löschen (Richtlinie 5.1.1(v)):** In der App unter dem Anmelde-Bereich „Konto verwalten
  oder löschen“ (öffnet `https://bloommd.app/account`). Prüfen, dass die Seite erreichbar ist.
- [ ] **Altersfreigabe:** Fragebogen mit „Keine“ bzw. „Nein“ (Gewalt, Sexualität, Glücksspiel,
  Werbung, Webzugang …) beantworten, erwartetes Ergebnis **4+**; Details und Begründung in
  `PRIVACY-ANSWERS.md`. „Für Kinder“-Kategorie: Nein. Die Frage nach uneingeschränktem Webzugang
  hängt an Entscheidung D4.
- [ ] **Exportkonformität:** Nur Standard-Verschlüsselung (HTTPS/TLS, Schlüsselbund). Der Schlüssel
  `ITSAppUsesNonExemptEncryption = false` steht in `Info.plist`, App Store Connect fragt dann pro
  Build nicht nach; die Frage nach der Verschlüsselung mit „Nur Standard / ausgenommen“
  beantworten. Frankreich-Erklärung nicht nötig.
- [ ] **Preise / In-App-Käufe:** keine. **Werbung:** keine.

### 5.5 App-Review-Informationen

- [ ] Kontakt für Rückfragen (Name, Telefon, E-Mail): deine Angaben.
- [ ] *Anmeldung erforderlich*: Demo-Konto (Abschnitt 3) in den dafür vorgesehenen Feldern.
  Die App ist ohne Konto voll nutzbar; das Konto ist nur für die optionale Cloud.
- [ ] *Hinweise*: Text zwischen den Markern `paste:` aus `REVIEW-NOTES.md` einfügen,
  Platzhalter ersetzen. Optional einen Demo-Vault als Anhang beilegen (Erzeugung steht in
  `REVIEW-NOTES.md`).

### 5.6 Build und Einreichung

- [ ] **Build:** Der Workflow `iOS Release` (`.github/workflows/ios-release.yml`) archiviert, signiert
  und lädt nach TestFlight hoch. Er startet nur von Hand oder für ein Tag `mobile-v1.0.0`; das Tag
  setzt du bzw. gibst du frei. Die Zugangsdaten (`APPLE_TEAM_ID`, `APPLE_API_KEY_ID`,
  `APPLE_API_ISSUER_ID`, Schlüssel `.p8`) liegen im konfigurierten Secret-Speicher, nicht im Repo.
  Die Buildnummer ist die Workflow-Nummer.
- [ ] Den hochgeladenen Build der Version 1.0.0 zuordnen, auf einem echten Gerät (iPad mit Apple
  Pencil) die Schritte aus `REVIEW-NOTES.md` durchgehen.
- [ ] *Zur Prüfung hinzufügen* → *Zur Prüfung einreichen*. Veröffentlichung auf **manuell** stellen
  (Entscheidung D6), damit du den Zeitpunkt bestimmst.

## 6. Google Play Console

Voraussetzung ist der Android-Build aus #28. Der Workflow `android.yml` lädt nur in den
**internen Test** hoch, nie in die Produktion.

- [ ] *App erstellen*: Name **BloomMD – Markdown Mind Maps** (28 Zeichen, `title.txt`), Standardsprache
  Deutsch (de-DE), App (kein Spiel), kostenlos. Englisch (en-US) als zweite Sprache.
- [ ] *Store-Eintrag* je Sprache: Kurzbeschreibung (`short_description.txt`, ≤ 80), vollständige
  Beschreibung (`full_description.txt`, ≤ 4000). „Was ist neu“: `changelogs/1.txt` (≤ 500).
- [ ] **Grafiken (fehlen noch):** App-Symbol 512 × 512 aus dem BloomMD-Zeichen, Feature-Grafik
  1024 × 500, Screenshots für Smartphone und 7"/10"-Tablet (je 2–8, Seitenverhältnis höchstens 2:1).
  Es gibt bisher nur iOS-Screenshots.
- [ ] *App-Inhalte*: **Datenschutzerklärung** `https://bloommd.io/datenschutz`; **App-Zugriff**: Kurztext
  aus `REVIEW-NOTES.md` (`paste-short:`) mit dem Demo-Konto; **Werbung**: keine; **Inhaltsangaben
  (IARC)** und **Zielgruppe** (13+, nicht für Kinder) nach `PRIVACY-ANSWERS.md`;
  **Datensicherheit** nach `PRIVACY-ANSWERS.md` („Google Play: Data safety“), inklusive
  **Lösch-URL** `https://bloommd.app/account` und der E-Mail-Adresse aus dem Impressum als zweitem
  Weg; **Konto löschen**: dieselbe URL.
- [ ] *Kategorie*: Produktivität; Kontaktdaten des Eintrags (E-Mail, Website `https://bloommd.io`).
- [ ] *Play App Signing*: Das Zertifikat, das Google zum Signieren nutzt, liefert den
  SHA-256-Fingerabdruck für `ANDROID_CERT_SHA256` (Abschnitt 2).
- [ ] Build aus dem internen Test in die gewünschte Spur heben und zur Prüfung senden; vorher den
  Play-Text gegen den echten Android-Build prüfen (README, „Bekannte Punkte“).

## 7. Offene Owner-Entscheidungen

| Nr. | Frage | Vorschlag |
|---|---|---|
| D1 | Screenshots: Rohbilder oder gerahmte Varianten (mit Überschrift)? | Rohbilder zuerst, gerahmte als Alternative testen |
| D2 | Ist der Name „BloomMD“ im App Store frei? Wenn nicht, welcher Ersatzname (Untertitel trägt die Beschreibung)? | In App Store Connect beim Anlegen prüfen |
| D3 | Support-Kontakt: `feedback@bloommd.io` (schon auf der Website genannt) oder eine eigene Support-Adresse? | `feedback@bloommd.io` beibehalten; sonst Hilfeseite und Impressum anpassen |
| D4 | Altersfreigabe „Uneingeschränkter Webzugang“: Der In-App-Browser öffnet nur `/auth/mobile` und `/account`; nur über „Erweitert: eigener Server“ lässt sich ein anderer `https://`-Server eintragen. Antwort „Nein“ vertretbar. | „Nein“; bei Rückfrage von Apple Begründung aus `PRIVACY-ANSWERS.md` |
| D5 | Datenschutzerklärung: Hosting-Anbieter, Serverstandort, Speicherdauer ergänzen; juristische Prüfung; gleiche Fassung auch für `bloommd.app/datenschutz`? | Prüfung vor dem Deployment |
| D6 | Veröffentlichung nach Freigabe manuell oder automatisch? Tag `mobile-v1.0.0` und GitHub-Release: wann? | manuell |
| D7 | Apple-Datentypen: Reicht *E-Mail-Adresse* + *Andere Nutzerinhalte*? Falls Apple im Review Name und Nutzer-ID sehen will, im Privacy Manifest und in den Antworten gemeinsam ergänzen. | Wie jetzt einreichen |
| D8 | Mac mit Apple Silicon: iPad-App dort anbieten (bisher: ja). | ja |
| D9 | News und Blog zur iPad-App (`apps/marketing/content/news/bloommd-ipad-app*.md`, `content/blog/…ipad…`, `draft: true`): Zeitpunkt der Veröffentlichung, Wortlaut „App Store in Vorbereitung“ → „jetzt im App Store“. | Erst nach Freigabe durch Apple |
| D10 | Google Play: persönliches oder Organisationskonto? Davon hängt der geschlossene Test (14 Tage) ab. | Je nach vorhandenem Konto; vor dem Zeitplan klären |
| D11 | Preis und Länder; Altersgrenze 13+ für Google Play bestätigen. | kostenlos (keine In-App-Käufe im Code); Länder nach Wunsch |
| D12 | Demo-Konto dauerhaft oder nur für den Review? | nur für den Review |

## 8. Nach der Freigabe

- [ ] `/.well-known/apple-app-site-association` und `/.well-known/assetlinks.json` liefern 200 (mit
  `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`); ein Link `https://bloommd.io/open?path=…` öffnet die App.
- [ ] News und Blog freischalten (`draft: true` entfernen), Changelog „In Entwicklung“ in die
  Version verschieben, `docs/ipad` zeigt den richtigen Stand.
- [ ] Neue Versionen: SemVer in `packages/mobile/package.json` erhöhen
  (`bun run --cwd packages/mobile ios:version --check`), `release_notes.txt` und
  `changelogs/<versionCode>.txt` neu schreiben.
