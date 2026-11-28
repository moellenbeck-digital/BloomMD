---
project: BloomMD Marketing (apps/marketing)
register: brand
aesthetic_direction: organic editorial
color_strategy: drenched
design_system: bespoke
design_variance: 8
motion_intensity: 5
visual_density: 4
status: locked for prototype (v2), not yet accepted by Max
---

# BloomMD design language v2 · „Der Trieb“

**Identity lock:** Every screen must read as the same product if placed side by side.

## Design Read

Ein warmer, ruhiger Botanik-Satz statt SaaS-Seite: Die Wette ist, dass die Map selbst das Layout ist.

## Signature · Der Trieb

Ein spitz zulaufender, warmer Ast wächst aus dem `#` einer Markdown-Zeile, trägt die Wörter ohne Kasten, und seine Dicke zeigt die Ebene.

| Regel | Wert |
|---|---|
| Form | gefüllte Fläche, nie ein Strich mit konstanter Breite. Dick am Ursprung, dünn an der Spitze |
| Weg | eine Biegung (kubische Kurve), danach die Grundlinie unter dem Wort |
| Wort | sitzt auf dem Ast. Kein Rahmen, keine Fläche, kein Radius |
| Dicke | Ebene 1: 15 → 6 · Ebene 2: 8 → 3 · Ebene 3: 4,5 → 1 (Design-Einheiten) |
| Fokus | Farbe `bloom` **und** 1,3-fache Dicke **und** Wortfarbe. Nie Farbe allein |
| Blüte | höchstens eine pro Ansicht. Sie markiert den Fokus oder „heute nutzbar“. Fünf Blätter aus derselben Trieb-Form |
| Knospe | geschlossen. Nur für „Pilot“ |
| Offene Spitze | feinste Ranke ohne Abschluss. Nur für „in Prüfung“ |
| Hängendes `#` | links vor der H1, Farbe `bloom`; ab 73.75rem groß, darunter klein (1,5rem) |
| Kleine Ableger | Listenzeichen und Unterstreichung der Zweitaktion sind kurze Triebe |

Code: `apps/marketing/src/components/v2/trieb.ts` (Geometrie), `branch.tsx` (Trieb, Blüte, Knospe).

Formen in CSS (`clip-path: path()`) stammen aus `trieb.ts`. Gerade Keile sind nur noch für kurze Unterstriche unter Aktionen und für lange senkrechte Stämme erlaubt.

## Color (locked)

Neutrale Töne sind zur Markenfarbe getönt (Rinde, Hue 48–75). Ein Akzent. Hell und dunkel folgen dem Systemthema (`html.dark`), gleiche Rollen in beiden.

### Dunkel (`html.dark`)

| Rolle | Token | OKLCH | Hex | Einsatz |
|---|---|---|---|---|
| Fläche | `--bmd-ground` | 0.205 0.019 50 | #1e150f | Abschnitte, Header |
| Fläche tief | `--bmd-deep` | 0.172 0.016 48 | #160e0a | Vision |
| Fläche erhöht | `--bmd-raised` | 0.255 0.024 52 | #2c2018 | reserviert für Overlays |
| Text | `--bmd-ink` | 0.945 0.014 75 | #f2ece3 | Titel, Wörter |
| Text zweit | `--bmd-ink-2` | 0.86 0.022 70 | #dbcfc2 | Fließtext |
| Text dritt | `--bmd-ink-3` | 0.775 0.028 66 | #c3b3a4 | Meta, Quelle (nie Fließtext) |
| Trieb | `--bmd-bark` | 0.56 0.05 56 | #8c6d58 | Äste ohne Fokus (nur Grafik) |
| Trieb hell | `--bmd-bark-hi` | 0.70 0.058 62 | #b9977a | Ableger, Kelchblätter |
| Trennlinie | `--bmd-soil` | 0.345 0.028 52 | #45352c | Boden-Linie, Header-Kante (dekorativ) |
| Akzent | `--bmd-bloom` | 0.74 0.155 45 | #f98751 | Fokus, Primäraktion, Blüte |
| Akzent hell | `--bmd-bloom-hi` | 0.805 0.12 52 | #fda975 | Hover, Fokusring, Akzenttext |
| Auf Akzent | `--bmd-on-bloom` | 0.19 0.03 45 | #1f0f08 | Text auf `bloom` |

Statusfarben: keine. Status wird durch Wort, Dicke und Knospenform getragen.

### Gemessene Paare (WCAG 2 · APCA |Lc|)

