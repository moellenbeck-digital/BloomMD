# Mobile-Matrix: Touch-Bedienung von Web-App und Capacitor-App (Ticket 66)

Gilt für die Web-App (`apps/app`) und die Capacitor-App (`packages/mobile`). Beide nutzen dieselben
Komponenten (`MindMapCanvas`, `MindMapNode`, `NodeEditor` in `packages/ui`). Das Obsidian-Plugin hat eine
eigene Matrix: [plugins/obsidian/MOBILE-MATRIX.md](../plugins/obsidian/MOBILE-MATRIX.md).

Die Desktop-App (`packages/desktop`) teilt die Komponenten und bekommt die Touch-Regeln über denselben
Mechanismus (`pointer: coarse`), sieht mit einer Maus aber unverändert aus.

## Kleinste Zielgröße

**44 × 44 CSS-Pixel für jedes bedienbare Element.** Gemessen wird das Trefferfeld, nicht das Aussehen: Ein
Element darf kleiner aussehen, solange sein Trefferfeld 44 px erreicht (Padding, `min-h-11 min-w-11` oder
ein größerer, durchsichtiger Rahmen um ein kleines Symbol).

Umgesetzt wird sie nur für grobe Zeiger (`pointer: coarse`, Tailwind `pointer-coarse:`). Mit einer Maus
bleibt das Aussehen wie vorher. Die Capacitor-App ist reine Touch-App und setzt 44 px ohne Bedingung.

### Ausnahmen

Jede Ausnahme steht hier mit Grund. Die automatische Prüfung kennt genau diese.

| Element | Grund |
|---|---|
| Verbindungspunkte der Knoten (`.react-flow__handle`, 5 px) | Keine Bedienung: Die Karte hat keine Aktion „Knoten verbinden“ (kein `onConnect`). |
| Link inline in Fließtext | Zielgröße gilt nicht für Links, die mitten im Satz stehen. |
| Eingabefeld in einem `<label>` | Gemessen wird das Label: Es ist das Trefferfeld, ein Tipp darauf fokussiert das Feld (Suchfeld im Dateibrowser). |
| Abzeichen am Knoten (Link-Zähler, Hinweis `h-6`, Anwesenheit `h-4`) | Keine Bedienung: reine Anzeige mit Tooltip, ohne Klick-Aktion. |
| Element, das ein anderes verdeckt | Es lässt sich in dem Zustand nicht bedienen (Beispiel: Kartenleiste hinter dem Editor, siehe Abweichung 2). |

## Zielgrößen: was geändert wurde

| Bereich | Vorher | Jetzt (grober Zeiger) |
|---|---|---|
| Zoom-Steuerung (`.react-flow__controls-button`) | 26 px (Web, Desktop) | 44 px; Mobile-Build hatte das schon |
| Aktionsleiste am Knoten (Plus, Geschwister, Editor, Agent, Quelle, Ressource) | 28 px | 44 px |
| Aufklapp-Griff am Knoten | 28 px | 44 px Trefferfeld, der sichtbare Kreis bleibt 28 px |
| Aufgaben-Kästchen im Knoten | 15 px | 44 px Trefferfeld ohne Änderung der Knotengröße (Padding mit negativem Rand) |
| Kartenleiste (Ansicht, Gliederung, Rückgängig, …) und ihre Auswahlfelder | 32 px | 44 px |
| Toolbar der Web-App (Neu, Speichern, Export, Menüs, Menüeinträge) | 34–36 px | 44 px |
| Kopfzeile der Web-App (Menü, Über, Verlauf, Arbeitsbereich, Speichern) | 28–36 px | 44 px |
| Tab-Leiste (Tab, Schließen, Pfeil) | 24–28 px | 44 px |
| Dateibrowser-Drawer (Schließen, Favorit, Suche, Kontextmenü) | 28–40 px | 44 px |
| Kopf des `NodeEditor` (Löschen, Quelle öffnen, Felder, Abschnitte, Link-Aktionen) | 32–36 px | 44 px |
| Werkzeugleiste des Markdown-Editors (Fett, Liste, Link, Tabelle, …) | 28 px | 44 px (die Leiste scrollt seitlich) |
| Capacitor-Shell (Fehlerhinweis schließen, Konto verwalten, Brotkrumen, Serverfeld) | 28–40 px | 44 px |

### Zoom der Karte

