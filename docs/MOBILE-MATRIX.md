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
# gegen ein laufendes System: nicht möglich (nur Projekt chromium), die Matrix läuft nur im Mobile-Projekt
bun test ../../packages/ui/src/utils/visual-viewport.test.ts
```

`e2e/mobile-matrix.spec.ts` (Testmarke `@t66`) und `visual-viewport.test.ts`. Die CI führt die Matrix mit dem
Projekt `chromium-mobile` aus.

## Manuell (echtes Gerät)

Emulation kann das nicht: echte Tastatur, Momentum-Scrollen, Berechtigungsdialoge, Safari-Eigenheiten.
**Datum und Gerät beim Abarbeiten eintragen.** Diese Liste ist manuell.

| Bereich | Prüfung | Datum | Gerät | Ergebnis |
|---|---|---|---|---|
| Tastatur, Android Chrome (Web-App) | Knoten wählen, Editor öffnen, in den Text tippen: Feld und Cursor bleiben über der Tastatur sichtbar |  |  |  |
| Tastatur, iOS Safari (Web-App) | wie oben; Kopfzeile bleibt sichtbar, kein weißer Streifen unter der Seite nach dem Schließen der Tastatur |  |  |  |
| Tastatur, Capacitor Android | Bottom-Sheet öffnen, in den Text tippen: Feld sichtbar; Tastatur schließen: Sheet hat wieder die alte Höhe |  |  |  |
| Tastatur, Capacitor iOS | wie oben; Sheet bleibt über der Tastatur (WKWebView ohne Keyboard-Plugin) |  |  |  |
| Tastatur, Umbenennen am Knoten | Doppeltippen auf einen Knoten: Eingabefeld im Knoten bleibt sichtbar (liegt in der Karte, nicht im Editor) |  |  |  |
| Gesten | Pinch und Zwei-Finger-Verschieben fühlen sich flüssig an (Momentum, kein Ruckeln) auf Telefon und Tablet |  |  |  |
| Gesten, Safari iOS | Pinch auf der Karte zoomt nicht die Seite; Doppeltipp zoomt nicht |  |  |  |
| Zielgrößen | Aktionsleiste, Aufklapp-Griff, Zoom-Steuerung, Tab-Leiste mit dem Daumen treffen, ohne Nachbarn zu erwischen |  |  |  |
| Dateibrowser | Datei lange drücken: Kontextmenü (Umbenennen, Löschen) erscheint (Android) |  |  |  |
| Ausrichtung | Drehen im Editor und im Drawer: nichts bricht aus dem Bild, Eingabe bleibt erhalten |  |  |  |
| Splitscreen (iPad, Android) | Fenster schmal ziehen: Kopfzeile ohne Überlauf, Editor bedienbar |  |  |  |

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

## Stand

Die automatische Matrix ist Teil dieses Pull Requests. Die manuelle Tabelle ist leer, bis jemand sie mit einem
echten Gerät abarbeitet.
