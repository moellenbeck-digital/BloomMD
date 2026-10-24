# Store-Einträge BloomMD (App Store und Google Play)

Alles, was die Store-Einträge der Mobile-App (`app.bloommd.mobile`) brauchen, als versionierte
Dateien. Ticket: #26 (Epic #30). Nichts davon ist veröffentlicht; Upload erst nach Owner-Freigabe.

## Struktur

```
store/
  ios/metadata/                    fastlane deliver (metadata_path)
    copyright.txt                  "2026 Möllenbeck Digital"
    primary_category.txt           PRODUCTIVITY
    secondary_category.txt         EDUCATION
    de-DE/ en-US/
      name.txt                     ≤ 30
      subtitle.txt                 ≤ 30
      promotional_text.txt         ≤ 170 (jederzeit ohne Review änderbar)
      description.txt              ≤ 4000
      keywords.txt                 ≤ 100, kommagetrennt ohne Leerzeichen
      release_notes.txt            ≤ 4000 ("Neue Funktionen")
      support_url.txt / marketing_url.txt / privacy_url.txt
  android/metadata/                fastlane supply (metadata_path)
    de-DE/ en-US/
      title.txt                    ≤ 30
      short_description.txt        ≤ 80
      full_description.txt         ≤ 4000
      changelogs/1.txt             ≤ 500, Dateiname = versionCode (erster Upload: 1)
  screenshots/ios/<de-DE|en-US>/<iphone-6.9|ipad-13>/NN-*.png          echte Simulator-Screenshots (Upload)
  screenshots/ios-framed/<de-DE|en-US>/<iphone-6.9|ipad-13>/NN-*.png   dieselben mit Überschrift (optional)
  screenshots/harness/             Demo-Vault, Screenshot-Build, Aufnahme- und Rahmen-Skript
  check-metadata.ts                Zeichenlimits und Pflichtdateien prüfen
  PRIVACY-ANSWERS.md               App Privacy (Apple), Data safety (Google), Altersfreigabe, Export
  PRIVACY-POLICY-APP-SECTION.md    Vorschlag App-Abschnitt für die Datenschutzerklärung (DE/EN)
  REVIEW-NOTES.md                  Hinweise für Apple-/Google-Reviewer (EN)
  OWNER-CHECKLIST.md               Klickliste App Store Connect / Play Console (DE)
```

Die Ordnernamen entsprechen den fastlane-Konventionen. Später z. B.:

```bash
fastlane deliver --metadata_path packages/mobile/store/ios/metadata --skip_screenshots   # Screenshots separat
fastlane supply --metadata_path packages/mobile/store/android/metadata --skip_upload_apk --skip_upload_aab
```

`deliver` erwartet Screenshots in `screenshots/<locale>/`; die Rohdateien hier sind nach Gerät
sortiert und müssen dafür ggf. flach kopiert werden (deliver erkennt das Gerät an der Pixelgröße).

## Prüfen

```bash
bun run --cwd packages/mobile store:check   # Übersicht Zeichen/Limit, Exit 1 bei Verstoß
bun run --cwd packages/mobile test          # enthält store/check-metadata.test.ts
```

Gezählt wird in Unicode-Zeichen (wie die Stores), nicht in Bytes.

## Grundsätze für die Texte

Nur Funktionen, die im Code nachweisbar sind (`packages/mobile/src`, `@bloommd/ui`, `@bloommd/ink`,
`@bloommd/capacitor-folder`). Bewusst **nicht** behauptet: KI-Funktionen, Handschrifterkennung/OCR,
automatisches Erkennen externer Änderungen (kein File Watching), Dark Mode in der App, Stift-Gesten
auf der Map (gibt es nur im Obsidian-Plugin), Android im iOS-Text.

