# BloomMD Restcheck · 25.11.2026

Basis: origin/main 3048b8ab60683f4434ab9dd7b1ea681d1ab2b44a (#447 bereits gemergt). Kein Release/Deploy/Merge ausgeführt.

## Geht mit Release live (E)

Live /llms.txt 404, unveränderter main-Produktionsbuild 200; alle acht Kernlinks 200. Explizite zwölf KI-Bot-Gruppen in robots.txt statt nur Wildcard. Alle zwölf Bot-UAs erhalten live/lokal HTTP 200. WebSite + stabile Software-ID und iOS/Android im Software-Schema; Download/Obsidian/Docs-Sprachalternativen. Live und lokal liefern sichtbares HTML ohne JavaScript.

## Kleiner Restfix

/demo und /templates hatten in beiden Sprachen keine hreflang-Links. Zwei Metadata-Ergänzungen liefern jetzt de/en/x-default auf allen vier Varianten. Keine Claims oder Texte geändert. Vollständiges lokales Sitemap-Inventar: 120 URLs, alle 200, jeweils eine H1, Canonicals korrekt (Root-Slash normalisiert), Social-Bild vorhanden; jetzt keine fehlenden Sprachalternativen. Bild per sips: 1200×630. Sitemap: 84 lastmod-Werte, 36 statische/Docs-URLs ohne belegtes Änderungsdatum.

## Offene Restpunkte

- 31 Titel >60 Zeichen; eine Description >155 (/news/obsidian-plugin-070: 159). Vollständige Liste im JSON. Redaktionelle Kürzungen separat, kein blindes Abschneiden.
- llms-full.txt fehlt live und lokal (404). Optionaler buildgenerierter Dokumentationsspiegel, keine Voraussetzung für Indexierung; nicht als Schnellfix mit ungeprüfter Inhaltsauswahl gebaut.
- Organization/Person/sameAs benötigen bestätigte Betreiber-/Profilwerte. Keine Werte erfunden. Begrenzter Schema.org-Vokabularcheck: 13 typisierte Knoten, 0 Fehler; kein Rich-Results-Nachweis.
- GSC/Bing-Verifizierung, Feld-CWV/INP, KI-Sichtbarkeit und externe Profilkonsistenz N. Keine Null-Prozent-Sichtbarkeit behauptet.
- Lokal mobil Performance 89, desktop 100. Kein Performance-Fix aus lokaler Messung abgeleitet: Live mobil laut Auftrag bereits 98. Desktop Accessibility 99, mobil 100; Details im JSON.

## Tests / Reproduktion

- bun install --frozen-lockfile; bun run build:marketing: erfolgreich, 126 statische Seiten. Umgebung Node 26.7.0 (abweichend vom engines-Ziel 22), Bun vorhanden; Node-22-Reproduktion N.
- bun run --cwd apps/marketing test: 570 pass, 0 fail, 1523 Assertions, vor und nach Änderung.
- next start auf localhost:3339 (Basis) und :3340 (Finalbuild).
- python3 docs/seo/audit.py URL: live und lokal; python3 docs/seo/schema-check.py audit-rest/local.jsonl audit-rest/vocabulary.json: 13 Knoten, 0 Fehler.
- Lighthouse :3340, --chrome-flags=--headless --only-categories=performance,accessibility,best-practices,seo, zusätzlich --preset=desktop. Final mobil 89/100/100/100, desktop 100/99/100/100. Basis lokal 88/100/100/100 und 100/99/100/100; Lab-Schwankung, keine behauptete Beschleunigung. Erster Trace-Versuch NO_NAVSTART, Wiederholung erfolgreich.
- Alle 120 Sitemap-URLs per HTTP und HTMLParser geprüft; kompakte Ausgabe neben diesem Bericht. Rohdaten/Logs in audit-rest/ im Worktree (nicht eingecheckt).

## Score / Grenzen

Konservative bestehende Rubrik: SEO 32→33/100 (A12 B10→11 C8 D0 E2), GEO 32→32/100. Das ist ein belegter Teil-Audit, kein vollständiger Qualitätswert. Live-vor-#447 dokumentiert: SEO26/GEO17; nach Release erwartete belegte Basis SEO32/GEO32, nach diesem Fix SEO33/GEO32. Lighthouse SEO jeweils100 ist eine andere Skala.

T technisch geprüft; unabhängiges R und H offen. Kein vollständiger interner Linkchecker, Redirectmatrix, externer interaktiver Schema-Validator oder Produktions-CMS-Abgleich. N bleibt ausdrücklich N.
