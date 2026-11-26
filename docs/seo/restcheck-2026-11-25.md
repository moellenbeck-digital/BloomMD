# BloomMD Restcheck · 25.11.2026

Basis: origin/main 3048b8ab60683f4434ab9dd7b1ea681d1ab2b44a (#447 bereits gemergt). Kein Release/Deploy/Merge ausgeführt.

## Geht mit Release live (E)

Belege: `restcheck-2026-11-25-belege.json` (E, 25.11.2026 ab 23:56 CET, live und lokaler Build).

| Aussage | Live heute | Lokaler Build | Rang |
|---|---|---|---|
| `/llms.txt` | 404 | 200, alle 8 Kernlinks 200 | E |
| 12 KI-Bot-UAs auf `/` | 12× 200 | 12× 200 | E |
| robots.txt | nur `User-agent: *` | zusätzlich 12 benannte Bot-Gruppen | E (Ausgabe unten) |
| Schema auf `/` | SoftwareApplication ohne ID; Web, macOS, Linux | WebSite + Software-ID; zusätzlich iOS, Android | E |
| hreflang Download/Obsidian/Docs | 0 je Variante | 3 je Variante | E |
| H1 im HTML ohne JavaScript (curl) | je HTML-Seite 1 | je HTML-Seite 1 | E (nur H1 gezählt) |

robots.txt, gekürzt: live `User-agent: * / Allow: / / Disallow: …`; lokal `User-agent: *`, `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`, `Applebot-Extended`, `Bingbot`, `CCBot`, dann `Allow: /`.

Bot-Zugriffe sind HTTP-Abrufe mit gesetztem User-Agent. Sie belegen keinen Besuch echter Bots.

## Kleiner Restfix

/demo und /templates hatten in beiden Sprachen keine hreflang-Links. Zwei Metadata-Ergänzungen liefern jetzt de/en/x-default auf allen vier Varianten. Keine Claims oder Texte geändert. Vollständiges lokales Sitemap-Inventar: 120 URLs, alle 200, jeweils eine H1, Canonicals korrekt (Root-Slash normalisiert, B), Social-Bild vorhanden (B); jetzt keine fehlenden Sprachalternativen. Bild per sips: 1200×630. Sitemap: 84 lastmod-Werte, 36 statische/Docs-URLs ohne belegtes Änderungsdatum.

## Offene Restpunkte

- 31 Titel >60 Zeichen; eine Description >155 (/news/obsidian-plugin-070: 159). Vollständige Liste im JSON. Redaktionelle Kürzungen separat, kein blindes Abschneiden.
- Folgeaufgabe (nicht gebaut): `/templates/[slug]` hat nur einen Canonical, kein hreflang, und steht nicht in der Sitemap (6 Vorlagen, je de/en).
- llms-full.txt fehlt live und lokal (404). Optionaler buildgenerierter Dokumentationsspiegel, keine Voraussetzung für Indexierung; nicht als Schnellfix mit ungeprüfter Inhaltsauswahl gebaut.
- Organization/Person/sameAs benötigen bestätigte Betreiber-/Profilwerte. Keine Werte erfunden. Begrenzter Schema.org-Vokabularcheck: 13 typisierte Knoten, 0 Fehler; kein Rich-Results-Nachweis.
- GSC/Bing-Verifizierung, Feld-CWV/INP, KI-Sichtbarkeit und externe Profilkonsistenz N. Keine Null-Prozent-Sichtbarkeit behauptet.
- Lokal mobil Performance 89, desktop 100. Kein Performance-Fix aus lokaler Messung abgeleitet: Live mobil laut Auftrag bereits 98 (B). Desktop Accessibility 99, mobil 100; Details im JSON.

## Tests / Reproduktion

E (Ausgabe im Beleg-JSON oder hier):

- CI-Lauf [45727905024](https://github.com/moellenbeck-digital/BloomMD/actions/runs/45727905024) am Commit `f68a0e4`: `changes`, `verify`, `full-e2e` pass; `release-artifacts` übersprungen.
- CI, Job `verify`, Marketing-Tests (Bun 1.4.4): `574 pass · 0 fail · 1527 expect() calls · 35 files`.
- CI, Job `verify`, Marketing-Build (Node 22.23.4): `Generating static pages (126/126)`.
- Lokal am selben Teststand (26.11.2026), Bun 1.4.4 und 1.4.5: `bun test ./apps/marketing/src/lib/browser-workspace.test.ts ./apps/marketing/src/app/language-alternates.test.ts` je `22 pass · 0 fail`. Ohne den Testfix (Bun 1.4.4): `18 pass · 1 fail · 1 error`, `ReferenceError: document is not defined`. Ursache: `browser-workspace.test.ts` ließ `globalThis.window` gesetzt.
- Lokal `bun run --cwd apps/marketing test`: `574 pass · 0 fail · 1527 expect() calls · 35 files`. Darin 4 neue hreflang-Tests (`src/app/language-alternates.test.ts`); ohne die zwei Metadata-Zeilen `0 pass · 4 fail`.
- `bun run build:marketing`: Exit 0, `Generating static pages (126/126)`. Lokal Node 26.7.0 statt engines-Ziel 22; Node-22-Build siehe CI oben.
- Schema-Check: `typed_nodes: 13, errors: []` (nur Startseiten und Stichprobe aus `audit.py`; Vokabular-Hash im JSON).
- `sips` auf `apps/marketing/public/og/bloommd-og-banner.png`: `pixelWidth: 1200, pixelHeight: 630`.
- `/demo` und `/templates`, je de und en, auf `next start :3341`: eigener Canonical plus hreflang `de`, `en`, `x-default`.
- Sitemap lokal: `loc 120 · lastmod 84 · /templates/<slug> 0`.
- Sitemap-HTTP-Inventar (früherer Lauf): `restcheck-2026-11-25.json`, 120 Seiten, Status nur 200, `h1_not_one: []`, `missing_hreflang: []`. Lighthouse-Werte stehen im selben JSON.

B (berichtet, kein Rohbeleg im Repo):

- `bun install --frozen-lockfile` erfolgreich.
- Früherer Lauf vor der hreflang-Änderung und danach: je 570 pass, 0 fail, 1523 Assertions.
- Canonicals aller 120 Sitemap-URLs korrekt (Root-Slash normalisiert); Social-Bild je Seite vorhanden.
- Lighthouse-Aufruf: `:3340`, `--chrome-flags=--headless --only-categories=performance,accessibility,best-practices,seo`, Desktop mit `--preset=desktop`. Erster Trace-Versuch NO_NAVSTART, Wiederholung erfolgreich. Basiswerte lokal: mobil 88/100/100/100, Desktop 100/99/100/100.

Rohlogs liegen nur lokal in `audit-rest/` im Worktree (nicht eingecheckt).

## Score / Grenzen

Scores sind eine Einschätzung des Autors (B).

Konservative bestehende Rubrik: SEO 32→33/100 (A12 B10→11 C8 D0 E2), GEO 32→32/100. Das ist ein belegter Teil-Audit, kein vollständiger Qualitätswert. Live-vor-#447 dokumentiert: SEO26/GEO17; nach Release erwartete belegte Basis SEO32/GEO32, nach diesem Fix SEO33/GEO32. Lighthouse SEO jeweils100 ist eine andere Skala.

T technisch geprüft; unabhängiges R und H offen. Kein vollständiger interner Linkchecker, Redirectmatrix, externer interaktiver Schema-Validator oder Produktions-CMS-Abgleich. N bleibt ausdrücklich N.