Bedienelemente am Knoten (Aktionsleiste, Aufklapp-Griff) liegen im skalierten Teil der Karte. Bei einer
großen Karte (Zoom 0,3) wären 44 px nur 13 px auf dem Bildschirm. Auf Touch-Geräten heben sie den Zoom
deshalb auf: `MindMapCanvas` schreibt den Zoom in die CSS-Variable `--bloommd-canvas-zoom`, die Elemente
skalieren mit `1 / Zoom` (`utils/canvas-zoom.ts`). Folge: Bei stark verkleinerter Karte verdeckt die
44-px-Aktionsleiste des gewählten Knotens die Knoten unter ihm, bis man abwählt (Tipp auf die leere Fläche).
Der Aufklapp-Griff liegt mit seinem Trefferfeld nach außen (links bündig mit dem Kreis), damit er bei kleinem
Zoom nicht die Mitte des Knotens schluckt (Chrome lenkt Tipps zur nächsten Schaltfläche um).

## Gesten

Geprüft mit CDP-Touch-Ereignissen (`Input.dispatchTouchEvent`) im Pixel-5-Emulator.

| Geste | Ergebnis | Prüfung |
|---|---|---|
| Ein Finger auf leerer Fläche zieht | Ansicht verschiebt sich, kein Knoten bewegt sich | automatisch |
| Ein Finger auf einem Knoten zieht | Knoten wird verschoben, Ansicht bleibt (außer am Rand, s. u.) | automatisch |
| Pinch auf leerer Fläche | Zoom, kein Knoten bewegt sich | automatisch |
| Pinch, ein Finger auf einem Knoten | Zoom, kein Knoten bewegt sich | automatisch |
| Zwei-Finger-Verschieben, ein Finger auf einem Knoten | Ansicht verschiebt sich, kein Knoten bewegt sich | automatisch |
| Pinch oder Zwei-Finger-Verschieben, beide Finger auf demselben Knoten | Nichts: weder Zoom noch Verschieben | Abweichung 1 (`test.fixme`) |

**Die Props bleiben unverändert**, weil keine Kollision besteht:

- `panOnDrag` (ohne Liste): Ein Finger auf der leeren Fläche verschiebt die Ansicht. `selectionOnDrag` ist
  gesetzt, wirkt bei `panOnDrag === true` aber nicht (`FlowRenderer` in `@xyflow/react`:
  `selectionOnDrag && panOnDrag !== true`). Deshalb zieht ein Finger kein Auswahlrechteck auf.
- `zoomOnPinch`: Pinch zoomt. Beginnt ein Finger auf einem Knoten und der andere daneben, zoomt die Karte und
  der Knoten bewegt sich nicht (im Test geprüft). Beginnt auch der zweite Finger auf einem Knoten, greift der
  Zoom nicht (Abweichung 1).
- `zoomOnDoubleClick={false}`: Doppeltippen auf einen Knoten benennt ihn um und löst keinen Zoom aus.
- `panOnScroll`, `zoomOnScroll={false}`: betreffen nur Maus und Trackpad.
- Rand-Verschiebung: Zieht ein Finger einen Knoten näher als etwa 40 px an den Rand der Karte, verschiebt
  React Flow die Ansicht mit (`autoPanOnNodeDrag`, Voreinstellung). Auf einem Telefon ist der Rand schnell
  erreicht; das ist gewollt und bleibt.

## Ausrichtung

Hochformat (393 × 851) und Querformat (851 × 393) werden mit derselben Prüfung gemessen: Zielgrößen und
horizontaler Überlauf in den Zuständen Karte, Knoten gewählt, Editor offen, Dateibrowser offen und (ab 640 px
Breite) die Menüs der Toolbar.

## Bildschirmtastatur

Browser verhalten sich verschieden: Android Chrome und die Capacitor-WebView (`adjustResize`) verkleinern die
Seite, iOS Safari und WKWebView verkleinern nur den sichtbaren Ausschnitt (`visualViewport`).

- `interactive-widget=resizes-content` im Viewport-Meta (Web-App über `viewport` in `layout.tsx`, Capacitor in
  `index.html`): Chrome verkleinert die Seite, `dvh` folgt.
