# Mobile-App (iPad/iPhone)

Die App `app.bloommd.mobile` liegt in `packages/mobile` (Capacitor 8, iOS ab 15.0). Store-Texte,
Screenshots und die Datenschutz-Antworten für App Store und Google Play stehen in
`packages/mobile/store/` (siehe dort `README.md` und `PRIVACY-ANSWERS.md`). Dieses Dokument
beschreibt, wie ein iOS-Release entsteht und was die Prüfungen absichern.

## Veröffentlichung

Der Workflow `.github/workflows/ios-release.yml` baut ein Release-Archiv, prüft es, signiert es beim
Export und lädt es zu App Store Connect (TestFlight) hoch. Er läuft nie bei Pull Requests, nur per
Dispatch oder für ein Tag `mobile-v*`.

### Ablauf

1. **Version festlegen:** `version` in `packages/mobile/package.json` ändern. Daraus entsteht die
   App-Store-Version (`MARKETING_VERSION`): Prerelease und Build-Metadaten entfallen, weil App Store
   Connect nur drei Zahlen akzeptiert (`0.1.0-beta.10` wird `0.1.0`). Danach im Xcode-Projekt
   nachziehen und committen:
   ```bash
   cd packages/mobile
   bun scripts/ios-version.ts --write     # schreibt MARKETING_VERSION in project.pbxproj
   bun scripts/ios-version.ts --check     # prüft, dass Projekt und package.json übereinstimmen
   ```
   `ios.yml` führt `--check` bei jedem Pull Request aus.
2. **Änderung mergen**, auf `main` müssen die Prüfungen `ios.yml` (Simulator und Release-Build) grün sein.
3. **Release auslösen**, eine der beiden Möglichkeiten:
   - **Tag:** `mobile-v<version>` mit der vollständigen Version aus `package.json` (bei
     `0.1.0-beta.10` also `mobile-v0.1.0-beta.10`). Passt das Tag nicht, bricht der Workflow ab.
     Ein Tag lädt immer hoch.
   - **Dispatch:** Actions, „iOS Release“, „Run workflow“. `upload` (Standard an) schaltet den Upload,
     `credential_source` die Quelle der Zugangsdaten (Standard 1Password).
4. **Trockenlauf:** Dispatch mit `upload=false`. Der Workflow archiviert, signiert beim Export und
   prüft das Archiv wie im Normalfall, lädt aber nichts hoch. Die signierte `.ipa` bleibt als Artefakt
   `bloommd-ios-<version>-<run>` am Lauf.
5. **Build-Nummer:** Sie ist die Laufnummer des Workflows (`CFBundleVersion`) und wächst mit jedem
   Lauf. So nimmt App Store Connect mehrere Uploads derselben Version an. Im Repo steht nur der Platzhalter `1`.

### Zugangsdaten (nur Namen)

Standard ist 1Password (`credential_source=onepassword`). In GitHub liegt dann nur der Token des
Service-Accounts; alles andere liest der Workflow zur Laufzeit aus dem Tresor.

| Secret in GitHub | Inhalt |
|---|---|
| `OP_SERVICE_ACCOUNT_TOKEN` | Service-Account für den Tresor „BloomMD CI“ |
| `BLOOMMD_OP_REF_APPLE_TEAM_ID` | Verweis auf die Team-ID (10 Zeichen) |
| `BLOOMMD_OP_REF_IOS_APPLE_API_KEY_ID` | Verweis auf die Key-ID des App-Store-Connect-Team-Keys |
| `BLOOMMD_OP_REF_APPLE_API_ISSUER_ID` | Verweis auf die Issuer-ID |
| `BLOOMMD_OP_REF_APPLE_API_PRIVATE_KEY_P8` | Verweis auf die Datei `AuthKey_<id>.p8` |

Die Felder liegen im 1Password-Eintrag „BloomMD Release CI“ (Tresor „BloomMD CI“). Der Key braucht die
Rolle Admin, weil die Signierung über die Cloud-Verwaltung läuft. Die Notarisierung der Desktop-App
nutzt einen eigenen Key („Apple Notarization“). Fehlende Felder im Tresor lassen den Lade-Schritt
laut fehlschlagen.