| Paar | WCAG | Lc | Schwelle |
|---|---|---|---|
| ink / ground | 15,29 | 95 | ok |
| ink-2 / ground | 11,73 | 78 | ≥ 75 Fließtext |
| ink-3 / ground | 8,81 | 62 | ≥ 60 Nicht-Fließtext |
| ink / deep | 16,24 | 95 | ok |
| ink-2 / deep | 12,45 | 78 | ok |
| ink-3 / deep | 9,36 | 62 | ok |
| bloom / ground | 7,36 | 53 | nur große Wörter und Grafik |
| bloom-hi / ground | 9,50 | 66 | ok (Nicht-Fließtext) |
| on-bloom / bloom | 7,62 | 56 | ok (Button, 17 px fett) |
| bark / ground | 3,80 | 28 | ≥ 3:1 Grafik |

### Hell (Standard)

Warmes Fast-Weiß (Chroma ≤ 0,009, kein Creme-Grund). Rinde und Akzent werden dunkler statt heller: „hi“ heißt in beiden Themen „mehr Kontrast zur Fläche“.

| Rolle | Token | OKLCH | Hex |
|---|---|---|---|
| Fläche | `--bmd-ground` | 0.985 0.004 62 | #fcf9f7 |
| Fläche tief | `--bmd-deep` | 0.955 0.009 62 | #f5efea |
| Fläche erhöht | `--bmd-raised` | 1 0 0 | #ffffff |
| Text | `--bmd-ink` | 0.235 0.028 50 | #291a12 |
| Text zweit | `--bmd-ink-2` | 0.36 0.034 52 | #4c382d |
| Text dritt | `--bmd-ink-3` | 0.47 0.038 55 | #6c5547 |
| Trieb | `--bmd-bark` | 0.56 0.058 56 | #8f6c53 |
| Trieb hell | `--bmd-bark-hi` | 0.49 0.062 56 | #7c573d |
| Trennlinie | `--bmd-soil` | 0.875 0.02 60 | #e0d3c9 |
| Akzent | `--bmd-bloom` | 0.54 0.162 39 | #b94314 |
| Akzent hell | `--bmd-bloom-hi` | 0.47 0.142 39 | #99350d |
| Auf Akzent | `--bmd-on-bloom` | 0.985 0.008 60 | #fef9f5 |

Dazu in beiden Themen: `--bmd-veil` (Header, Fläche mit 0,9 Deckkraft), `--bmd-glow` (Lichtfleck im Hero, hell 0,1 · dunkel 0,16).

| Paar (hell) | WCAG | Lc |
|---|---|---|
| ink / ground · deep | 16,02 · 14,72 | 100 · 95 |
| ink-2 / ground · deep | 10,48 · 9,64 | 92 · 86 |
| ink-3 / ground · deep | 6,62 · 6,08 | 81 · 75 |
| bloom / ground · deep | 5,17 · 4,75 | 73 · 67 |
| bloom-hi / ground · deep | 6,98 · 6,42 | 81 · 76 |
| on-bloom / bloom | 5,18 | 78 |
| on-bloom / bloom-hi | 7,00 | 86 |
| bark / ground · deep | 4,51 · 4,15 | 70 · 64 |
| bark-hi / ground · deep | 6,09 · 5,60 | 78 · 73 |

## Type (locked)

| Rolle | Familie | Größe | Zeile | Tracking | Gewicht |
|---|---|---|---|---|---|
| display | Alegreya | `clamp(4.25rem, 6.4vw, 5.75rem)`; mobil `clamp(2.25rem, 10.8vw, 3.5rem)` | 0.98–1.0 | −0.022em | 500, zweite Zeile kursiv 400 |
| title | Alegreya | `clamp(2.25rem, 1.25rem + 3.4vw, 4.25rem)` | 1.04 | −0.018em | 500 |
| node 1 | Alegreya | 35 Einheiten | 1.1 | −0.012em | 600 |
| node 2 | Alegreya | 30 Einheiten | 1.1 | −0.006em | 500 |
| node 3 | Alegreya | 24 Einheiten | 1.1 | 0 | 500 |
| note / kicker | Alegreya kursiv | 1.0625–1.25rem | 1.3–1.45 | 0 | 400 |
| lede | Alegreya Sans | 1.1875rem | 1.55 | 0 | 400 |
| body | Alegreya Sans | 1.0625rem | 1.6 | 0 | 400 |
| meta | Alegreya Sans | 0.9375rem | 1.45 | 0 | 400 |
| source | System-Mono | 0.8125rem | 1.7 | 0 | 400 |

- Drei Familien, mehr nicht. Kontrast: kalligrafische Serife (Feder, läuft spitz aus wie der Trieb), humanistische Grotesk, Mono nur für Markdown.
- Lokal: `components/v2/fonts/*.woff2` (OFL, Subset Deutsch/Englisch, zusammen unter 40 KB, `fonts/subset.py`), `next/font/local`, `display: swap`, metrisch angepasster Fallback. Kein externer Request.
- Untergrenze 13 px. Titel `text-wrap: balance`, Absätze `pretty`. Zeilenlänge ≤ 34–40rem.
- Keine Versalien-Eyebrows. Der Abschnittsname ist eine kursive Randnotiz.

