# M1 Testplan — Closed Beta live

Stand: 13. August 2026
Branch: `feat/m1-closed-beta`  
Verbindliches Board: [BloomMD Roadmap](https://github.com/orgs/moellenbeck-digital/projects/3)

## Ziel

M1 ist abnahmefähig, wenn ein Tester BloomMD als Closed Beta nutzen kann (Registrierung offen; mit Zugangsschalter `BLOOMMD_BETA_ACCESS=1` nur auf Einladung):

- Desktop lokal ohne Account und ohne Cloud auf macOS
- Web-App mit einfacher Auth und Closed-Beta-Gate
- OKF/llm-wiki lokal und im Web
- Collaboration als Beta-Funktion mit klaren Grenzen
- Marketing getrennt von der privaten App (die Warteliste ist beendet, alte Links leiten auf die Registrierung)
- Linux und Windows Desktop bleiben außerhalb des M1-Beta-Supports und werden als eigene Beta-Releases nachgezogen
- Mobile bleibt außerhalb des M1-Beta-Supports

Jeder Test muss entweder automatisiert grün sein, manuell mit Datum/Build dokumentiert sein oder als
externer Gap in [Archiv #79](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/79) nachverfolgt werden.

Die detaillierte UI-Abdeckung lebt in der [M1 UI-QA-Testmatrix](M1-UI-QA-MATRIX.md). Sie ist fuer
M1 verbindlich, wenn UI-Funktionen bewertet werden: Canvas, Editor, Toolbar, Sidebar, Command
Palette, File-/Folder-Flows, Empty States, Desktop-Handoff, Collaboration/Remote-UI, Web-App,
Beta-Gate (Schalter), Registrierung und Wiki.

Der reproduzierbare macOS-Lauf wird mit dem QA-Skript ausgefuehrt:

```bash
bun run qa:m1:mac
```

## Testpyramide

| Ebene | Zweck | Gate |
|---|---|---|
| Unit | Parser, FileStore, Desktop-RPC-Helfer, Security-Grenzen | Muss lokal und in CI grün sein |
| Integration | Sync-Server, CLI, Storage, Auth-API | Muss lokal grün sein |
| Browser-E2E | Web, Auth, Beta-Gate, Wiki, UX-Smoke, Accessibility | Muss in CI grün sein |
| Native Smoke | macOS Desktop-Artefakt, OS-Handoff, lokale Ordner | Muss lokal auf macOS dokumentiert sein |
| External E2E | echte Zielumgebung, DNS/TLS, Postgres/Restore, Mail, Collaboration über Netz | In [Archiv #79](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/79) kommentieren |

## Automatische Gates

Vor jeder M1-Freigabe laufen diese Befehle auf einem frischen Checkout:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run test:qa
bun run build
bun run build:release-artifacts
bun run test:e2e
bun run --cwd apps/app test:e2e:beta
bun run --cwd apps/app test:e2e:wiki
bun run --cwd apps/app test:e2e:collaboration
bun run test:e2e:visual
bun run --cwd apps/app test:e2e:visual
bun run --cwd apps/app release:check
bun run --cwd apps/marketing test:e2e
bun run --cwd apps/marketing release:check
bun run --cwd apps/app release:check && bun run --cwd apps/marketing release:check
bun audit
```

Deployment-spezifisch:

```bash
bun run --cwd apps/app release:check         # mit bloommd.app Produktions-Env
bun run --cwd apps/marketing release:check   # mit bloommd.io Produktions-Env
```

Desktop-spezifisch:

```bash
bun run --cwd packages/desktop typecheck
bun run --cwd packages/desktop test
bun run --cwd packages/desktop build:renderer
bun run build:desktop-macos
bun run verify:desktop-macos:dmg
bun run verify:desktop-macos:codesign
```

Erwartung:

- TypeScript strict ohne Fehler
- Unit-/Integrationstests ohne Fehler
- Browser-E2E ohne Flakes
- Deployment-Split prueft `marketing`, `app` und `combined`: Marketing ohne App-Secrets, App
  `noindex, nofollow`, falsche Host-Routen als 404
- Zwei-Client-Collaboration-E2E mit lokalem Sync-Server, Awareness und Persistenz gruen
- Visual Regression ohne unerwartete Screenshot-Diffs; Baselines laufen fuer `1280x800`, schmalen
  Viewport und Dark Mode mit `maxDiffPixelRatio: 0.015`
- Desktop-Renderer innerhalb Bundle-Budget
- Stable-Artefakte unter `packages/desktop/artifacts/`
- macOS-App-Bundle ist ad-hoc signiert und besteht `codesign --verify`; Gatekeeper bleibt wegen
  fehlender Developer-ID/Notarisierung erwartbar, bis der Apple Developer Account freigegeben ist
- Keine neuen high/critical Audit-Findings ohne akzeptierte Ausnahme

## Aktuelle macOS-Evidenz

Lokal geprüft am 13., 14. und 17. August 2026 auf macOS arm64:

| Check | Ergebnis |
|---|---|
| `bun run --cwd packages/desktop typecheck` | grün |
| `bun run --cwd packages/desktop test` | 48 Tests grün |
| `bun run --cwd packages/desktop build:renderer` | grün, Entry `1255630 / 1320000`, Lazy Editor `21753 / 40000` |
| `bun run test:qa` | grün, M1-Matrix und Testplan parsebar |
| `bun run test:e2e` | grün, 36/36 Product-App-E2E |
| `bun run --cwd apps/app test:e2e:beta` | grün, 6/6 Closed-Beta-Gate |
| `bun run --cwd apps/app test:e2e:wiki` | grün, 9/9 OKF/LLM-Wiki |
| `bun run --cwd apps/app test:e2e:collaboration` | grün, 1/1 Zwei-Client-Collaboration |
| `bun run --cwd apps/marketing test:e2e` | grün, 27/27 Marketing-E2E |
| `bun run --cwd apps/app test:e2e:visual` | grün, 6/6 Product Visual Regression |
| `bun run --cwd apps/marketing test:e2e:visual` | grün, 6/6 Marketing Visual Regression |
| `bun run build:release-artifacts` | grün, `artifacts/bloommd-agent`, `artifacts/bloommd-wiki` und `artifacts/bloommd-sync` gebaut |
| `bun audit` | grün, keine Vulnerabilities |
| `bun run --cwd packages/sync load-test` | grün, 13/13 gegen lokalen Postgres mit Sync-Binary |
| `bun run --cwd apps/app release:check` / `apps/marketing release:check` | grün mit vollständigen Dummy-Production-Werten |
| `bun run build:desktop-macos` | grün |
| `hdiutil verify stable-macos-arm64-BloomMD.dmg` | DMG gültig |
| `codesign --verify --deep --strict --verbose=2 BloomMD.app` | grün; Bundle ad-hoc signiert, aber nicht Developer-ID-signiert/notarisiert |
| `Info.plist` | `bloommd` URL-Scheme, `.md`/`.markdown` Associations, `CFBundleShortVersionString=0.1.0`, `CFBundleVersion=2`, `BloomMDProductVersion=0.1.0-beta.2` und `BloomMDDeveloperIDStatus=waiting-for-apple-developer-account` vorhanden |
| DMG-Start-Hinweis | Wrapper-Launcher blockiert Start aus `/Volumes/*` mit Installationshinweis und startet aus `Programme` den originalen Electrobun-Launcher |
| Desktop Clipboard | `packages/desktop/src/bun/menu.test.ts` prüft native Edit-Rollen, Clipboard-Accelerators und keine Custom-Actions |
| Stable-App Start | Launcher und Bun-Main-Prozess laufen |
| UX-Screenshot Start | Sidebar, Canvas, Toolbar und Mini-Map sichtbar, keine groben Überlappungen |
| Ordner wechseln | Wechsel nach `/private/tmp/bloommd-m1-folder-switch`, Settings aktualisiert, App bleibt stabil |
| Datei im neuen Ordner | `folder-switch-smoke.md` sichtbar und als Mindmap gerendert |
| Datei-Handoff | `open -a BloomMD.app handoff.md` lädt den Ordner und rendert die Datei |
| File-Watcher | externe Änderung an aktiver Datei wird nach Watcher-Event im Canvas sichtbar |
| CLI-Handoff | `bun run qa:m1:mac -- --only desktop-typecheck,desktop-test,desktop-renderer,desktop-build-stable,dmg-verify,desktop-codesign-verify,native-smoke --html` grün: Ordner, `.md` Datei und leerer Ordner über `bloommd open` |
| Leerer Ordner | `bloommd open <leerer-ordner>` aktualisiert Settings und zeigt keinen alten Canvas-Inhalt |
| QA-Report | `.qa/m1-mac/2026-08-14T16-03-47-143Z/report.html`, 0 Gate-Fehler, 0 Case-Fehler |
| Artefakt-Hashes | DMG `c797f916b573bcf66e5d626145935cf0a80bb147a0ba5f69969f04ffb43d1619`; App-Tar.zst `2e574f06b79876a158cb7fb162f63656f73c1e67165d39b834a41acb5ffb738a` |

Gefundener und behobener Fehler:

- `chooseDirectory()` war nicht robust gegen leere/unerwartete Dialog-Rückgaben und aktualisierte
  Mode, Settings und Watcher beim Wechsel nicht vollständig.
- Fix: defensive Dialog-Normalisierung, Directory-Validierung, Settings-Update, Watcher-Neustart,
  UI-Fehlerbehandlung und leerer-Ordner-Fallback.
- Zusätzlich behoben: File-Watcher verglich gegen einen veralteten React-State-Snapshot. Der aktive
  Dateipfad liegt jetzt in einer Ref und wird plattformneutral gegen Watcher-Pfade verglichen.
- `bloommd open <pfad>` ist als explizites CLI-Handoff implementiert und nutzt den registrierten
  `bloommd://open` URL-Scheme. Direkte Launcher-Argumente sind nicht der M1-Bedienpfad.
- Externe Opens tragen im Desktop-RPC jetzt explizit `kind: "file" | "folder"`. Ein Ordner kann
  dadurch nicht mehr versehentlich als erste Datei aus der Liste geladen werden.
- Leere Workspaces haben jetzt einen expliziten Empty-State mit Aktionen für neue Datei, Import und
  Ordnerwechsel.

## macOS Native Smoke

Testumgebung:

- frischer `stable-macos-arm64-BloomMD.dmg`
- keine laufende Dev-App
- optional sauberes Testverzeichnis unter `/tmp/bloommd-m1-smoke`
- bestehendes `~/.bloommd-desktop.json` vor dem Test sichern, wenn echte Nutzerdaten geschützt
  werden müssen

### Installation und Start

| ID | Test | Erwartung |
|---|---|---|
| MAC-01 | DMG öffnen | macOS mountet das Image ohne Fehler |
| MAC-02 | App aus DMG starten | Klarer Installationshinweis erscheint; BloomMD soll erst nach `Programme` gezogen werden |
| MAC-03 | App aus `build/stable-macos-arm64/BloomMD.app` starten | Fenster erscheint innerhalb von 5 Sekunden |
| MAC-04 | Menüleiste prüfen | App-Menü, Bearbeiten und Fenster sind sichtbar |
| MAC-05 | Prozess prüfen | Launcher und Bun-Main-Prozess laufen; kein Crashreport unter `~/Library/Logs/DiagnosticReports` |

### Lokale Dateien und Ordner

| ID | Test | Erwartung |
|---|---|---|
| MAC-10 | Start mit Default-Ordner `~/bloommd` | Dateiliste zeigt vorhandene `.md`-Dateien, Canvas rendert den Ordner als Workspace-Root mit Datei-Nodes und Heading-Baeumen |
| MAC-11 | `Ordner wechseln...` auf Ordner mit `.md` Dateien | Settings enthalten neuen `localDir`, Dateiliste zeigt nur diesen Ordner, Canvas rendert die Workspace-Mindmap |
| MAC-12 | `Ordner wechseln...` abbrechen | App bleibt stabil, aktueller Ordner unverändert |
| MAC-13 | `Ordner wechseln...` auf leeren Ordner | Dateiliste leer, altes Dokument wird nicht weiter als aktiver Inhalt angezeigt |
| MAC-14 | Externe `.md` Datei in aktivem Ordner anlegen | Datei erscheint nach Watcher-Event oder Reload |
| MAC-15 | Externe Datei ändern | Aktives Dokument aktualisiert sich oder Reload zeigt die Änderung |
| MAC-16 | Unterordner mit `.md` Datei | Datei wird als relativer Pfad angezeigt, als Datei-Node unter dem passenden Ordner-Node gerendert und kann geöffnet werden |
| MAC-17 | Ordner aus App anlegen | Ordner erscheint in der Auswahl für neue Dateien |

### Editor, Canvas und Shortcuts

| ID | Test | Erwartung |
|---|---|---|
| MAC-20 | Datei öffnen | Root-Node ist selektiert, Titel stimmt mit Markdown überein |
| MAC-21 | Child über Node-Toolbar anlegen | Neuer Node erscheint ohne Layoutsprung, Fokus bleibt bedienbar |
| MAC-22 | Inhalt im Editor ändern und speichern | Markdown-Datei enthält Änderung, Backup wird angelegt wenn Datei existierte |
| MAC-23 | `Cmd+S` | Speichert ohne Dialog und ohne Fokusverlust |
| MAC-24 | `Cmd+Z` nach Content-Edit | Content-Edit wird rückgängig gemacht |
| MAC-25 | Pfeiltasten-Navigation | Parent/Child/Sibling-Navigation funktioniert, Editor schluckt Canvas-Shortcuts nicht dauerhaft |
| MAC-26 | `Alt+Enter` | Editor-Sichtbarkeit toggelt auch bei Editor-Fokus |
| MAC-27 | Ansicht Structure/Outline/Presentation wechseln | Ansichten wechseln ohne Datenverlust |
| MAC-28 | Command Palette öffnen und Datei suchen | Treffer sind per Tastatur auswählbar |
| MAC-29 | Export Markdown | Download enthält serialisierten aktuellen Stand |

### OS-Handoff

| ID | Test | Erwartung |
|---|---|---|
| MAC-30 | `open -a BloomMD.app note.md` | App öffnet den Ordner der Datei und lädt `note.md` |
| MAC-31 | `.md` per Finder mit BloomMD öffnen | Datei wird geladen, keine zweite unbedienbare Instanz |
| MAC-32 | Ordner per URL-Scheme öffnen | Workspace wechselt auf diesen Ordner; bei leerem Ordner bleibt UI stabil |
| MAC-33 | `bloommd open .` | Übergibt Ordner an Desktop-Handoff über `bloommd://open`; ungültige Pfade liefern einen CLI-Fehler |
| MAC-34 | URL `bloommd://...` | App wird aktiviert; nicht unterstützte URLs werden verworfen |

### Remote und Collaboration

| ID | Test | Erwartung |
|---|---|---|
| MAC-40 | Mit Server verbinden | Validiert URL/Token, zeigt Remote-Modus und lädt Remote-Dateien |
| MAC-41 | Verbindung trennen | Lokaler Modus ist wieder aktiv, lokaler Watcher läuft |
| MAC-42 | Auto-Reconnect nach Neustart | Falls Server erreichbar: reconnect; falls nicht: erklärter Fallback |
| MAC-43 | Zwei Clients gleiche Datei | Remote-User-Dots und Selection-Awareness sichtbar |
| MAC-44 | Gleichzeitige Content-Edits | Änderungen mergen, keine stillen Datenverluste |
| MAC-45 | Netzwerk kurz trennen | Reconnect oder sichtbarer Status; keine Endlosschleife ohne Feedback |

### UX-Konformität

| ID | Test | Erwartung |
|---|---|---|
| UX-01 | Fenster 1280x800 | Toolbar, Sidebar, Mini-Map und Canvas überlappen nicht |
| UX-02 | Fenster schmal | Text in Buttons bleibt lesbar oder wird sauber gekürzt |
| UX-03 | Leerer Ordner | Leerer Zustand ist ruhig und verständlich, kein altes Dokument als falscher Inhalt |
| UX-04 | Fehler beim Ordnerwechsel | Fehler wird geloggt und die App bleibt bedienbar |
| UX-05 | Keyboard-only Basisflow | Datei öffnen, Node navigieren, speichern und Hilfe öffnen ohne Maus möglich |
| UX-06 | macOS Clipboard | `Cmd+C`/`Cmd+V` in Dialogen und Editor funktionieren |
| UX-07 | Sprache | Deutsch/Englisch-Umschaltung ändert Labels ohne Layoutbruch |

## Web-App und Closed-Beta-Gate

| ID | Test | Automatisierung | Erwartung |
|---|---|---|---|
| WEB-01 | Public Landing | `test:e2e` | Beta-Positionierung, Demo und Registrierungs-CTA sichtbar |
| WEB-02 | Signup ohne Gate (Normalfall) | `test:e2e` | Offene Registrierung funktioniert, kein Beta-Block |
| WEB-03 | Signup mit Gate ohne Invite | `test:e2e:beta` | Registrierung blockiert, keine Account-Enumeration |
| WEB-04 | Signup mit Allowlist | `test:e2e:beta` | Session wird gesetzt, Redirect nach `/app` |
| WEB-05 | Signup mit Invite-Code | `test:e2e:beta` | Session wird gesetzt |
| WEB-06 | Login bestehender Account | `test:e2e:beta` | Login bleibt ungated |
| WEB-07 | Billing disabled | `test:e2e` | Stripe-Routen 404, keine Preise |
| WEB-08 | Security headers | `test:e2e` | Pages und APIs liefern erwartete Header |
| WEB-09 | In-App-Feedback | `apps/app` Unit/Route + `test:e2e` | Eingeloggter Nutzer oeffnet Formular; Screenshot ist Pflicht; API speichert Metadaten, legt Anhaenge im Feedback-Bucket ab und erstellt ein GitHub-Issue mit `user-feedback`/`beta-feedback` |
| WEB-10 | Prod-Smoke, Gate aus | `bun run qa:production-smoke` | `/signup` zeigt das Registrierungsformular ohne Beta-Block; `/api/waitlist` antwortet 410, alte Wartelisten-Links leiten per 308 auf die Registrierung |
| WEB-11 | Prod-Smoke, Gate an | `bun run qa:production-smoke --beta-gate` | `/signup` zeigt den Beta-Zugangsblock (ohne Wartelisten-Link), freigeschaltete E-Mail das Formular |

## OKF / llm-wiki

| ID | Test | Automatisierung | Erwartung |
|---|---|---|---|
| WIKI-01 | Wiki public disabled by default | `test:e2e` | Öffentliche Wiki-Routen sind ohne Opt-in nicht aktiv |
| WIKI-02 | Wiki opt-in public | `test:e2e:wiki` | Pages werden aus Bundle gerendert |
| WIKI-03 | Suche nach Titel/Tag/Status | `test:e2e:wiki` | Trefferliste wird korrekt eingegrenzt |
| WIKI-04 | Knowledge Map | `test:e2e:wiki` | Knoten und Broken Links sichtbar |
| WIKI-05 | Broken References | `test:e2e:wiki` | Fehlende lokale Dateien werden angezeigt, nicht verschluckt |
| WIKI-06 | Citations | `test:e2e:wiki` | Quellen mit Hash werden gelistet |
| WIKI-07 | Remote Preview | `test:e2e:wiki` | Externe Vorschau nur nach expliziter Nutzeraktion |
| WIKI-08 | Lokal/offline nutzbar | manuell/CLI | Keine Cloud-, DB- oder Auth-Abhängigkeit |

## Sync und Infrastruktur

| ID | Test | Ort | Erwartung |
|---|---|---|---|
| SYNC-01 | Sync-Server lokal starten | lokal | WebSocket-Endpoint erreichbar |
| SYNC-02 | Zwei Browser-Clients | lokal oder Staging | Awareness und Content-Merge funktionieren |
| SYNC-03 | Persistence debounce | lokal oder Staging | Markdown wird nach Debounce geschrieben |
| SYNC-04 | Reconnect | lokal oder Staging | Ticket wird erneuert oder Fehler sichtbar |
| INFRA-01 | Docker Compose Postgres/Sync | CI oder Testhost | Container starten reproduzierbar |
| INFRA-02 | CloudNativePG Restore | Staging | Restore-Drill dokumentiert in [Archiv #14](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/14) |
| INFRA-03 | Load/Reconnect/Persistence | Staging | Ergebnis dokumentiert in [Archiv #15](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/15) |
| INFRA-04 | Private SaaS Deployment | Staging | DNS/TLS/Auth/Beta-Gate/Headers grün, dokumentiert in [Archiv #13](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/13)/#79 |

## Post-M1 Windows-Testplan

Windows ist kein M1-Freigabekriterium mehr. Dieser Plan bleibt als Vorbereitung fuer einen
spaeteren **Windows Beta Release** erhalten.

Ziel: Ein Windows-Tester kann BloomMD lokal nutzen, Markdown-Dateien und Ordner öffnen und die
bekannte Windows-Sicherheitsgrenze aus #73 bewusst akzeptieren.

### Vorbereitung

- Windows 11, x64, aktueller Patchstand
- frischer Benutzer ohne Admin-Sonderrechte
- Build-Artefakt aus CI: `bloommd-desktop-windows-x64`
- Testordner: `C:\Users\<user>\Documents\BloomMD Smoke`
- Testdatei:

```markdown
---
title: Windows Smoke
id: windows-smoke
---

# Windows Smoke

## Child
```

### Windows Native Smoke

| ID | Test | Erwartung |
|---|---|---|
| WIN-01 | Artefakt entpacken | Enthält ausführbare App und notwendige Ressourcen |
| WIN-02 | Erststart | SmartScreen-Hinweis ist erwartbar; App startet nach Bestätigung |
| WIN-03 | Lokaler Default-Ordner | App legt oder nutzt lokalen Workspace, keine Cloud nötig |
| WIN-04 | Ordner wechseln | Wechsel auf `Documents\BloomMD Smoke`, Datei wird angezeigt |
| WIN-05 | Pfade mit Leerzeichen | Datei in `Mein Test Ordner\Smoke Note.md` öffnet korrekt |
| WIN-06 | Datei per Explorer öffnen | `.md` wird an BloomMD übergeben oder fehlende Association in [Archiv #65](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/65) dokumentiert |
| WIN-07 | `bloommd open .` | CLI-Handoff öffnet Ordner über den installierten URL-Handler; fehlender Installer-Pfad wird in [Archiv #65](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/65)/#67 dokumentiert |
| WIN-08 | Datei speichern | Markdown wird geschrieben, keine Pfad-Traversal- oder Encoding-Probleme |
| WIN-09 | Datei extern ändern | Reload/Watcher aktualisiert den Inhalt |
| WIN-10 | Ordner aus App anlegen | Unterordner wird auf NTFS angelegt und in Datei-Auswahl verwendet |
| WIN-11 | Cloud verbinden | Token wird gespeichert; Tester sieht Hinweis aus #73 für geteilte Rechner |
| WIN-12 | Cloud trennen | Lokaler Modus funktioniert weiter; Token wird entfernt |
| WIN-13 | App neu starten | Letzter lokaler Ordner wird wiederhergestellt |
| WIN-14 | Deinstallation/Update | Alte Settings beschädigen neuen Start nicht |

### Windows UX-Checks

| ID | Test | Erwartung |
|---|---|---|
| WUX-01 | 100%, 125%, 150% Skalierung | Toolbar/Sidebar/Canvas ohne Überlappung |
| WUX-02 | Tastatur | Ctrl+C/Ctrl+V, Ctrl+S, Pfeiltasten und Dialog-Fokus funktionieren |
| WUX-03 | High Contrast/Dark Mode | App bleibt lesbar oder dokumentiert Einschränkung |
| WUX-04 | Fehlender Schreibzugriff | App bleibt stabil und zeigt/loggt Fehler |
| WUX-05 | Umlaute im Pfad | `C:\Users\<user>\Dokumente\Prüfung.md` funktioniert |

## Post-M1 Linux-Testplan

Linux ist kein M1-Freigabekriterium mehr. Dieser Plan bleibt als Vorbereitung fuer einen spaeteren
**Linux Beta Release** erhalten.

| ID | Test | Erwartung |
|---|---|---|
| LINUX-01 | Artefakt entpacken und ausfuehrbar machen | App startet nach `chmod +x` ohne fehlende Runtime-Library |
| LINUX-02 | Erststart auf aktueller Ubuntu/Fedora-ähnlicher Desktop-Umgebung | Fenster erscheint, WebKit/GTK-Abhängigkeiten sind dokumentiert |
| LINUX-03 | Lokalen Ordner öffnen | Workspace-Root, Folder-Nodes, Datei-Nodes und Heading-Bäume werden gerendert |
| LINUX-04 | `bloommd open .` | CLI-Handoff öffnet den Ordner oder dokumentiert fehlenden URL-Handler-/Installer-Schritt |
| LINUX-05 | File-Watcher | Externe `.md`-Änderungen erscheinen nach Watcher oder Reload |
| LINUX-06 | Tastatur und Clipboard | Ctrl+C/Ctrl+V, Ctrl+S und Fokusverhalten funktionieren in Dialogen und Editor |

## Abbruchkriterien

M1 darf nicht freigegeben werden, wenn einer dieser Punkte offen ist:

- Datenverlust beim Speichern, Ordnerwechsel oder Sync
- App-Crash im normalen lokalen Desktop-Basisflow
- Closed-Beta-Gate lässt unbekannte Nutzer hinein
- Collaboration schreibt falsche Dateien oder verliert Remote-Änderungen still
- Security-Header/Auth-Grenzen fallen in CI oder Staging
- macOS-Artefakt startet nicht
- ein externer Gap aus [Archiv #79](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/79) ist ungeprüft und launch-blocking

## Ergebnisprotokoll

Jeder manuelle Lauf bekommt einen Kommentar im relevanten Issue oder PR mit:

- Datum und Tester
- Plattform, OS-Version, CPU-Architektur
- Commit/Build-Artefakt
- ausgeführte Test-IDs
- Ergebnis je Test
- Screenshots oder Logs bei Fehlern
- Folge-Issue bei Rework