- `useVisualViewport` (`packages/ui`) schreibt die sichtbare Höhe und die Verschiebung des Ausschnitts in
  `--bloommd-viewport-height` und `--bloommd-viewport-translate` auf `<html>`. Die Wurzel von Web-App
  (`h-screen` wurde `dvh`) und Capacitor-App nutzt sie (`VIEWPORT_ROOT_CLASS`). Ohne Tastatur, bei Zoom der
  Seite und ohne `visualViewport` ist nichts gesetzt.
- Der Editor (`NodeEditor`) scrollt ein fokussiertes Textfeld in den sichtbaren Bereich, sofort und noch einmal,
  wenn sich der Ausschnitt geändert hat. Das Bottom-Sheet der Capacitor-App hat eine Höhe, die den sichtbaren
  Bereich berücksichtigt.

| Prüfung | Art |
|---|---|
| Berechnung der Höhe aus `visualViewport` (Tastatur, Verschiebung, Pinch-Zoom der Seite, Android) | Unit-Test `visual-viewport.test.ts` |
| Layout-Viewport schrumpft (Android, Chrome): Feld bleibt sichtbar | Playwright, `setViewportSize` |
| Nur der sichtbare Ausschnitt schrumpft (iOS): Wurzel folgt, Feld bleibt sichtbar, danach wieder voll | Playwright, `visualViewport` überschrieben und `resize` ausgelöst |
| Echte Tastatur, Kopfzeile bleibt bei Verschiebung durch iOS sichtbar, Capacitor-Sheet | manuell (unten) |

## Automatisch

```bash
cd apps/app
bun run test:e2e -- --project=chromium-mobile e2e/mobile-matrix.spec.ts
# gegen ein laufendes System (Testmodus, siehe e2e/README.md), mit der Standard-Config:
PLAYWRIGHT_BASE_URL=<system> bunx playwright test --project=chromium-mobile --grep @t66
bun test ../../packages/ui/src/utils/visual-viewport.test.ts
```

`e2e/mobile-matrix.spec.ts` (Testmarke `@t66`) und `visual-viewport.test.ts`.

### Touch-Ansichten der gebauten Mobile-Assets (Ticket 68)

Der Workflow `.github/workflows/mobile.yml` (Job `touch-views`) baut `packages/mobile` mit dem Bundle-Budget,
liefert `dist` mit `vite preview` aus und öffnet es mit den Geräteprofilen iPhone SE, iPad (Hochformat) und
Pixel 5 (Chromium, Touch-Emulation). Je Gerät und Ansicht (leerer Start, Karte, Knoten gewählt, Editor,
Dateibrowser): kein horizontaler Überlauf, jedes bedienbare Element mindestens 44 px (dieselben Ausnahmen wie
oben), der Editor öffnet sich aus der Karte und das Textfeld nimmt einen Tipp an. Verstöße machen den Lauf rot;
Screenshot und Trace der betroffenen Ansicht hängen als Artefakt `mobile-touch-views` am Lauf. Die Job-Summary
nennt Messwerte je Ansicht und was nicht geprüft wird.

```bash
cd packages/mobile
bun run build && bun run test:touch
```

Die Größenprüfung `smallTargets` ist aus `apps/app/e2e/mobile-matrix.spec.ts` nach
`packages/mobile/e2e/touch-helpers.ts` kopiert, damit das @t66-Spec unverändert bleibt. Ändern sich die Regeln,
beide Stellen anpassen.

Die App läuft im Browser ohne Capacitor-Plugins: Ordnerwahl, Keychain, Teilen und App-Links fehlen, die Notizen
liegen im Browser-Speicher (App-Ordner), die Demo-Notiz kommt über „Importieren“. **Nicht geprüft** von dieser
Prüfung: die native Hülle (dafür `ios.yml` und `android.yml` mit Selbsttest), WebKit-Darstellung (die iOS-Profile
laufen auf Chromium), Querformat, Tastatur und Gesten der Capacitor-App, Anmeldung, Notizen aus einem echten
Ordner. Das steht auch in der Job-Summary.

Auch `ios.yml` und `android.yml` schreiben eine Job-Summary (`packages/mobile/scripts/ci-summary.mjs`): der
tatsächliche Stand je Schritt (bestanden, fehlgeschlagen, nicht gelaufen), das Artefakt oder der Grund, warum es
keines gibt, und „Nicht geprüft“. Der Text dazu steht an einer Stelle (`scripts/ci-summary-text.mjs`) und gilt
auch für `mobile.yml`. Emulator und Simulator fangen Layout-Fehler und Abstürze, sonst nichts. `ios.yml` lädt
die Simulator-App (Selbsttest-Build) als Zip `ios-simulator-app` hoch.

