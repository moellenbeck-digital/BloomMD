# Abschnitt Demo `#produkt-demo` (bindet an `DESIGN.md`)

| Punkt | Regel |
|---|---|
| Nutzer will | sehen, dass ein gezogener Ast die Markdown-Datei ändert |
| Layout-Familie | Beleg: Satzspalte mit der Datei links, echte Aufnahme rechts, darunter ein Trieb, auf dem die drei Belege sitzen |
| Verboten hier | Fensterrahmen, Karten, Häkchen-Pillen, Schatten |
| Titel | Alegreya, eine Zeile ab 73.75rem, `clamp(2.25rem, 1.6rem + 1.6vw, 3rem)`. Er bleibt im ersten Bildschirm 1440×900 (LCP-Element der Seite) und bewegt sich nie |
| Datei | Mono wie im Hero, Dateiname + Formatwort, `#`-Zeilen in `ink` |
| Aufnahme | ohne Rahmen, Radius 4 px, 16:9 fest (kein Layout-Sprung) |
| Pause | Textknopf ≥ 44 px unter der Aufnahme: „Aufnahme anhalten“ / „Aufnahme abspielen“ |
| Trieb | spitz zulaufend (14 → 3 px), Akzent. Ab 640 px waagerecht, darunter senkrecht |
| Motion | beim ersten Sichtkontakt: Trieb wächst (nur `transform`, 560 ms), Wörter folgen (Deckkraft + 8 px) |
| Reduced motion | Aufnahme startet nicht und steht auf dem letzten Bild; Trieb sofort fertig |
| Ohne JavaScript | Aufnahme mit `autoPlay` und Browser-Bedienelementen, kein eigener Knopf; Trieb fertig |
| Texte | unverändert |
