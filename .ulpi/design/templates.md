# Abschnitt Vorlagen `#templates` (bindet an `DESIGN.md`)

| Punkt | Regel |
|---|---|
| Nutzer will | eine Vorlage finden und ohne Konto als Map öffnen |
| Layout-Familie | Ableger: Kopf links, rechts ein Stamm von oben nach unten mit drei Ablegern. Unter 1180 px Kopf über dem Stamm |
| Verboten hier | Karten, Karten-Raster, Kategorie-Pillen, Zier-Icons, Schatten |
| Fläche | `--bmd-deep` (Rhythmus zwischen den Abschnitten) |
| Ableger | spitz zulaufend, eine Biegung vom Stamm unter den Titel. Der erste trägt den Akzent. Nur CSS (kein zusätzliches HTML) |
| Titel je Vorlage | `h3`, Alegreya 1,75 rem. Kategorie als kursive Randnotiz darüber |
| Link | „In der Demo öffnen“ auf kurzem Trieb, ≥ 44 px. „Alle Templates“ als Zweitaktion (`twig`) im Kopf |
| Hover/Fokus | nur Farbe, 150 ms; Fokusring 2 px `bloom-hi` |
| Motion | beim ersten Sichtkontakt: Stamm, dann Ableger (nur `transform`), Inhalt folgt (Deckkraft + 8 px) |
| Reduced motion / ohne JavaScript | Endbild |
| Texte | unverändert; weiterhin drei `article` |