Das Bundle-Budget der Mobile-App ruft `check-vite-bundle.mjs` mit `--require-lazy` auf: Fehlt der
`NodeEditor`-Chunk, schlägt der Build fehl, statt die Lazy-Prüfung still zu überspringen. Die Desktop-App ruft
das Skript ohne Schalter auf und verhält sich wie vorher.


Gegen ein laufendes System läuft die Matrix mit der Standard-Config `playwright.config.ts` und dem Projekt
`chromium-mobile` (Pixel 5). Die Testsystem-Config `playwright.testsystem.config.ts` kennt nur Desktop Chrome
und schließt `mobile-matrix.spec.ts` aus; mit ihr lässt sich die Matrix nicht ausführen.

Die CI führt die Matrix derzeit **nicht** aus: `.github/workflows/ci.yml` listet für das Projekt
`chromium-mobile` nur `e2e/mobile-smoke.spec.ts`. Vorschlag für ein Folge-Ticket: `e2e/mobile-matrix.spec.ts` in
den Schritt „Run app Chromium end-to-end tests“ aufnehmen (siehe Abweichung 9).

## Manuell (echtes Gerät)

Emulation kann das nicht: echte Tastatur, Momentum-Scrollen, Berechtigungsdialoge, Safari-Eigenheiten.
**Datum und Gerät beim Abarbeiten eintragen.** Jede Zeile ist manuell (Spalte „Art“); keine davon läuft
automatisch.