Die Cloud wird als optionale Anmeldung mit einem BloomMD-Konto (Beta) beschrieben: Anmeldung im
Browser (Authorization Code + PKCE, [Archiv #503](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/503)), Token im iOS-Schlüsselbund bzw. Android Keystore,
„Abmelden“ widerruft es, eigener Server unter „Erweitert“. Daten werden nur bei Anmeldung erhoben
(E-Mail-Adresse, andere Nutzerinhalte) – genau wie in `ios/App/App/PrivacyInfo.xcprivacy`.

## Bekannte Punkte vor dem Upload

- **Sprache der App-Oberfläche:** vollständig DE/EN nach Systemsprache – Map, Knoten-Editor, Hilfe
  (`@bloommd/ui`), Anmeldung und jetzt auch App-Hülle (Seitenmenü, Meldungen, „Auf diesem Gerät“,
  `src/shell-text.ts`) und Entscheidungs-Status auf der Map.
- **Mac mit Apple Silicon:** entschieden, die iPad-App wird dort angeboten (Anbieter Möllenbeck
  Digital); der Satz am Ende der iOS-Beschreibung bleibt.
- **Support-URL:** zeigt auf `https://bloommd.io/docs`. Eine eigene Hilfeseite für die iPad/iPhone-App
  gibt es noch nicht; Apple verlangt dort erreichbare Kontaktinformationen. Owner-Entscheidung:
  Hilfeseite `docs/ipad` anlegen oder Kontaktseite.
- **Android (#28):** Der Play-Text beschreibt, was der Android-Zweig kann: Ordnerauswahl über das
  Storage Access Framework (interner Speicher, SD-Karte, Sync-Ordner), Konfliktschutz, Stifte
  (S Pen, USI) mit Druck und Handballen-Erkennung, `bloommd://open`-Links, Anmeldung mit Token im
  Android Keystore. Vor dem Upload gegen den echten Android-Build prüfen.
- **Android-Screenshots und Feature-Grafik (1024×500)** folgen mit dem Android-Build; das 512er-Icon
  aus dem BloomMD-Zeichen exportieren.
- **Titel Google Play:** „BloomMD – Markdown Mind Maps“ (28 Zeichen). Apple-Name bleibt „BloomMD“,
  der Untertitel trägt die Beschreibung.

## Screenshots (iOS)

Echte Aufnahmen der App im Simulator (iOS 26.4, Xcode 26.4.1), Statusleiste 9:41 / 100 %, helles
Erscheinungsbild (die App hat keinen Dark Mode), Systemsprache passend zum Eintrag. Ohne Alphakanal,
wie App Store Connect es verlangt.

| Gerät (Simulator) | Apple-Klasse | Pixel |
|---|---|---|
| iPhone 17 Pro Max | iPhone 6,9" | 1320 × 2868 |
| iPad Pro 13-inch (M5) | iPad 13" | 2064 × 2752 |

Apple verlangt seit 2024 nur noch die größte Klasse je Gerätefamilie (6,9" bzw. 13"); kleinere
Displays werden daraus skaliert.

| Nr. | de-DE | en-US | Inhalt |
|---|---|---|---|
| 01 | map | map | Lern-Map „Thermodynamik“ mit Aufgaben-Knoten |
| 02 | handwriting | handwriting | Handschrift-Editor: ΔU = Q + W, Pfeile, mit Notiz verknüpftes Wort |
| 03 | vault | vault | Seitenmenü mit geöffnetem „Obsidian Vault“ und Anmelde-Bereich |
| 04 | outline | outline | Gliederung |
| 05 | tasks | tasks | Projekt-Map mit Aufgaben, Entscheidungen, Knoten-Editor |
| 06 | presentation | presentation | Präsentationsansicht |

`ios-framed/` enthält dieselben Bilder mit Überschrift auf BloomMD-Orange (#FF6B35 → #F7931E), gerendert
mit Playwright. Welche Variante hochgeladen wird, entscheidet der Owner; die Rohbilder bleiben.

**Android-Screenshots** folgen mit dem Android-Build (Telefon + 7"/10"-Tablet, Play verlangt 2–8 pro
Gerätetyp, Seitenverhältnis höchstens 2:1).

### Neu aufnehmen

Der Screenshot-Build nutzt die unveränderte App (`src/App.tsx`) hinter einem kleinen Treiber
(`harness/main.tsx`). Er öffnet den Demo-Vault über den Testordner-Zugang, den das Plugin nur in
Debug-Builds anbietet, tippt die Notiz im Seitenmenü an und stellt Auswahl, Ansicht, Editor bzw.
Seitenmenü ein. Er wird nie ausgeliefert.

```bash
cd packages/mobile
bunx vite build --config store/screenshots/harness/vite.config.ts && bunx cap copy ios
(cd ios/App && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -workspace App.xcworkspace -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/bloommd-store-dd \
  CODE_SIGNING_ALLOWED=NO build)
xcrun simctl create "BloomMD Store iPhone 6.9" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max
xcrun simctl create "BloomMD Store iPad 13" com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer bun store/screenshots/harness/capture.ts \
  --app /tmp/bloommd-store-dd/Build/Products/Debug-iphonesimulator/App.app \
  --iphone <udid> --ipad <udid>            # optional: --only iphone|ipad --locale de|en
bun store/screenshots/harness/frames.ts    # gerahmte Varianten
bun run build && bunx cap copy ios         # danach wieder den normalen Build kopieren
```

`capture.ts` braucht python3 mit Pillow (entfernt den Alphakanal) und stellt die Systemsprache der
Simulatoren pro Sprache um (Neustart). Den Demo-Inhalt erzeugt `harness/demo-vault.ts` mit denselben
Core-Funktionen, die auch die Agenten nutzen; die Handschrift ist eine echte `bloommd-ink`-SVG.

### Beim Aufnehmen gefunden

- **Behoben (packages/ui):** Schon das Öffnen eines Knotens im Editor hat `[[Link]]` und
  `![[Zeichnung ink.svg]]` als `\[\[…]]` in die Datei zurückgeschrieben – Obsidian-Links und
  Handschrift-Einbettungen gingen kaputt. `restoreWikiLinks` stellt sie wieder her; geprüft im
  Simulator (Datei bleibt nach Öffnen des Editors unverändert).
- **Offen:** In der App zeigt der Knoten-Editor `[[Notiz]]`-Links als „Ziel nicht gefunden“, weil die
  Auflösung über die Web-API läuft. Im Demo-Vault deshalb keine Wiki-Links im Text.
- **Behoben:** Entscheidungs-Status auf der Map war auch in der deutschen Oberfläche
  „ACCEPTED“/„PROPOSED“; jetzt übersetzt („Akzeptiert“, „Vorgeschlagen“, „Abgelehnt“).
- **Behoben:** App-Hülle war fest deutsch; jetzt DE/EN (`src/shell-text.ts`).
- **Offen:** Eingebettete Zeichnungen erscheinen im Inhaltsfeld des Knoten-Editors und in der
  Präsentation als Text `![[… ink.svg]]`.
- Erste App-Version: App Store Connect zeigt „Neue Funktionen“ (`release_notes.txt`) erst ab dem
  ersten Update; deliver überspringt das Feld beim Erst-Upload.
