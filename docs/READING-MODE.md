# Lesemodus (Ticket 54)

Der Lesemodus zeigt ein Dokument (bzw. den fokussierten Teilbaum) als ruhigen, zusammenhängenden Text.
Markdown bleibt die Quelle der Wahrheit: der Modus ist rein lesend und löst weder Speichern noch Sync noch
eine Yjs-Änderung aus. Moji dient nur als UX-Referenz.

## Verhalten

- Vierter Canvas-Modus `reading` neben `map | outline | presentation` (`CanvasMode` in `useMindMapStore.ts`,
  Umschalter `view-mode-reading` in `MindMapCanvas.tsx`, Ansicht `ReadingView.tsx`).
- Inhalt: Knotentitel als Überschriften nach Ebene, darunter der Markdown-Inhalt des Knotens; Text vor der
  ersten Überschrift (Preamble) steht am Anfang. Ohne Editor-Leiste, Knoten-Aktionen und Eingabefelder.
- Rendering (`MarkdownReader.tsx`): ein schmaler Renderer auf Basis von `unified` + `remark-parse` + `remark-gfm`
  (Überschriften, Absätze, Links, Listen auch verschachtelt, Aufgabenlisten, Tabellen, Zitate, Codeblöcke, Bilder).
  Es entstehen nur React-Elemente, nie `innerHTML`; rohes HTML wird als Text angezeigt, HTML-Kommentare bleiben
  unsichtbar. Der NodeEditor (MDXEditor) wird bewusst nicht mehrfach als `readOnly`-Instanz eingebunden: ein
  Dokument hat viele Knoten, und je Knoten ein Editor wäre schwer und kaum testbar.
- Sicherheit (`utils/safe-url.ts`): Links werden nur für `http`, `https` und `mailto` erzeugt, externe mit
  `target="_blank"` und `rel="noreferrer noopener"`. Alles andere (`javascript:`, `data:`, `file:`, relative und
  protokoll-relative Ziele) bleibt lesbarer Text. Bilder: `http(s)`, eingebettete Rasterbilder
  (`data:image/png|jpeg|gif|webp|avif`) und relative Pfade, kein SVG-`data:`.