| Art | Bereich | Prüfung | Datum | Gerät | Ergebnis |
|---|---|---|---|---|---|
| manuell | Tastatur, Android Chrome (Web-App) | Knoten wählen, Editor öffnen, in den Text tippen: Feld und Cursor bleiben über der Tastatur sichtbar |  |  |  |
| manuell | Tastatur, iOS Safari (Web-App) | wie oben; Kopfzeile bleibt sichtbar, kein weißer Streifen unter der Seite nach dem Schließen der Tastatur |  |  |  |
| manuell | Tastatur, Capacitor Android | Bottom-Sheet öffnen, in den Text tippen: Feld sichtbar; Tastatur schließen: Sheet hat wieder die alte Höhe |  |  |  |
| manuell | Tastatur, Capacitor iOS | wie oben; Sheet bleibt über der Tastatur (WKWebView ohne Keyboard-Plugin) |  |  |  |
| manuell | Tastatur, Umbenennen am Knoten | Doppeltippen auf einen Knoten: Eingabefeld im Knoten bleibt sichtbar (liegt in der Karte, nicht im Editor) |  |  |  |
| manuell | Gesten | Pinch und Zwei-Finger-Verschieben fühlen sich flüssig an (Momentum, kein Ruckeln) auf Telefon und Tablet |  |  |  |
| manuell | Gesten, Safari iOS | Pinch auf der Karte zoomt nicht die Seite; Doppeltipp zoomt nicht |  |  |  |
| manuell | Zielgrößen | Aktionsleiste, Aufklapp-Griff, Zoom-Steuerung, Tab-Leiste mit dem Daumen treffen, ohne Nachbarn zu erwischen |  |  |  |
| manuell | Dateibrowser | Datei lange drücken: Kontextmenü (Umbenennen, Löschen) erscheint (Android) |  |  |  |
| manuell | Ausrichtung | Drehen im Editor und im Drawer: nichts bricht aus dem Bild, Eingabe bleibt erhalten |  |  |  |
| manuell | Splitscreen (iPad, Android) | Fenster schmal ziehen: Kopfzeile ohne Überlauf, Editor bedienbar |  |  |  |
| manuell | Berechtigung, Capacitor iOS: Ordner öffnen | „Ordner öffnen“ zeigt die Dateien-App (`UIDocumentPickerViewController`, `BloomFolderPlugin.swift`). Der Zugriff wird als Security-Scope-Lesezeichen gespeichert, daher fragt die App nach einem Neustart nicht erneut. Prüfen: Auswahl, Abbrechen (App bleibt unverändert), Neustart (Ordner bleibt offen, kein neuer Dialog), Ordner in iCloud (Hinweis „wird geladen“) |  |  |  |
| manuell | Berechtigung, Capacitor Android: Ordner öffnen | „Ordner öffnen“ zeigt den Systemdialog des Storage Access Framework (`ACTION_OPEN_DOCUMENT_TREE`); die Freigabe bleibt über `takePersistableUriPermission` bestehen (`BloomFolderPlugin.kt`). Prüfen: Auswahl und Freigabe, Ablehnen (App bleibt unverändert), Neustart (kein neuer Dialog), Ordner auf SD-Karte oder Cloud-Anbieter |  |  |  |
| manuell | Berechtigung, Capacitor: Datei importieren | „Importieren“ öffnet die Systemauswahl (`<input type="file">` für `.md`, `.markdown`, `.opml`; Android: Dokumentenauswahl, iOS: Dateien). Die Auswahl selbst ist die Freigabe, die App fragt keine Berechtigung an. Prüfen: Datei wählen, Abbrechen |  |  |  |
| manuell | Berechtigung, Capacitor: Teilen und Export | Teilen öffnet das System-Teilen-Blatt (`@capacitor/share`) mit einer Datei im App-Cache. Kein Berechtigungsdialog der App. Prüfen: Export als Markdown und PDF teilen und in Dateien/Mail ablegen |  |  |  |
| manuell | Berechtigung, Capacitor: App-Speicher und Kontoanmeldung | Kein Dialog erwartet. Notizen liegen im App-Speicher (iOS `Documents`, Android `Data`), das Android-Manifest verlangt nur `INTERNET`, `Info.plist` enthält keinen `…UsageDescription`-Schlüssel (keine Kamera, Fotos, Mikrofon, Standort). Die Anmeldung läuft im Systembrowser (`@capacitor/browser`) und kehrt über `bloommd://auth` zurück; ob das System dafür eine Rückfrage zeigt, ist hier zu prüfen und einzutragen. Prüfen: Erststart, Notiz anlegen und speichern, Anmelden und Zurückkehren: kein Berechtigungsdialog, in den Systemeinstellungen der App keine Berechtigung aufgelistet |  |  |  |
| manuell | Berechtigung, Web-App: Datei-Auswahl | Datei importieren (Toolbar), Datei für eine Ressource wählen (Editor) und Screenshots im Feedback-Dialog (`accept="image/png,image/jpeg,image/webp"`) öffnen die Systemauswahl. Der Code setzt kein `capture`-Attribut und fordert die Kamera nicht selbst an. Prüfen: Wenn die Auswahl auf dem Gerät Kamera oder Fotos als Quelle anbietet und danach eine Berechtigungsfrage kommt, ist das ein Dialog des Systems; Ergebnis eintragen |  |  |  |
| manuell | Berechtigung, Web-App: lokaler Ordner | „Lokalen Markdown-Ordner öffnen“ ruft `showDirectoryPicker` (File System Access, `mode: "readwrite"`) auf und fragt bei schreibgeschützten Ordnern Schreibzugriff an (`requestPermission`); die Schaltfläche erscheint nur, wo die Funktion existiert, und in der Kopfzeile erst ab 768 px Breite. Prüfen: auf Telefon- und Tablet-Browsern, ob die Schaltfläche erscheint; wenn ja Ordnerdialog, Schreibzugriff ablehnen und erteilen; wenn nein, „nicht angeboten“ eintragen |  |  |  |
| manuell | Berechtigung, Web-App: Zwischenablage | „Link kopieren“, Freigabelink und Zugriffstoken schreiben mit `navigator.clipboard.writeText`; gelesen wird nie. Fehler werden still verschluckt (`.catch`). Prüfen: iOS Safari und Android Chrome kopieren nach dem Tipp ohne Dialog; bei Fehler die Wirkung eintragen |  |  |  |
| manuell | Berechtigung, Web-App und Capacitor: nicht angefordert | Kamera, Mikrofon, Standort und Benachrichtigungen werden nirgends angefordert (kein `getUserMedia`, `geolocation`, `Notification` in `apps/app/src`, `packages/ui/src`, `packages/mobile/src`). Prüfen: Der Browser (Seiteninfo) und die Systemeinstellungen der App zeigen nach einer Sitzung mit Karte, Editor, Import und Teilen keine Berechtigungsanfrage |  |  |  |

## Abweichungen

Gefunden, nicht behoben. Jede ist als Folge-Ticket gemeldet, nicht stillschweigend akzeptiert.