Notfall-Rückfall (nur per Dispatch, `credential_source=github`): dieselben Werte direkt als
Repository-Secrets `APPLE_TEAM_ID`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID` und
`APPLE_API_PRIVATE_KEY_P8_BASE64` (die `.p8`, base64-kodiert).

**Ohne Zugangsdaten** (Secret fehlt) endet der Workflow grün: Er gibt die Notice „iOS release
skipped“ mit den fehlenden Namen aus und schreibt sie in die Zusammenfassung. Der Job `archive` läuft
dann nicht.

### Prüfungen vor dem Upload

`scripts/check-ios-release.sh` prüft das gebaute `App.app` bzw. `.xcarchive`, im Release-Workflow
vor dem Export und in `ios.yml` bei jedem Pull Request am unsignierten Release-Build. Jede
Abweichung lässt den Lauf fehlschlagen:

- Privacy Manifests von App und beiden Plugins (`BloommdCapacitorFolder`, `BloommdCapacitorKeychain`):
  Tracking aus, keine Tracking-Domains, erhobene Daten (E-Mail-Adresse, andere Nutzerinhalte) und
  Required-Reason-APIs (FileTimestamp C617.1 und 3B52.1, UserDefaults CA92.1) genau wie in
  `store/PRIVACY-ANSWERS.md`. Ändert sich eine Seite, muss die andere mitziehen
  (`scripts/ios-bundle-tools.ts`, Profile `PRIVACY_PROFILES`).
- `ITSAppUsesNonExemptEncryption` = `false`, Bundle-ID, keine `NS*UsageDescription`-Schlüssel.
- `CFBundleShortVersionString` entspricht der Version aus `package.json`, `CFBundleVersion` der
  Build-Nummer des Laufs (nur im Release-Workflow).
- Kein Selbsttest-Code im Web-Bundle (der Release-Build läuft ohne `VITE_BLOOMMD_SELFTEST`) und kein
  Test-Ordner-Zugang im Ordner-Plugin.
- App-Icon 1024 × 1024 ohne Alphakanal, Splash-Bilder 2732 × 2732.
- Mac-Verfügbarkeit, siehe unten.

### TestFlight

Nach dem Upload verarbeitet App Store Connect den Build. Danach erscheint er unter TestFlight für
interne Tester. Externes Testen und die Freigabe für den App Store bleiben manuell. Die Frage nach der
Exportkonformität stellt App Store Connect nicht je Build, weil `ITSAppUsesNonExemptEncryption` im
Bundle auf `false` steht (nur Verschlüsselung des Betriebssystems, siehe `store/PRIVACY-ANSWERS.md`).
Die erste App-Version braucht den Eintrag in App Store Connect samt Metadaten
(`store/README.md`), bevor sie hochgeladen werden kann.

## Mac-Verfügbarkeit („Designed for iPad“)

Die iPad-App wird auf Macs mit Apple Silicon angeboten (Entscheidung in `store/README.md`). Dafür gibt
es keine eigene Mac-Version: Der Mac führt die iPad-App aus.

**Was die Prüfung absichert** (`check-ios-release.sh`, Unit-Tests in `scripts/ios-bundle-tools.test.ts`
und `scripts/check-ios-release.test.ts`):

- Im Xcode-Projekt (`project.pbxproj`) zielt jede Konfiguration auch auf das iPad
  (`TARGETED_DEVICE_FAMILY` enthält 2), `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD` ist nicht `NO`,
  `SUPPORTS_MACCATALYST` ist nicht `YES` (Mac Catalyst würde die iPad-App auf dem Mac ersetzen und ist
  nicht geplant), `SDKROOT` ist `iphoneos`.
- Weder die `Info.plist` im Quellstand noch die gebaute im Release-Bundle verlangt in
  `UIRequiredDeviceCapabilities` Hardware, die ein Mac nicht hat (z. B. `telephony`, `gps`,
  `gyroscope`, Kamera, `nfc`, `armv7`) oder legt mit `UISupportedDevices` Gerätemodelle fest.
- Die gebaute `Info.plist` enthält in `UIDeviceFamily` das iPad (2).

**Was sie nicht absichert:**

- Den Schalter „Verfügbarkeit auf Macs mit Apple Silicon“ in App Store Connect. Er liegt nicht im
  Bundle. Der Owner prüft ihn bei der Einrichtung des App-Eintrags und nach jeder Änderung der
  Verfügbarkeit.
- Das Verhalten der App auf einem echten Mac (Fenstergröße, Bedienung ohne Touch und Stift,
  Dateiauswahl, Anmeldung im Browser, `bloommd://`-Links). Das lässt sich in CI nicht beobachten und
  braucht einen manuellen Lauf auf einem Apple-Silicon-Mac, etwa über TestFlight für den Mac.
- Die Sperrliste der Hardware-Merkmale ist unsere konservative Auswahl, nicht die vollständige Liste
  von Apple. Ein neues Merkmal in `UIRequiredDeviceCapabilities` muss ohnehin bewusst geprüft werden.
- Apples eigene Prüfung beim Hochladen und im Review.