## Scales (locked)

| Skala | Wert |
|---|---|
| spacing | 4-px-Raster: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 |
| radius | **4 px**, einzig für die Primäraktion und den Fokusring. Sonst keine Flächen |
| shadow | keine |
| breakpoint | eine Layout-Schwelle: **73.75rem** (1180 px bei 16 px Browser-Schrift, 1475 px bei 20 px) (breite Map ↔ Gliederungs-Map). 640 px: Datei neben Map |
| container | 83rem, links 5rem Rinne für `#` und Stamm (ab 1180 px) |

## Raster (organisch statt Karten)

| Layout-Familie | Abschnitt | Aufbau |
|---|---|---|
| Krone | Hero | H1 und Aktionen oben, darunter Datei links, Map wächst nach rechts |
| Gabel | Anwendungsfälle | Die vier Reiter sind vier Äste. Der gewählte wächst weiter zur Map seiner Datei |
| Trieb | Vision | Ein Stamm von links nach rechts: heute → Pilot → vier Ranken. Wurzeln = Voraussetzungen (Trieb hell, Kragen 20 Einheiten, Boden-Linie Trieb 2 px, auch am Handy) |
| Beleg | Demo | Datei links, Aufnahme rechts, ein Trieb trägt die drei Belege ([demo.md](demo.md)) |
| Weggabel | Pfade | Ein Trieb mit drei Ansätzen, je Weg ein Link ([pfade.md](pfade.md)) |
| Äste je Stand | Verfügbarkeit | Drei Äste, dünner je weniger verfügbar ([verfuegbarkeit.md](verfuegbarkeit.md)) |
| Knoten am Stamm | FAQ | Kopf links, Fragen am Stamm ([faq.md](faq.md)) |
| Auslauf | Registrieren | Ein Trieb endet am Knopf ([registrieren.md](registrieren.md)) |
| Wurzelschicht | Footer | Boden-Linie, Wurzelkragen, vier Spalten ([footer.md](footer.md)) |

Verboten: Karten, Karten-Raster, gestrichelte Rahmen, Pill-Badges, nachgebaute App-Fenster, Schatten, zentrierte Textwände.

## Motion (locked)

| Regel | Wert |
|---|---|
| Kurve | `--bmd-grow: cubic-bezier(0.23, 1, 0.32, 1)` (starkes ease-out). Kein ease-in, kein Überschwingen |
| Wachstum | Maske läuft entlang der Mittellinie (`stroke-dashoffset`), vom Ursprung zur Spitze |
| Dauer | Stamm 560 ms · Äste 470 / 420 / 370 ms · Wort 320 ms · Blüte 460 ms · gesamt ≤ 1,8 s |
| Überlappung | Kind startet bei 55 % der Elterndauer, Geschwister +70 ms |
| Wort | Deckkraft 0 → 1 und 8 px in Wuchsrichtung |
| Blüte | `scale(.9)` + `rotate(-14deg)` + Deckkraft. Nie `scale(0)` |
| Auslöser | Hero beim Laden. Darunter beim ersten Sichtkontakt, einmal |
| Reiterwechsel | Klick/Tap: neuer Teilbaum wächst in ≤ 700 ms. **Tastatur: sofort, ohne Wachstum** |
| Hover/Fokus | nur Farbe, 150 ms. Hover nur bei `(hover: hover) and (pointer: fine)` |
| Druck | `scale(.96)`, 100 ms |
| Bewegt sich nie | H1, Absätze, Aktionen, Quelle, Header. Keine Schleife, kein Schwanken, keine Parallaxe |
| Reduced motion | Endbild sofort. Nur Farbwechsel bleiben |

## Voice

Bestehende Texte unverändert. Du-Form, sachlich. Aktionsverben bleiben („Demo ohne Konto testen“, „Desktop herunterladen“, „Jetzt registrieren“, „Roadmap ansehen“).

## Außerhalb des Systems (bewusst offen)

| Punkt | Stand |
|---|---|
| Agenten-Abschnitt innen (Titel, Schritte, Aktionen) | noch alte Sprache; nur die Hülle ist neu ([agenten.md](agenten.md)) |
| Nicht gerenderte Komponenten (Workflow, Feature-Raster, LLM-Wiki, Obsidian, Local-first, Desktop) | unverändert |
| Agenten-Szene | Sperrzone, unverändert |
| Gedankenstrich im Hero-Absatz | Text unverändert (Inhaltsregel) |