1. **Pinch mit beiden Fingern auf demselben Knoten tut nichts.** React Flow gibt jedem verschiebbaren Knoten
   die Klasse `nopan`; der Zoom-Filter blockiert dann auch den zweiten Finger. Bei hohem Zoom und großen
   Knoten landen beide Finger leicht auf einem Knoten. Abhilfe: Finger auf die leere Fläche setzen.
   Test: `test.fixme("pinch with both fingers on the same node zooms")`.
2. **Web-App auf dem Telefon: Der Editor verdeckt die Karte.** `ResizableEditor` ist ein Seitenpanel (Standard
   380 px, mindestens 280 px) und füllt bei 393 px Breite fast den Bildschirm. Es gibt keine Schaltfläche zum
   Schließen (nur Tipp auf die schmale Kartenkante oder Esc). Die Capacitor-App löst das mit einem Bottom-Sheet.
   Das ist eine Gestaltungsentscheidung (Bottom-Sheet in der Web-App), kein Größenfehler.
3. **Kopfzeile der Web-App im Arbeitsbereich-Modus ist breiter als ein Telefon.** Mit geöffnetem lokalem
   Ordner stehen die Gruppen „Zurück, Vor, Dokument, Arbeitsbereich, Ordner, Datei, Prüfen“ in einer Zeile
   (`browserWorkspaceName`) und laufen über 393 px. Ein lokaler Ordner lässt sich auf einem Telefon nur in
   Chromium-Browsern mit File System Access öffnen; die Gruppe wurde nicht gemessen.
4. **Dateibrowser: Umbenennen und Löschen nur per Kontextmenü (`contextmenu`).** Android Chrome löst es beim
   langen Drücken aus, iOS Safari und WKWebView nicht. Auf iOS sind beide Aktionen im Drawer nicht erreichbar.
5. **Editor-Kopf in der Capacitor-App: Löschen-Schaltfläche überlappt die Schließen-Schaltfläche des Sheets**
   um etwa 12 px (beide jetzt 44 px, vorher 32 und 44, Überlappung bestand schon). Ein Tipp auf den unteren
   Rand von „Schließen“ kann den Zweig löschen. Nicht im Browser prüfbar (Capacitor-Shell), nur nach Quelltext.
6. **Aufgaben-Kästchen im Knoten skaliert mit der Karte.** Sein 44-px-Trefferfeld liegt im Text des Knotens und
   wird bei Zoom unter 1 kleiner (nicht gegengerechnet, es würde die Knotenbreite sprengen).
7. **Verdeckung bei verkleinerter Karte:** siehe „Zoom der Karte“. Die 44-px-Aktionsleiste verdeckt Nachbarn
   unter dem gewählten Knoten.
8. **Selten bedienbare Ränder, nicht gemessen:** Dialoge der Web-App außer dem Anlegen-Dialog (Feedback, Verlauf,
   Konflikte, Theme, Befehlspalette), Marketing-Seiten und die Demo. Sie liegen außerhalb der drei Komponenten des
   Tickets und stehen nicht in der automatischen Prüfung.

9. **Die CI führt die Matrix nicht aus.** `ci.yml` listet für `chromium-mobile` nur `e2e/mobile-smoke.spec.ts`.
   Folge-Ticket-Vorschlag: `e2e/mobile-matrix.spec.ts` in den Schritt „Run app Chromium end-to-end tests“
   aufnehmen. Das ist eine Änderung an der Pipeline und gehört nicht in dieses Ticket.

10. **Capacitor-App: Die Schließen-Schaltfläche des Editor-Sheets nimmt keinen Tipp an.** Sie ist `absolute`
    ohne `z-index`; der Kopf des `NodeEditor` (`relative`, steht später im DOM) liegt darüber, `elementFromPoint`
    in der Mitte der Schaltfläche liefert den Kopf (iPhone SE, iPad, Pixel 5 im Build). Die Größenprüfung
    überspringt verdeckte Elemente (siehe Ausnahmen) und sieht es deshalb nicht. Abhilfe: Schaltfläche mit `z-10`.
    Test: `test.fixme("the close button of the editor sheet takes the tap")` in
    `packages/mobile/e2e/touch-views.spec.ts`. Zusammenhang mit Abweichung 5.

## Stand

Die automatische Matrix ist Teil dieses Pull Requests. Die manuelle Tabelle ist leer, bis jemand sie mit einem
echten Gerät abarbeitet.
