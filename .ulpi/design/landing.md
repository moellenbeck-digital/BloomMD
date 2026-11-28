# Landing `/` · Feature-Spec (bindet an `DESIGN.md`)

**Identity lock:** Every screen must read as the same product if placed side by side.

## Nutzer und Ziel

| Punkt | Inhalt |
|---|---|
| Nutzer | Menschen mit Markdown-Dateien (lokal, Git, Obsidian) |
| Ziel | In einem Blick verstehen: die Datei wird zur Map |
| Primäraktion | „Demo ohne Konto testen“ (Hero) |
| Geräte | Desktop ≥ 1180 px, Tablet und Handy darunter, ab 320 px |

## Flows und Zustände

| Flow | Schritte | Randfälle |
|---|---|---|
| Verstehen | Hero lesen → Map wächst → Zweig zeigen/antippen → Zeile leuchtet | Ohne JavaScript: Endbild. Zurück-Taste: kein eigener Zustand |
| Anwendungsfall wählen | Ast antippen oder Pfeiltaste → Teilbaum, Datei, Text wechseln | Schnelle Wechsel: neuer Baum ersetzt alten, nichts sperrt |
| Richtung prüfen | Trieb lesen → Issue-Link oder Roadmap | Externe Links: GitHub nicht erreichbar → Browser-Fehler, kein eigener Zustand |

| Zustand | Hero | Anwendungsfälle | Vision |
|---|---|---|---|
| Laden | Server-Render, Schrift-Fallback metrisch angepasst | gleich | gleich |
| Leer / Fehler | nicht möglich (statische Daten) | nicht möglich | nicht möglich |
| Ruhe | Fokuspfad „Produktstrategie → Leitbild“ leuchtet | erster Reiter gewählt | statisch |
| Aktiv | Pfad des Knotens leuchtet, angeheftet bei Klick | gewählter Ast mit Blüte | Link-Hover |

## Komponenten

### `HeroTrieb` + `HeroIntro`

| Punkt | Regel |
|---|---|
| Daten | `markdown` (9 Zeilen der Beispieldatei) |
| Varianten | breite Map (≥ 1180 px), Gliederungs-Map |
| Interaktion | Wort ist `button` mit `aria-pressed`. Name: `Zweig „X“ in der Map hervorheben` |
| Tastatur | Tab durch H1-Aktionen, dann Wörter in Dateireihenfolge. Enter/Leertaste heftet an |
| Fokus und Wachstum | Kommt der Tastaturfokus in einen Abschnitt, steht dort sofort das Endbild. Kein fokussiertes Element ist unsichtbar |
| ARIA | Map `role="group"`, SVG `aria-hidden`. Inspector `aside` |
| Responsive | Datei vollständig sichtbar, nie abgeschnitten. Inspector auf jeder Breite |
| LCP | H1 (breit), Absatz (Handy). Beide animieren nicht |

### `UseCaseTrieb`

| Punkt | Regel |
|---|---|
| Daten | 4 Fälle: `label, file, heading, text, markdown` |
| Muster | `tablist` vertikal, Roving `tabindex`, Pfeile hoch/runter/links/rechts, Home, End |
| Panel | `tabpanel` mit Überschrift, Text, Datei, Teilbaum (`role="img"`) |
| Höhe | feste Mindesthöhe, Wechsel verschiebt nichts darunter |
| Touch | Reiter ≥ 44 px hoch |

### `VisionTrieb`

| Punkt | Regel |
|---|---|
| Daten | Texte aus `knowledge-vision-section.tsx` (de, en), unverändert |
| Status | Wort + Dicke + Blüte/Knospe/offene Spitze |
| Reihenfolge | DOM = Lesefolge: Titel, Intro, Roadmap, heute, Pilot, in Prüfung, 4 Felder, Voraussetzungen |
| Links | Issue-Links ≥ 44 px, Name `Titel: Issue N` |

## Accessibility

| Punkt | Regel |
|---|---|
| Kontrast | Tabelle in `DESIGN.md` |
| Fokus | 2 px `bloom-hi`, 3 px Abstand |
| Bewegung | `prefers-reduced-motion` → Endbild. Keine Schleifen, darum kein Pause-Knopf nötig |
| Transparenz | `prefers-reduced-transparency` → Header deckend |

## Pre-Flight

| Prüfpunkt | Stand |
|---|---|
| Werte nur aus `DESIGN.md` (3 Abschnitte + Header) | ja |
| Ein Akzent, eine Radius-Regel, eine Icon-Familie (Lucide), eine Schriftpaarung | ja |
| Verbotene Muster (Karten, Pill, gestrichelt, Fensterattrappe, Text links + Bild rechts) | 0 in den 3 Abschnitten |
| Verbotene Schriften, lila Glow, Creme-Grund, Verlaufstext | 0 |
| Gedankenstrich im sichtbaren Text | 1 (Bestand, Hero-Absatz; darf nicht geändert werden) |
| Counterfactual: dieser Look passt nur zu einem Markdown-Map-Produkt | ja |
| Layout-Familien ≥ 3 | Krone, Gabel, Trieb |
| Eine Primäraktion pro Ansicht | ja im Inhalt. Header zeigt zusätzlich „Jetzt registrieren“ (Bestand) |
| Hauptnavigation ≤ 5 | **nein** (7, Bestand; Kürzen wäre Inhaltsänderung) |

| Selbstkritik (0–4) | Punkte |
|---|---|
| Eigenständigkeit | 4 |
| Hierarchie und Fokus | 3 |
| Treue zu `DESIGN.md` | 3 |
| Accessibility | 3 |
| Zustände und Randfälle | 3 |
| Textqualität (Bestand) | 3 |
| Zurückhaltung | 3 |
| Motivierte Bewegung | 4 |
| **Summe** | **26 / 32** |

## Build-Handoff

| Punkt | Inhalt |
|---|---|
| Ziel-Agent | Engineer (Next.js 16, CSS-Module) |
| System | bespoke |
| Abnahme | CLS 0 bei 1440 und 390 · LCP-Element wie vorher · reduced-motion = Endbild · axe ohne serious/critical · keine neuen Requests · Sperrzone unberührt · alle Texte vorhanden |
| Anweisung | Genau diese Spec umsetzen, nicht neu gestalten |