- Mermaid: ```` ```mermaid ````-Blöcke sind gewöhnliche Codeblöcke mit sichtbarer Sprachbezeichnung `mermaid`.
  Es gibt keinen Diagramm-Renderer und kein Mermaid-Paket; ein Diagramm-Rendering wäre ein eigenes Ticket.
- „Zurück zur Map“ (`reading-back`, immer sichtbar, ≥ 44 px hoch) stellt vorherigen Modus, Auswahl, Fokus,
  Editor-Panel und die Map-Position (Pan/Zoom) wieder her. Wurde das Dokument im Lesemodus gewechselt
  (Tab, Link, Dateibrowser), kehrt nur der Modus zurück, die Auswahl gilt für das neue Dokument; beim Rückweg zum
  ursprünglichen Dokument kommt dessen Auswahl wieder. Ein Dokumentwechsel bleibt im Lesemodus. Lokale Ordner
  und Cloud-Dokumente verhalten sich gleich, weil der Modus nur im Store lebt.
- Tastatur: `Alt+L` betritt und verlässt den Lesemodus (auch in Hilfe und Befehlspalette „Lesemodus“), `Esc`
  verlässt ihn, solange kein Dialog, Hilfe oder Textfeld den Fokus hat. Pfeiltasten und Bild auf/ab scrollen den
  Text (die Lesefläche trägt den Fokus); die Knoten-Shortcuts (Pfeile, Tab, Enter, Entf, R, Undo/Redo, Kopieren/Einfügen,
  Cmd/Strg+Enter) tun im Lesemodus nichts.
- Layout: Textspalte höchstens 70ch, Tabellen und Codeblöcke scrollen in sich (und sind per Tab erreichbar),
  Bilder passen in die Spalte, lange Wörter und URLs umbrechen. Farben nur über die Theme-Variablen
  (`--color-surface`, `--color-ink`, `--color-border`, `--color-bloom` …), also in Hell und Dunkel.

## Tests

| Ebene | Datei |
| --- | --- |
| Store (Moduswechsel, Rückweg, Dokumentwechsel, Quelle unverändert) | `packages/ui/src/hooks/useMindMapStore.reading-mode.test.ts` |
| Tastatur (Esc, Alt+L, keine Hintergrund-Shortcuts) | `packages/ui/src/hooks/useKeyboardShortcuts.reading-mode.test.tsx` |
| Ansicht, Zurück-Knopf, kein Request beim Betreten/Verlassen | `packages/ui/src/components/ReadingView.test.tsx` |
| Renderer (alle Blocktypen, Mermaid, Sicherheit) | `packages/ui/src/components/MarkdownReader.test.tsx`, `packages/ui/src/utils/safe-url.test.ts` |
| Playwright `@t54` (K1–K5, Tastatur, Mobil 390 px, Theme) | `apps/app/e2e/reading-mode.spec.ts` |

## Manuelle QA

Nur, was die Tests nicht abdecken. Die Playwright-Fälle laufen in Desktop-Chrome gegen Mock-API bzw. Ordner-Mock;
das Dev-System kann keine Dokumente anlegen.

1. **Cloud-Dokument (echter Server).** Ein Cloud-Dokument mit Überschriften, Tabelle, Codeblock (`mermaid`), Bild
   und Link öffnen, Lesemodus betreten und verlassen. Erwartung: Darstellung wie im lokalen Ordner, in den
   Server-Logs kein `PUT` und kein Sync-Update durch das Betreten/Verlassen; zwei Browser auf demselben Dokument:
   Eingaben im einen erscheinen im Lesetext des anderen (Lesen folgt dem Dokument), das Betreten verändert beim
   anderen nichts.
2. **iPhone/iPad (Safari) und Android (Chrome), 390 px und Querformat.** Kein horizontales Scrollen der Seite, Tabelle
   und Codeblock lassen sich mit einem Finger seitlich wischen, ohne die Seite zu bewegen; „Zurück zur Map“ und der
   Umschalter sind mit dem Daumen sicher zu treffen; die Bildschirmtastatur erscheint nirgends; Wischen scrollt
   den Text weich; nach „Zurück zur Map“ steht die Map wieder an derselben Stelle.
3. **Desktop-App (Electrobun).** Ein externer Link in der Leseansicht öffnet im Systembrowser (Ereignis
   `bloommd:open-url`), nicht im Webview. `Alt+L` funktioniert mit macOS-Option-Taste (die Taste liefert `¬`; geprüft
   wird über den Tastencode).
4. **Mobile-App (Capacitor).** Lesemodus über Befehlspalette/Umschalter betreten; die Android-Zurück-Geste verlässt
   die App nicht unbeabsichtigt (Verhalten dokumentieren, sie ist nicht an den Lesemodus gebunden).
5. **Bildschirmleser (VoiceOver, NVDA).** Lesefläche wird als Bereich „Lesemodus: Dokument“ angesagt, Überschriften
   sind per Überschriften-Navigation erreichbar, Tabellen mit Spaltenköpfen, Codeblöcke mit Sprache, Aufgabenlisten
   als deaktivierte Kontrollkästchen mit „Erledigt“/„Offen“.
6. **Sehen in Hell und Dunkel.** Kontrast von Text, Links, Code-Hintergrund und Tabellenlinien in beiden Themes; der
   Fokusrahmen (Lesefläche, Link, Tabelle, Codeblock, Zurück) ist in beiden sichtbar.
7. **Sehr großes Dokument** (≈ 1000 Knoten): Betreten des Lesemodus fühlt sich nicht hängend an, Scrollen bleibt flüssig.
   Bekannte Grenze: alle Knoten werden gerendert, es gibt keine Virtualisierung.
8. **Bilder.** Relative Bildpfade eines lokalen Ordners werden nicht aufgelöst (wie im NodeEditor); externe Bilder werden ohne
   Referrer geladen. Einmal prüfen, dass ein kaputtes Bild den Text nicht verschiebt.
