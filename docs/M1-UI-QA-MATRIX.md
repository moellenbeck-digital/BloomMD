# M1 UI-QA-Testmatrix

Stand: 12. August 2026  
Branch: `feat/m1-closed-beta`  
Ergaenzt: [M1 Testplan](M1-TESTPLAN.md)

## Ziel

Diese Matrix prueft alle UI-Funktionen, die fuer M1 relevant sind. Sie ist keine Ersatzliste fuer
den Release-Testplan, sondern dessen detaillierte UI-Abdeckung. Jeder Fall muss bei einer
M1-Freigabe entweder automatisiert laufen, manuell mit Evidence dokumentiert sein oder als Gap im
Project Board nachverfolgt werden.

Nicht im Scope: Mobile-App-Support, mobiler Obsidian-Support, Public-SaaS-Launch, Billing,
Marketplace, VS-Code-Erweiterung und autonome Hosted Agents.

## Status-Legende

| Status | Bedeutung |
|---|---|
| `Auto` | In Unit-, Integration- oder Playwright-E2E-Suite abgedeckt |
| `Manual` | Muss pro Plattform manuell ausgefuehrt und belegt werden |
| `Hybrid` | Automatischer Kern vorhanden, nativer/visueller Teil manuell |
| `Gap` | Noch nicht ausreichend abgedeckt, Issue/PR-Kommentar erforderlich |

## Evidence-Regel

Evidence ist verbindlich und wird als PR-Kommentar, Issue-Kommentar oder Testlauf-Artefakt
gespeichert. Ein Evidence-Eintrag enthaelt:

- Datum, Tester, OS, Browser oder Desktop-Artefakt
- Commit SHA oder Build-Artefakt
- Test-IDs
- Ergebnis `pass`, `fail`, `blocked` oder `not-run`
- Screenshot, Video, Log oder API-/Datei-Auszug bei allem ausser `pass`
- Folge-Issue bei Rework

## Standard-Testdaten

### Workspace `m1-ui-smoke`

```text
m1-ui-smoke/
  overview.md
  product/roadmap.md
  research/links.md
  empty-folder/
  assets/diagram.png
```

### `overview.md`

```markdown
---
title: M1 UI Smoke
id: m1-ui-smoke
tags: [m1, qa]
---

# M1 UI Smoke <!-- bloommd:id=root -->

Intro mit [Website](https://example.com) und [[product/roadmap.md|Roadmap]].

## Canvas <!-- bloommd:id=canvas -->

Node fuer Toolbar, Drag, Focus und Saved Views.

### Child A <!-- bloommd:id=child-a -->

Inhalt A.

### Child B <!-- bloommd:id=child-b -->

Inhalt B.

## Editor <!-- bloommd:id=editor -->

Text fuer Content-Edits.

## Task <!-- bloommd:id=task -->

Status-Node fuer Task Toggle.
```

### `product/roadmap.md`

```markdown
---
title: Roadmap
id: roadmap
---

# Roadmap <!-- bloommd:id=roadmap-root -->

## M1 <!-- bloommd:id=roadmap-m1 -->

Refs: [[../overview.md#canvas|Canvas]].
```

### `research/links.md`

```markdown
---
title: Link Tests
id: link-tests
---

# Link Tests <!-- bloommd:id=links-root -->

Remote: https://example.com/reference
Broken: [[missing.md|Missing]]
Asset: ![](../assets/diagram.png)
```

## Desktop: Start, Shell und Grundnavigation

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| DUI-001 | Stable-App startet | `stable-macos-arm64-BloomMD.dmg` | 1. DMG oeffnen.<br>2. Direkten Start aus DMG pruefen.<br>3. App nach `Programme` kopieren und starten.<br>4. 5 Sekunden warten.<br>5. Prozess und Fenster pruefen. | Start aus DMG zeigt einen klaren Installationshinweis. Start aus `Programme` zeigt Hauptfenster, Splash verschwindet, Toolbar und Canvas laden. Keine zweite unbedienbare Instanz. | Gatekeeper-Hinweis, erster Self-Extractor-Lauf, leerer Workspace. | Hybrid | Screenshot Hauptfenster, `pgrep`, optional Log |
| DUI-002 | Menueleiste und Clipboard | geoeffnete App | 1. Menues `BloomMD`, `Bearbeiten`, `Fenster` oeffnen.<br>2. Textfeld fokussieren.<br>3. `Cmd+C`, `Cmd+V`, `Cmd+Z` testen. | Standard-macOS-Shortcuts funktionieren in Dialogen und Editor. Menues wirken nativ. | Fokus in MDXEditor, Dialog offen, deaktivierter Button. | Auto | Desktop Menu Source-Test |
| DUI-003 | Header-Navigation | `overview.md` | 1. App laden.<br>2. Datei-Browser Button anklicken.<br>3. Titelbereich, Toolbar, Remote/Sync-Anzeige pruefen. | Header bleibt stabil, Titel ist gekuerzt statt ueberlappend, Buttons sind als Icons erkennbar. | 1280x800, schmales Fenster, langer Dokumenttitel. | Auto | Desktop Mainview Contract-Test plus stabile Selektoren |
| DUI-004 | Loading State | kuenstlich langsamer Start oder frischer Build | 1. App starten.<br>2. Direkt nach Splash beobachten. | Loading ist ruhig, zentriert, ohne Layoutsprung in falsche Inhalte. | Remote reconnect langsam, keine Dateien. | Auto | Desktop Mainview Contract-Test fuer Loading-Shell |

## Desktop: Lokale Dateien, Ordner und Empty States

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| DUI-010 | Default-Workspace laden | `~/bloommd` mit mindestens einer `.md` | 1. Settings auf Default setzen.<br>2. App starten. | Canvas rendert einen Workspace-Root; alle rekursiv gefundenen Markdown-Dateien erscheinen als Datei-Nodes, darunter ihre Heading-Baeume; Datei-Liste ist konsistent. | Kein `~/bloommd`, nur Unterordner, defekte Frontmatter, Workspace mit Crosslinks. | Auto | Desktop E2E-State Contract fuer Initial Load mit `workspaceMode` |
| DUI-011 | Ordner wechseln mit Dateien | `m1-ui-smoke` | 1. Sidebar oeffnen.<br>2. `Ordner wechseln`.<br>3. `m1-ui-smoke` waehlen. | Settings `localDir` wird aktualisiert, Liste zeigt nur Testworkspace, Canvas rendert die Workspace-Mindmap mit Folder-, Datei- und Heading-Nodes. | Dialog liefert leere/malformed Selection, Pfad ist keine Directory, Unterordner mit `.md`. | Hybrid | Automatisch: Desktop `dialog-selection.test.ts` und Workspace-State; manuell: Screenshot |
| DUI-012 | Ordnerwechsel abbrechen | beliebiger Workspace | 1. Sidebar oeffnen.<br>2. Dialog starten.<br>3. Abbrechen. | App bleibt stabil, aktiver Workspace und Dokument bleiben unveraendert. Keine Fehlermeldung fuer Nutzer. | Abbruch nach mehrfachem Oeffnen, Remote-Modus. | Auto | Desktop Dialog-Selection und Mainview No-op Contract |
| DUI-013 | Leerer Ordner | `empty-folder/` | 1. `bloommd open empty-folder` ausfuehren.<br>2. App aktivieren. | Kein alter Canvas-Inhalt bleibt stehen. Empty-State zeigt neue Datei, Import und Ordnerwechsel als klare Aktionen. | Direkt nach App-Start, Wechsel aus Remote-Modus, leerer Ordner mit versteckten Dateien. | Hybrid | Screenshot Empty-State, Settings-Auszug |
| DUI-014 | Neue Markdown-Datei anlegen | Empty-State oder Header `Neu` | 1. `Markdown anlegen` oder Toolbar-New klicken.<br>2. Namen vergeben, optional Ordner waehlen.<br>3. Datei oeffnen. | Datei erscheint sofort in Liste und Canvas, Root ist selektiert, keine Layoutspruenge. | Name ohne `.md`, existierender Name, verschachtelter Ordner. | Hybrid | Automatisch: Web E2E fuer Node-Create; Desktop manuell |
| DUI-015 | Ordner aus App anlegen | `product/research` | 1. Header `+ Ordner`.<br>2. verschachtelten Pfad eingeben.<br>3. Dialog erneut oeffnen. | Ordner erscheint als Auswahl; Pfad wird normalisiert; keine Traversal-Pfade akzeptiert. | `../evil`, absoluter Pfad, Umlaute, Leerzeichen. | Hybrid | Automatisch: Core `fileStore.test.ts`; Desktop Screenshot |
| DUI-016 | Import Markdown | externe `.md` | 1. Import klicken.<br>2. externe Markdown-Datei waehlen. | Datei wird in Workspace geschrieben und geladen; kein Upload im lokalen Modus. | Nicht-Markdown, gleichnamige Datei, sehr grosse Datei. | Auto | Desktop Import Contract plus Web-E2E Import |
| DUI-017 | Export Markdown | `overview.md` | 1. Export klicken.<br>2. Datei speichern/Download pruefen. | Export enthaelt aktuellen serialisierten Stand, Dateiname ist nachvollziehbar. | Ungespeicherte Aenderungen, Sonderzeichen im Titel. | Auto | Desktop Export Contract plus Web-E2E Export |
| DUI-018 | File-Watcher externe Aenderung | `overview.md` | 1. Aktive Datei extern um Heading erweitern.<br>2. Auf Watcher warten. | Canvas aktualisiert aktive Datei, Sidebar bleibt stabil, kein falscher Suffix-Match. | gleicher Dateiname in Unterordner, Windows-Separators, schneller Schreibvorgang. | Hybrid | Automatisch: `file-change.test.ts`; manuell: Screenshot |
| DUI-019 | Externe Datei anlegen | neuer `added.md` | 1. Datei im aktiven Ordner extern anlegen.<br>2. Sidebar oeffnen. | Datei erscheint nach Watcher oder Reload. | Unterordner, Non-Markdown, Datei wird noch geschrieben. | Auto | Desktop Watcher Refresh Contract |

## Desktop: OS-Handoff und CLI

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| DUI-030 | `bloommd open <ordner>` | `m1-ui-smoke` | 1. App ggf. starten.<br>2. `bloommd open m1-ui-smoke` ausfuehren. | Native App oeffnet den Ordner als Workspace-Root; Datei-Nodes, Unterordner, Heading-Baeume und Crosslink-Edges sind im Canvas sichtbar. | App laeuft schon, App laeuft nicht, Pfad mit Leerzeichen, tiefe Unterordner. | Auto | CLI Dry-Run plus Desktop E2E-State mit `workspaceMode` und Reference-Edges |
| DUI-031 | `bloommd open <datei.md>` | `product/roadmap.md` | 1. `bloommd open product/roadmap.md` ausfuehren. | Workspace wechselt auf Parent-Folder und laedt exakt die Datei. | `.markdown`, Non-Markdown, nicht existierende Datei. | Auto | CLI Dry-Run plus Desktop E2E-State |
| DUI-032 | Finder-Datei-Handoff | `overview.md` | 1. Finder `Oeffnen mit BloomMD` oder `open -a BloomMD.app overview.md`.<br>2. App aktivieren. | Datei wird geladen, kein Import in `~/bloommd`, keine zweite tote Instanz. | App schon offen mit anderem Workspace, Dateiname mit Umlauten. | Manual | Screenshot und Settings |
| DUI-033 | URL-Scheme ablehnen | `bloommd://open?path=/etc/passwd` | 1. URL oeffnen.<br>2. App beobachten. | Nicht-Markdown-Datei wird verworfen, Workspace bleibt unveraendert. | riesige URL, Control-Characters, falsches Scheme. | Auto | Desktop external-file Unit-Tests |
| DUI-034 | Windows CLI-Handoff | `C:\Users\<user>\Documents\BloomMD Smoke` | 1. Windows-Build installieren.<br>2. `bloommd open .` aus PowerShell starten. | URL-Handler oder dokumentierter Installer-Gap; Pfade mit Leerzeichen funktionieren. | SmartScreen, fehlender PATH, `cmd /c start` quoting. | Manual | Windows Screenshot und CLI-Ausgabe |

## Desktop und Web: Canvas

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| CUI-001 | Map-Ansicht rendert Hierarchie | `overview.md` | 1. Dokument oeffnen.<br>2. Root, `Canvas`, `Editor`, `Task`, Child A/B pruefen. | Knoten sind lesbar, Linien verbinden korrekt, Mini-Map sichtbar, keine Ueberlappungen im Startviewport. | tiefe Heading-Level, keine Headings, sehr langer Titel. | Auto | Web-E2E Node/Hierarchy plus Visual Suite |
| CUI-002 | Node-Auswahl | `overview.md` | 1. Root klicken.<br>2. Child klicken.<br>3. Pane klicken. | Ausgewaehlter Node hat sichtbaren Fokus/Border, Toolbar erscheint nur passend, Pane-Clear schliesst Auswahl nachvollziehbar. | Tastaturfokus, Remote-Presence-Dots, schneller Dokumentwechsel. | Hybrid | Web-E2E fuer Auswahl/Toolbar; Pane-Clear visuell offen |
| CUI-003 | Node Action Toolbar | `overview.md` | 1. Node auswaehlen.<br>2. Add Child, Add Sibling, Edit, Open Resource pruefen. | Toolbar bleibt am Node, Buttons sind Icons mit Tooltip/Label, Aktionen sind nicht ueberlappend. | Root hat kein Sibling, Portal/Web-Node mit Ressource, schmaler Viewport. | Auto | Web-E2E Toolbar-Buttons plus Visual Suite |
| CUI-004 | Add Child | Root oder `Canvas` | 1. Node waehlen.<br>2. Add Child. | Neuer Node erscheint als Kind, Layout bleibt stabil, Editor-Fokus ist sinnvoll. | Heading-Level 6, Undo danach, Remote verbunden. | Auto | `auth-shortcuts.spec.ts` plus Core Yjs-Tests |
| CUI-005 | Add Sibling | `Child A` | 1. `Child A` waehlen.<br>2. Add Sibling. | Neuer Node hat gleiche Ebene, Reihenfolge ist nachvollziehbar. | Root darf keinen Sibling haben, letzter Sibling. | Auto | `canvas selection` E2E |
| CUI-006 | Drag before/inside/after | `Child A`, `Child B`, `Editor` | 1. Node ziehen.<br>2. Drop-Indikatoren before/inside/after beobachten.<br>3. Drop ausfuehren. | Drop-Ziel wird klar visualisiert; Markdown-Hierarchie aendert sich korrekt; kein Datenverlust. | Zyklus, Level > 6, Touchpad, abgebrochener Drag. | Hybrid | Automatisch: Drop-Zonen und Markdown-Hierarchie; visuell: Drag-Indikator per Screenshot |
| CUI-007 | Edge Mode `Structure` | `overview.md` | 1. Edge-Select auf Structure. | Nur Hierarchie-Edges sichtbar, Graph bleibt ruhig. | Dokument mit Links und Backlinks. | Auto | Web-E2E Edge-Relationen plus Visual Suite |
| CUI-008 | Edge Mode `Links` | `overview.md`, `roadmap.md` | 1. Edge-Select auf Links. | Markdown-/Wiki-Links werden als Beziehungen sichtbar; Hierarchie tritt zurueck. | Broken Links, Self Links, doppelte Links. | Auto | Web-E2E Edge-Relationen plus Core Graph-Tests |
| CUI-009 | Edge Mode `Backlinks` | `roadmap.md` | 1. Node mit Backlink waehlen.<br>2. Backlinks Mode aktivieren. | Nur eingehende Links zur Auswahl werden sichtbar. | Keine Auswahl, keine Backlinks. | Auto | Web-E2E Edge-Relationen plus Core Graph-Tests |
| CUI-010 | Edge Mode `All relations` | `overview.md` | 1. All relations waehlen. | Struktur, Links, Backlinks sind unterscheidbar und nicht visuell chaotisch. | viele Links, kleine Viewports. | Auto | Web-E2E Edge-Relationen plus Visual Suite |
| CUI-011 | Outline-Ansicht | `overview.md` | 1. Outline klicken.<br>2. Reihenfolge und Levels pruefen. | Outline zeigt Heading-Hierarchie scannbar, Klick auf Node waehlt ihn. | keine Headings, lange Inhalte. | Auto | `outline-view` E2E |
| CUI-012 | Presentation-Ansicht | `overview.md` | 1. Presentation klicken.<br>2. Next/Previous nutzen. | Fokus-Ansicht zeigt einen Node lesbar, Navigation ist klar, Website-Preview nur wenn relevant. | erster/letzter Node, Node ohne Content. | Auto | `presentation-view` E2E |
| CUI-013 | Focus Branch | `Canvas` | 1. Node waehlen.<br>2. Focus aktivieren.<br>3. Focus verlassen. | Nur relevante Branch ist fokussiert; Rueckkehr zeigt Gesamtmap ohne Layoutbruch. | Auswahl geloescht, gespeicherte View mit Focus. | Auto | `canvas selection` E2E |
| CUI-014 | Saved Views | beliebiger Viewport | 1. View speichern.<br>2. Umbenennen.<br>3. Laden.<br>4. Loeschen. | View erscheint im Select, Name passt, Loeschen entfernt den Eintrag. | LocalStorage leer/korrupt, anderer Workspace. | Auto | `auth-shortcuts.spec.ts` |
| CUI-015 | Copy/Paste Branch | `Child A` nach `Editor` | 1. Branch auswaehlen.<br>2. Copy.<br>3. Ziel waehlen.<br>4. Paste. | Kopie erhaelt neue IDs, Inhalt bleibt, Markdown bleibt gueltig. | Branch in sich selbst, Mehrfachauswahl mit Parent+Child. | Auto | Web-E2E Copy/Paste plus Core-Tests |
| CUI-016 | Undo/Redo | Add/Rename/Content Edit | 1. Aenderung ausfuehren.<br>2. Undo.<br>3. Redo. | Buttons aktivieren/deaktivieren korrekt; Zustand und Markdown stimmen. | Remote-Updates, Content-Y.Text, geloeschter selektierter Node. | Auto | Web-E2E Undo/Redo plus Core-Tests |
| CUI-017 | Mini-Map und Zoom | grosse Map | 1. Scroll/Zoom nutzen.<br>2. Mini-Map beobachten.<br>3. Fit View nutzen. | Zoom bleibt am Cursor, Mini-Map spiegelt View, Controls ueberlappen nicht. | Trackpad, kleine Fenster, hoher DPI. | Auto | Web-E2E Zoom/Minimap plus Visual Suite |
| CUI-018 | Remote Presence Dots | zwei Clients gleiche Datei | 1. Client A/B verbinden.<br>2. In B Node waehlen.<br>3. A beobachten. | Farbige Dots unter Nodes zeigen Remote-User; eigene Auswahl bleibt klar. | User disconnect, gleiche Farbe, mehrere Nutzer. | Auto | Collaboration-E2E Presence-Dot |

## Desktop und Web: Editor, Ressourcendaten und Konflikte

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| EUI-001 | Editor oeffnen/schliessen | `Editor` Node | 1. Edit klicken.<br>2. Panel oeffnen.<br>3. Schliessen. | Resizable Editor erscheint ohne Canvas zu verdecken; Schliessen ist eindeutig. | `Alt+Enter`, schmaler Viewport, Node geloescht. | Auto | `canvas selection` E2E |
| EUI-002 | Editor Resize | Editor offen | 1. Resize-Griff ziehen.<br>2. Min/Max pruefen. | Breite aendert sich kontrolliert, Text/Canvas bleiben bedienbar. | sehr schmal, Pointer loslassen ausserhalb. | Auto | Web-E2E Pointer-Resize |
| EUI-003 | Content bearbeiten | `Editor` Node | 1. Text aendern.<br>2. Speichern.<br>3. Datei pruefen. | Inhalt landet unter richtigem Heading; keine Frontmatter- oder Nebenabschnitts-Aenderung. | Codeblock, Tabelle, Links, Umlaute. | Auto | Web-E2E MDXEditor Save plus Core Roundtrip |
| EUI-004 | Node loeschen | Nicht-Root Node | 1. Editor oeffnen.<br>2. Delete klicken.<br>3. Bestaetigen. | Branch verschwindet, Root kann nicht versehentlich geloescht werden, Auswahl faellt sinnvoll zurueck. | Root, Node mit Kindern, Undo. | Auto | Web-E2E Delete plus Core Yjs-Tests |
| EUI-005 | Metadata Kind wechseln | `Task`, `Web`, `File`, `Source` | 1. Metadata select aendern.<br>2. Felder pruefen.<br>3. Speichern. | Nur passende Felder sichtbar; Eingaben bleiben beim Tippen erhalten; Node-Stil passt. | Wechsel mit gefuellten Feldern, URL ungueltig. | Auto | Web-E2E Metadata-Kind plus Markdown-Persistenz |
| EUI-006 | Web/Source URL Preview | `https://example.com` | 1. Kind `web` setzen.<br>2. URL eintragen.<br>3. Preview/Resource Panel pruefen. | Keine automatische unsichere Anfrage ausser expliziter Preview; Link ist kopier- und oeffenbar. | Private IP, malformed URL, offline. | Auto | `release-contracts.spec.ts` Link Preview |
| EUI-007 | Map Links und Backlinks | `overview.md`, `roadmap.md` | 1. Editor oeffnen.<br>2. Resource Panel pruefen. | Externe Links, Wiki-Links, Broken Links und Backlinks sind klar unterscheidbar. | Alias, Anchor, fehlende Datei. | Auto | `surfaces node links as resources` |
| EUI-008 | Task Toggle | `Task` Node | 1. Task-Node als Task markieren.<br>2. Checkbox togglen. | Status wechselt sichtbar, persistiert im Markdown/Metadata. | Undo, Remote, Reload. | Auto | Web-E2E Task Toggle plus Markdown-Persistenz |
| EUI-009 | Speicherkonflikt | zwei Clients/Version-Konflikt | 1. A und B bearbeiten gleiche Datei.<br>2. A speichert, B speichert veraltet. | ConflictDialog zeigt Diff, Reload/Save Copy/Keep Mine sind klar. | grosser Diff, API 409, Netzwerkfehler. | Auto | Web-E2E 409 Conflict und Save Copy |
| EUI-010 | Lazy Editor Loading | langsamer Editor Chunk | 1. Editor oeffnen mit gedrosseltem Netz/CPU. | Skeleton/Fallback erscheint, keine schwarze Flaeche. | Chunk-Fehler, wiederholtes Oeffnen. | Manual | Screenshot |

## Desktop und Web: Toolbar, Shortcuts, Hilfe und Command Palette

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TUI-001 | New | aktiver Workspace | 1. Toolbar New oder `Cmd/Ctrl+N`.<br>2. Neues Dokument pruefen. | Neue Datei ist geladen, Root selektiert, Auto-Edit startet ohne Fokusverlust. | Read-only Browser-Workspace, Remote-Modus. | Hybrid | Web-E2E Toolbar New; Desktop Native-Rest |
| TUI-002 | Save | geaendertes Dokument | 1. Aenderung machen.<br>2. Save oder `Cmd/Ctrl+S`. | Save-Status ist sichtbar; Datei/API speichert ohne Dialog. | Konflikt, Schreibrecht fehlt, Remote verbunden. | Hybrid | E2E `Cmd+S`, Desktop manuell |
| TUI-003 | Import | externe Markdown-Datei | 1. Import klicken.<br>2. Datei waehlen. | Import ist klar, nicht destructive, Datei wird geladen. | falscher Typ, Dialogabbruch. | Hybrid | Web-E2E Toolbar Import; Desktop Native-Rest |
| TUI-004 | Export | aktuelles Dokument | 1. Export klicken. | Export-Datei enthaelt aktuellen Stand. | Sonderzeichen im Titel. | Hybrid | Web-E2E Toolbar Export; Desktop Native-Rest |
| TUI-005 | Reload | externe Aenderung | 1. Datei extern aendern.<br>2. Reload klicken. | Canvas und Editor zeigen aktuellen Inhalt; Auswahl bleibt sinnvoll. | geloeschte aktive Datei. | Hybrid | Web-E2E Toolbar Reload; Desktop Native-Rest |
| TUI-006 | Help Modal | beliebige Ansicht | 1. `?`, `F1`, Toolbar Help.<br>2. Modal schliessen. | Shortcut-Hilfe sichtbar, fokussierbar, Escape schliesst. | Editor-Fokus, Command Palette offen. | Auto | `shortcut-help` E2E |
| TUI-007 | Theme Toggle | Desktop/Web | 1. Theme Button klicken.<br>2. Canvas/Editor/Wiki pruefen. | Farben bleiben lesbar, Icons sichtbar, keine einfarbige Flaeche. | System Dark Mode, Reload. | Auto | Shared Toolbar E2E plus Visual-Baseline |
| TUI-008 | Sprache | Desktop/Web | 1. Sprache wechseln.<br>2. Header, Toolbar, Help, Dialoge pruefen. | Labels wechseln ohne Layoutbruch; Shortcuts bleiben gleich. | lange deutsche Labels, schmaler Header. | Auto | Shared Locale E2E |
| TUI-009 | Command Palette oeffnen | `Cmd/Ctrl+K` | 1. Palette oeffnen.<br>2. Suche tippen. | Overlay ist fokussiert, Suchergebnisse sind tastaturbedienbar, Escape schliesst. | leerer Workspace, sehr viele Dateien. | Auto | `command-palette` E2E |
| TUI-010 | Command Palette Dateiwechsel | `roadmap.md` | 1. Suche nach `Roadmap`.<br>2. Treffer waehlen. | Datei wechselt, Tabs/Title/Canvas aktualisieren synchron. | gleicher Titel, Unterordner-Datei. | Auto | E2E Palette |
| TUI-011 | Command Palette Aktionen | New, Save, Import, Export, Reload | 1. Aktionen aus Palette ausfuehren. | Jede Aktion ist sichtbar, hat Icon/Text, fuehrt gleichen Codepfad wie Toolbar aus. | Aktion disabled, Remote/read-only. | Hybrid | Web-E2E fuer New/Save/Import/Export/Reload; Desktop Native-Rest |

## Desktop und Web: Sidebar, Dateien, Tabs und Kontextmenue

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| SUI-001 | File Drawer oeffnen/schliessen | mehrere Dateien | 1. Drawer Button.<br>2. Escape.<br>3. Button erneut. | Drawer animiert/erscheint stabil, Canvas behalt Breite/Fokus. | keine Dateien, viele Dateien. | Hybrid | Web FileBrowser E2E, Desktop Screenshot |
| SUI-002 | Suche in Datei-Liste | `WebTest`, `Roadmap` | 1. Suchfeld fuellen.<br>2. Treffer pruefen. | Treffer filtern live, keine falschen Treffer, Empty Search State korrekt. | Unterordner, Gross/Kleinschreibung. | Auto | `filters the file browser` |
| SUI-003 | Datei per Tastatur oeffnen | Drawer offen | 1. ArrowDown/Up.<br>2. Enter.<br>3. Escape. | Fokus-Ring sichtbar, Enter oeffnet Datei, Escape schliesst. | Liste leer, aktive Datei geloescht. | Auto | `toolbar/file drawer` E2E |
| SUI-004 | Kontextmenue Rename | Datei in Drawer | 1. Rechtsklick.<br>2. Rename.<br>3. Titel aendern/speichern. | Menue ist an Klickposition, Rename laedt Datei und startet Edit. | Remote, gleicher Name, langer Name. | Auto | Web-E2E Rename, Save und Export |
| SUI-005 | Kontextmenue Delete | nicht aktive Datei | 1. Rechtsklick Delete.<br>2. Bestaetigen. | Datei verschwindet, aktive Datei bleibt. | aktive letzte Datei, Abbruch, Backup. | Auto | `toolbar/file drawer` E2E |
| SUI-006 | Favorites | Web FileBrowser | 1. Favorite klicken.<br>2. Reload.<br>3. Zustand pruefen. | Sternstatus persistiert lokal/Server-seitig wie vorgesehen. | gleiche ID, gelöschte Datei. | Auto | `file browser favorites` E2E |
| SUI-007 | Tabs im Web | mehrere Dateien | 1. Datei A oeffnen.<br>2. Datei B oeffnen.<br>3. Tabs wechseln/schliessen. | Aktive Tab-Markierung stimmt, Canvas folgt, lange Namen kuerzen. | gleiche Titel, geloeschte Datei, viele Tabs. | Auto | `toolbar/file drawer` E2E |

## Web-App: App-Shell, Browser-Workspace und Workspace-Map

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| WUI-001 | Login/Signup Redirect | keine Session | 1. `/app` oeffnen.<br>2. Login/Signup ausfuehren. | Anonymous wird zu Login geleitet; Signup landet in App; Onboarding sichtbar. | `next` Parameter, falsches Passwort. | Auto | `auth-shortcuts.spec.ts` |
| WUI-002 | Onboarding | frischer Account | 1. Signup.<br>2. Onboarding lesen.<br>3. Shortcuts oeffnen.<br>4. Akzeptieren. | Beta-Scope, Mobile-out-of-scope, Feedback und Docs sichtbar. | Reload, lokaler Storage, kleiner Viewport. | Auto | `beta onboarding` E2E |
| WUI-003 | Notice/Banner | App Notice | 1. Notice erzeugen.<br>2. Schliessen. | Notice ist nicht modal, kann geschlossen werden, blockiert Toolbar nicht. | mehrere Notices. | Auto | Web-E2E Notice |
| WUI-004 | Document/Workspace View Toggle | Dateien mit Links | 1. Document Map waehlen.<br>2. Workspace Map waehlen. | Toggle ist klar, aktiver Zustand sichtbar, Workspace-Hinweis erklaert Scope. | leerer Workspace, grosse Map. | Auto | Browser-Workspace E2E |
| WUI-005 | Browser Folder Workspace oeffnen | lokaler Ordner | 1. `Open local Markdown folder`.<br>2. Browser-Permission erlauben. | Local badge sichtbar, Dateiliste aus Browser-Handle, kein Upload. | Browser ohne File System Access API, Permission denied. | Auto | Browser-Workspace E2E |
| WUI-006 | Read-only Browser Workspace | nur Leserecht | 1. Ordner read-only erlauben.<br>2. Save versuchen. | Read-only Hinweis sichtbar, Schreibrecht kann bewusst angefragt werden. | Nutzer lehnt Upgrade ab. | Auto | Browser-Workspace E2E plus Unit |
| WUI-007 | Workspace Health | Workspace mit broken link | 1. Health Button.<br>2. Findings pruefen. | Broken/ambiguous/roundtrip Hinweise sind gruppiert und handlungsfaehig. | keine Findings, viele Findings. | Auto | Browser-Workspace E2E |
| WUI-008 | Workspace Map Folder Nodes | `m1-ui-smoke` | 1. Workspace Map oeffnen. | Ordner und Dateien werden als unterschiedliche Nodes dargestellt; Struktur-Edges sichtbar. | Unterordner, leerer Ordner, gleiche Dateinamen. | Auto | Browser-Workspace E2E, Core Graph-Tests |
| WUI-009 | Workspace Map Reference Edges | `overview.md`, `roadmap.md` | 1. Reference/Kombiansicht pruefen. | Artikel-Links werden als Querverbindungen angezeigt, Broken Links sichtbar. | Links mit Anchor/Alias, images. | Auto | Browser-Workspace E2E, Core Graph-Tests |
| WUI-010 | Account-Link | eingeloggter Nutzer | 1. Account Button klicken. | Account-Seite oeffnet, keine Layoutbrueche, Token-Bereich erreichbar. | mobile width, keine Tokens. | Auto | `toolbar/file drawer` E2E |

## Web-App: Public, Beta, Registrierung und Doku

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PUI-001 | Landing Desktop-first | `/` | 1. Landing oeffnen.<br>2. Hero/Registrierungs-CTA pruefen. | Desktop-App ist Primaerpfad, Browser-Demo sekundär, Closed-Beta klar. | mobile Navigation, no horizontal overflow. | Auto | `release-contracts`, `mobile-smoke` |
| PUI-002 | Registrierungs-CTA (Waitlist beendet) | `#beta`, `/waitlist` | 1. CTA „Jetzt registrieren“ klicken.<br>2. `/waitlist`, `/waitlist/bestaetigt` aufrufen. | CTA führt zu `bloommd.app/signup`; alte Wartelisten-Links leiten per 308 dorthin; kein Formular. | `/waitlist/abgemeldet`, Abmelde-API bleiben erreichbar. | Auto | `release-contracts` |
| PUI-003 | Beta Page | `/beta` | 1. Seite oeffnen.<br>2. Scope, Limits, bekannte Issues lesen. | Plattformstatus, ad-hoc signierter macOS-Build ohne Developer-ID/Notarisierung, Feedback, Wiederherstellungsgrenzen klar. | noindex, schmaler Viewport. | Auto | `release-contracts` |
| PUI-004 | Docs | `/docs`, `/docs/desktop` | 1. Docs oeffnen.<br>2. Navigation pruefen.<br>3. Subpage oeffnen. | Alle M1-Abschnitte sichtbar; Mobile-out-of-scope klar. | unbekannter Slug, responsive Nav. | Auto | `release-contracts` |
| PUI-005 | Demo | `/demo` | 1. Template waehlen.<br>2. Markdown editieren.<br>3. Datei im Browser laden. | Demo bleibt no-login, keine Inhalte in Analytics/URL, Canvas aktualisiert. | grosse Datei, invalid markdown. | Auto | Release-Contract Demo-E2E |
| PUI-006 | Templates | `/templates`, Detailseite | 1. Liste oeffnen.<br>2. Detailseite.<br>3. Download/Markdown pruefen. | Mindestens sechs Templates, Markdown public, Preview lesbar. | unbekannter Slug. | Auto | `release-contracts` |
| PUI-007 | Legal/Cookies | Legal Pages | 1. AGB, Datenschutz, Cookies, Impressum oeffnen. | Rechtliche Infos erreichbar, Cookie Consent bedienbar. | Consent Wechsel, no JS. | Hybrid | Web-E2E Legal Pages und Cookie Consent; rechtliche Freigabe manuell |

## Web-App: Auth, Beta Gate und Account

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| AUI-001 | Signup ohne Gate lokal | neue E-Mail | 1. `/signup`.<br>2. Daten eingeben. | Account wird erstellt, Redirect nach `/app`, kein Invite-Feld. | schwaches Passwort, invalid E-Mail. | Auto | `auth-shortcuts.spec.ts` |
| AUI-002 | Signup mit Gate ohne Invite | Beta config | 1. Uninvited signup. | Blockiert mit klarer Closed-Beta-Meldung, keine Account Enumeration. | falscher Code, allowlist suffix. | Auto | `beta-gate.spec.ts` |
| AUI-003 | Signup mit Invite/Allowlist | `beta-e2e-code`, allowlist | 1. Signup mit Code oder erlaubter E-Mail. | Session wird gesetzt, Redirect nach `/app`. | `next` extern. | Auto | `beta-gate.spec.ts` |
| AUI-004 | Login ungated | bestehender Account | 1. `/login`.<br>2. Login. | Kein Invite-Feld, bestehende Nutzer kommen rein. | falsches Passwort, fehlendes Passwort. | Auto | `auth-shortcuts`, `beta-gate` |
| AUI-005 | Account Access Tokens | eingeloggter Nutzer | 1. Account oeffnen.<br>2. Token erzeugen.<br>3. Kopieren.<br>4. Revoken. | Token ist einmal sichtbar, Copy erreichbar, Revoke entfernt Eintrag. | Clipboard denied, viele Tokens. | Manual | Screenshot ohne Token im Klartext oder redigiert |

## Web-App: Wiki / OKF / LLM-Wiki UI

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| KUI-001 | Wiki disabled by default | keine Env | 1. `/wiki` und `/api/wiki`. | Public Wiki ist ohne Opt-in nicht aktiv; App erklaert Zustand. | Auth on/off. | Auto | `release-contracts` |
| KUI-002 | Wiki Page View | Fixture Bundle | 1. `/wiki` mit Opt-in.<br>2. Seite waehlen. | Seitenliste, Inhalt, Badges und Status sind sichtbar. | keine Pages, lange Titel. | Auto | `wiki.spec.ts` |
| KUI-003 | Wiki Search | `storage`, `draft` | 1. Suche fuellen.<br>2. Filter pruefen. | Suche grenzt nach Titel/Tag/Status ein. | keine Treffer, Gross/Klein. | Auto | `wiki.spec.ts` |
| KUI-004 | Problems Filter | Bundle mit Broken/Missing | 1. Problems aktivieren. | Seiten mit fehlender Quelle/Broken Link sichtbar. | keine Probleme. | Auto | `wiki.spec.ts` |
| KUI-005 | Knowledge Map | Fixture Graph | 1. Map View oeffnen.<br>2. Node anklicken. | Graph zeigt Broken Links, ohne Quelle, Node-Klick oeffnet Seite. | viele Nodes, Self Links. | Auto | `wiki.spec.ts` |
| KUI-006 | Citations | Page mit/ohne Quellen | 1. Seite mit Quelle.<br>2. Seite ohne Quelle. | Quellen, Hash und fehlende Quellen klar sichtbar. | drifted hash, unknown source. | Auto | `wiki.spec.ts`, Core Wiki-Tests |
| KUI-007 | Remote Preview Consent | remote image | 1. Wiki-Seite oeffnen.<br>2. Vor Klick Requests beobachten.<br>3. Preview klicken. | Keine Drittanfrage vor Klick; Button nennt Host; Anfrage erst nach Consent. | blockierter Host, unsafe URL. | Auto | `wiki.spec.ts` |
| KUI-008 | Missing Local Reference | fehlendes Asset | 1. Seite oeffnen. | Missing Reference bleibt sichtbar, nicht still versteckt. | Directory statt Datei, Traversal. | Auto | `wiki.spec.ts`, `wiki-preview.test.ts` |

## Remote und Collaboration UI

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| RUI-001 | Connect Dialog | Sync/API Testserver | 1. Sidebar `Mit Server verbinden`.<br>2. URL/Token eingeben.<br>3. Verbinden. | Validierung ist klar, HTTPS-Regel sichtbar, Remote-Modus wird erst nach erfolgreichem Load aktiv. | falscher Token, HTTP nicht localhost, Server down. | Auto | Desktop Remote UI/RPC Contract plus Sync E2E |
| RUI-002 | Remote Mode Indicator | verbunden | 1. Remote verbinden.<br>2. Header/Sidebar pruefen. | Remote-URL sichtbar, Disconnect klar, lokale Ordneraktionen ausgeblendet. | sehr lange URL. | Auto | Desktop Remote Indicator Contract |
| RUI-003 | Sync Status | zwei Clients | 1. Zwei Clients gleiche Datei.<br>2. Status beobachten. | `SyncStatus` zeigt connected/syncing/disconnected und Usercount. | reconnect, tab hidden. | Auto | `collaboration.spec.ts` |
| RUI-004 | Awareness Selection | zwei Clients | 1. Client B waehlt Node.<br>2. Client A beobachtet. | Remote-User-Dot unter passendem Node; Auswahl ist nicht mit eigener Auswahl verwechselbar. | User disconnect, mehrere Nutzer. | Auto | `collaboration.spec.ts` |
| RUI-005 | Concurrent Content Edit | zwei Clients | 1. Beide editieren gleichen Node.<br>2. Sync beobachten.<br>3. Speichern/Persistenz pruefen. | Character-Level Merge, kein stiller Verlust, Undo ignoriert Remote-Updates. | gleicher Textbereich, offline/online. | Hybrid | Core Yjs tests, manuelle Collaboration Evidence |
| RUI-006 | Reconnect Banner | gespeicherter Remote nicht erreichbar | 1. Remote speichern.<br>2. Server stoppen.<br>3. App starten. | Lokaler Fallback mit Banner, Server-Einstellung bleibt gespeichert, Retry moeglich. | User schliesst Banner, Server kommt zurueck. | Auto | Desktop Reconnect Banner Contract |
| RUI-007 | Disconnect | verbunden | 1. Disconnect klicken. | Lokaler Watcher startet wieder, Sync wird getrennt, Remote-Daten werden nicht weiter geschrieben. | offene Editor-Aenderung, reconnect ticket aktiv. | Auto | Desktop Disconnect RPC Contract |

## Post-M1 Windows manuelle UI-Matrix

Windows ist kein M1-Release-Blocker mehr. Diese Faelle bleiben als Vorarbeit fuer einen spaeteren
Windows Beta Release dokumentiert.

| ID | Funktion | Testdaten | Schritte | Erwartete UX | Edge-Cases | Status | Evidence |
|---|---|---|---|---|---|---|---|
| WIN-UI-001 | Erststart | Windows x64 Build | 1. Artefakt entpacken/installieren.<br>2. Starten. | SmartScreen-Hinweis ist erwartbar, App startet nach Bestaetigung. | kein Admin, Antivirus. | Manual | Screenshot |
| WIN-UI-002 | Skalierung | 100, 125, 150 Prozent | 1. App je Skalierung starten.<br>2. Header, Sidebar, Canvas, Editor pruefen. | Keine ueberlappenden Controls, Text passt in Buttons. | kleiner Laptop, High DPI. | Manual | Screenshots je Skalierung |
| WIN-UI-003 | Pfade | Leerzeichen, Umlaute | 1. Ordner mit Leerzeichen oeffnen.<br>2. Datei mit Umlaut oeffnen. | Datei/Ordner werden korrekt geladen, Watcher funktioniert. | OneDrive-Pfade, CRLF. | Manual | Screenshot und Datei-Auszug |
| WIN-UI-004 | Tastatur | Ctrl-K/S/C/V/Z | 1. Shortcuts ausfuehren. | Windows-Shortcuts funktionieren analog zu macOS. | Editor-Fokus, Dialog-Fokus. | Manual | Testkommentar |
| WIN-UI-005 | Explorer/CLI Handoff | `.md`, Ordner | 1. Explorer `Open with`.<br>2. `bloommd open .`. | Datei/Ordner werden uebergeben oder fehlender Installer/Association-Gap dokumentiert. | PATH fehlt, URL Handler fehlt. | Manual | CLI-Ausgabe und Screenshot |
| WIN-UI-006 | High Contrast/Dark Mode | Windows Settings | 1. High Contrast/Dark Mode aktivieren.<br>2. App pruefen. | UI bleibt lesbar oder Einschraenkung wird als M1-Gap dokumentiert. | Systemfarben, Fokus-Ring. | Manual | Screenshot |

## Automation Metadata

Diese Tabelle ist die maschinenlesbare Source of Truth fuer die Automation Debt im QA-Runner.
`IDs` darf einzelne IDs, Komma-Listen, Ranges wie `DUI-001..DUI-004` oder Prefix-Wildcards wie
`KUI-*` enthalten. Der Parser expandiert die Eintraege und validiert, dass alle 108 Testfaelle
klassifiziert sind.

| IDs | automationTarget | testType | testFile | selector | fixture | assertionType | manualReason | issue |
|---|---|---|---|---|---|---|---|---|
| DUI-001 | native-smoke; desktop-unit | native; unit | scripts/qa/run-m1-mac.ts; packages/desktop/src/bun/mainview-contract.test.ts | [data-testid=app-shell] | m1-ui-smoke | process; screenshot; log-scan | native visual assertion remains until hard desktop assertions exist | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-002 | desktop-unit | unit | packages/desktop/src/bun/menu.test.ts | n/a | desktop menu source | menu-roles; clipboard-accelerators; no-custom-action | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-003..DUI-004 | desktop-unit; visual-regression | unit; visual | packages/desktop/src/bun/mainview-contract.test.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=desktop-header]; [data-testid=app-loading] | m1-ui-smoke | selector-contract; loading-shell; header-wiring; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/84 |
| DUI-010 | native-smoke; desktop-unit; desktop-e2e-state | native; unit | scripts/qa/run-m1-mac.ts; packages/desktop/src/bun/mainview-contract.test.ts | [data-testid=mindmap-canvas]; [data-testid=file-drawer] | m1-ui-smoke | initial-file-choice; renderer-state; active-file; node-count | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-011 | native-smoke; desktop-unit; visual-regression | native; unit; visual | scripts/qa/run-m1-mac.ts; packages/desktop/src/bun/dialog-selection.test.ts | [data-testid=change-folder] | m1-ui-smoke | selected-directory; settings-update; file-list | native folder picker selection still needs screenshot evidence | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-012 | desktop-unit | unit | packages/desktop/src/bun/dialog-selection.test.ts; packages/desktop/src/bun/mainview-contract.test.ts | [data-testid=change-folder] | m1-ui-smoke | canceled-dialog; no-op; no-user-error | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-013 | native-smoke; desktop-e2e; visual-regression | native; e2e; visual | scripts/qa/run-m1-mac.ts | [data-testid=empty-workspace] | m1-ui-smoke/empty-folder | settings; empty-state; screenshot | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-014..DUI-015, DUI-018 | desktop-e2e; web-e2e; desktop-unit; core-unit | e2e; unit | apps/app/e2e/*.spec.ts; packages/desktop/src/bun/*.test.ts; packages/core/src/fileStore.test.ts | [data-testid=file-drawer] | m1-ui-smoke | file-system; UI-state; markdown-hash | native dialogs and folder-picker visuals remain partial until mocked | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| DUI-016..DUI-017, DUI-019 | desktop-unit; web-e2e | unit; e2e | packages/desktop/src/bun/mainview-contract.test.ts; packages/desktop/src/bun/file-change.test.ts; apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=toolbar-import]; [data-testid=toolbar-export]; [data-testid=file-drawer] | m1-ui-smoke | import-write; export-markdown; watcher-refresh; file-list | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| DUI-030..DUI-031 | wiki-cli-contract; desktop-unit; native-smoke | cli; unit; native | packages/wiki-cli/src/index.test.ts; packages/desktop/src/bun/e2e-mode.test.ts; scripts/qa/run-m1-mac.ts | n/a | m1-ui-smoke | dry-run-url; folder-target; markdown-file-target; e2e-state | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-032 | manual-os | manual | Finder/Open-With smoke | n/a | m1-ui-smoke | OS-association; active-file; screenshot | Finder handoff requires installed macOS association | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-033 | desktop-unit | unit | packages/desktop/src/bun/external-file.test.ts | n/a | URL scheme fixtures | URL-scheme; markdown-only; control-character-reject; oversize-reject | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/83 |
| DUI-034 | manual-os | manual | Windows machine smoke | n/a | Windows Smoke | CLI; URL-handler; screenshot | Windows PowerShell and installer association require Windows host | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/79 |
| CUI-001 | web-e2e; visual-regression | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=mindmap-canvas]; [data-testid=mindmap-node]; [data-testid=mindmap-edge] | m1-ui-smoke | node-presence; hierarchy-edge; layout; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/84 |
| CUI-002 | web-e2e; visual-regression | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=mindmap-node]; [data-testid=node-action-toolbar] | m1-ui-smoke | selection-state; toolbar-visible; screenshot-diff | pane-clear remains partial until ReactFlow pane event is reliable in E2E | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/84 |
| CUI-003 | web-e2e; visual-regression | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=node-action-toolbar]; [data-testid=node-action-add-child]; [data-testid=node-action-add-sibling]; [data-testid=node-action-open-editor] | m1-ui-smoke | toolbar-buttons; add-child; add-sibling; editor-open; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/84 |
| CUI-004 | web-e2e; core-unit | e2e; unit | apps/app/e2e/auth-shortcuts.spec.ts; packages/core/src/yjs-operations.test.ts | [data-testid=node-action-add-child] | m1-ui-smoke | DOM; Yjs-state; markdown | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| CUI-005 | web-e2e; core-unit | e2e; unit | apps/app/e2e/auth-shortcuts.spec.ts; packages/core/src/yjs-operations.test.ts | [data-testid=node-action-add-sibling] | m1-ui-smoke | DOM; markdown-order; sibling-state | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| CUI-006 | unit; visual-regression | unit; visual | packages/ui/src/utils/canvas-drag.test.ts; packages/core/src/yjs-operations.test.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=mindmap-node] | m1-ui-smoke | drop-target; markdown-hierarchy; screenshot-diff | pointer-level browser drag remains hybrid until ReactFlow drag is stable in E2E | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/86 |
| CUI-007..CUI-010 | core-unit; web-e2e; visual-regression | unit; e2e; visual | packages/core/src/workspace-graph.test.ts; apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=edge-mode]; [data-testid=mindmap-edge] | m1-ui-smoke | graph-edges; relation-filter; mode-state; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/84 |
| CUI-011..CUI-012, CUI-014 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=view-mode-toggle] | m1-ui-smoke | DOM; navigation; localStorage | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| CUI-013 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=view-mode-toggle] | m1-ui-smoke | focus-state; outline-filter; exit-focus | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/84 |
| CUI-015..CUI-016 | core-unit; web-e2e | unit; e2e | packages/core/src/yjs-operations.test.ts; apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=canvas-copy]; [data-testid=canvas-paste]; [data-testid=canvas-undo]; [data-testid=canvas-redo] | m1-ui-smoke | Yjs-state; clipboard; undo-stack; DOM-count | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| CUI-017 | web-e2e; visual-regression | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | .react-flow__minimap; .react-flow__controls | m1-ui-smoke | zoom-state; viewport-transform; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/84 |
| CUI-018 | collaboration-e2e; visual-regression | e2e; visual | apps/app/e2e/collaboration.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=remote-user-presence] | collaboration-workspace | awareness; presence-dot; two-client-selection; screenshot | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/85 |
| EUI-001 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=node-editor] | m1-ui-smoke | open-close; keyboard-toggle; DOM | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| EUI-002 | web-e2e; visual-regression | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=editor-resize-handle] | m1-ui-smoke | pointer-drag; editor-width; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| EUI-003 | web-e2e; core-unit; visual-regression | e2e; unit; visual | apps/app/e2e/auth-shortcuts.spec.ts; packages/core/src/parser.test.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=node-editor]; .mdxeditor [contenteditable] | m1-ui-smoke | contenteditable-change; markdown-save; parser-roundtrip; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| EUI-004..EUI-005 | web-e2e; core-unit | e2e; unit | apps/app/e2e/auth-shortcuts.spec.ts; packages/core/src/yjs-operations.test.ts | [data-testid=node-editor-delete]; [data-testid=node-kind-select]; [data-testid=node-url-input] | m1-ui-smoke | node-delete; metadata-kind; markdown-meta; root-remains | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| EUI-006..EUI-007 | web-e2e; core-unit | e2e; unit | apps/app/e2e/release-contracts.spec.ts; packages/core/src/workspace-graph.test.ts | [data-testid=resource-panel] | m1-ui-smoke | network-consent; links; backlinks | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| EUI-008..EUI-009 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=node-task-status]; [data-testid=conflict-dialog] | m1-ui-smoke | task-status; markdown-meta; 409-conflict; diff; save-copy | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| EUI-010 | web-e2e; component; visual-regression | e2e; component; visual | future editor chunk E2E | [data-testid=node-editor] | m1-ui-smoke | lazy-state; fallback; chunk-error | lazy editor chunk fallback needs controlled bundle-delay test | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| TUI-001..TUI-005 | web-e2e; desktop-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=toolbar] | m1-ui-smoke | command; save-state; filechooser; download; keyboard | desktop toolbar parity remains partial until desktop E2E exists | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| TUI-006 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=shortcut-help] | m1-ui-smoke | modal; keyboard; focus | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| TUI-007..TUI-008 | web-e2e; visual-regression; shared-ui | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=toolbar-theme]; [data-testid=toolbar-locale] | m1-ui-smoke | theme; i18n; localStorage; screenshot-diff; shared-toolbar-path | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/84 |
| TUI-009..TUI-011 | web-e2e; desktop-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=command-palette] | m1-ui-smoke | keyboard; command-dispatch; file-state; download; filechooser | desktop native import/export dialogs remain partial until desktop E2E covers palette parity | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| SUI-001 | web-e2e; desktop-e2e; visual-regression | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=file-drawer] | m1-ui-smoke | drawer-open; screenshot-diff | drawer close and desktop parity still need explicit automation | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| SUI-002..SUI-003 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=file-drawer] | m1-ui-smoke | search; keyboard-open; active-file | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| SUI-004 | web-e2e; desktop-e2e; visual-regression | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=file-context-menu]; [data-testid=file-context-rename] | m1-ui-smoke | context-menu; rename-start; markdown-save; export-title; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| SUI-005, SUI-007 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=file-drawer] | m1-ui-smoke | context-delete; tab-state; active-file | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| SUI-006 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=file-drawer] | m1-ui-smoke | favorite-state; localStorage; sorted-list; reload | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| WUI-001..WUI-002 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [data-testid=app-shell] | web auth fixtures | auth-redirect; onboarding | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/88 |
| WUI-003 | web-e2e; visual-regression | e2e; visual | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/visual-regression.spec.ts | [data-testid=app-notice] | m1-ui-smoke | notice-state; dismiss; toolbar-not-blocked; screenshot-diff | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| WUI-004..WUI-009 | web-e2e; browser-fs-mock; core-unit | e2e; unit | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/src/lib/browser-workspace.test.ts; packages/core/src/workspace-graph.test.ts | [data-testid=workspace-map] | browser workspace mock | local-file-handle; read-only; workspace-graph; health-finding; broken-link-layer | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/87 |
| WUI-010 | web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts | [aria-label=\"Account und Abrechnung\"] | web auth fixtures | route; heading; account-shell | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/88 |
| PUI-001..PUI-006 | marketing-e2e | e2e | apps/marketing/e2e/release-contracts.spec.ts; apps/marketing/e2e/mobile-smoke.spec.ts | [data-testid=public-page] | web public fixtures | DOM; route-contract; no-horizontal-overflow | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/88 |
| PUI-007 | manual-release; marketing-e2e | manual; e2e | apps/marketing/e2e/release-contracts.spec.ts | [data-testid=legal-page] | web public fixtures | legal-links; consent-state | legal/cookie review needs human sign-off even when route E2E exists | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/79 |
| AUI-001..AUI-004 | beta-e2e; web-e2e | e2e | apps/app/e2e/auth-shortcuts.spec.ts; apps/app/e2e/beta-gate.spec.ts | [data-testid=auth-form] | beta auth fixtures | session; redirect; gate | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/88 |
| AUI-005 | web-e2e; visual-regression | e2e; visual | future account E2E | [data-testid=access-token-panel] | beta auth fixtures | token-create; copy; revoke | token value must be redacted in evidence | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/89 |
| KUI-* | wiki-e2e; core-unit | e2e; unit | apps/app/e2e/wiki.spec.ts; packages/core/src/wiki-preview.test.ts | [data-testid=wiki-explorer] | wiki fixture bundle | route; search; graph; citation; consent | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/88 |
| RUI-001..RUI-002, RUI-006..RUI-007 | desktop-unit; collaboration-e2e; sync-unit | unit; e2e | packages/desktop/src/bun/mainview-contract.test.ts; apps/app/e2e/collaboration.spec.ts; packages/sync/src/*.test.ts | [data-testid=connect-dialog]; [data-testid=sync-status]; [data-testid=reconnect-failed-banner] | m1-ui-smoke with sync server | remote-connect-validation; indicator; reconnect-banner; disconnect-rpc | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/85 |
| RUI-003..RUI-004 | collaboration-e2e | e2e | apps/app/e2e/collaboration.spec.ts | [data-testid=sync-status]; [data-testid=remote-user-presence] | collaboration-workspace | user-count; awareness; remote-selection | n/a | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/85 |
| RUI-005 | collaboration-e2e; sync-unit; visual-regression | e2e; unit; visual | apps/app/e2e/collaboration.spec.ts; packages/sync/src/*.test.ts | [data-testid=sync-status] | collaboration-workspace | Yjs-update; persistence; markdown | simultaneous MDXEditor content merge still needs explicit two-client editor automation | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/85 |
| WIN-UI-* | manual-os | manual | Windows machine smoke | n/a | Windows Smoke | install; scaling; CLI; screenshot | Windows SmartScreen Explorer and high-contrast require Windows host | https://github.com/moellenbeck-digital/BloomMD-archiv/issues/79 |

## Abdeckungs-Audit

| Bereich | Relevante Test-IDs | Aktuelle Abdeckung | M1-Entscheidung |
|---|---|---|---|
| Desktop Start und Native Handoff | DUI-001 bis DUI-034 | Header, Loading, Initial Load, Clipboard, CLI und URL-Scheme Auto; App-Start/Finder bleibt Plattform-Evidence; Windows wird nach M1 nachgezogen | M1 erlaubt mit gruener macOS-Evidence |
| Lokale Dateien und Empty States | DUI-010 bis DUI-019 | Default Load, Cancel, Import, Export und Watcher-Refresh Auto; Folder-Picker-Visuals bleiben Hybrid | M1-relevant, keine offenen bekannten Blocker |
| Canvas | CUI-001 bis CUI-018 | Mehrzahl Auto; Pane-Clear, Drag und Remote Presence bleiben bewusst Restfaelle | Drag UI muss vor Beta sign-off manuell belegt werden |
| Editor und Metadata | EUI-001 bis EUI-010 | Content, Resize, Delete, Metadata, Task und Konflikt Auto; Lazy-Chunk bleibt offen | M1 erlaubt mit manueller Evidence fuer verbleibende Editor-Restfaelle |
| Toolbar und Command Palette | TUI-001 bis TUI-011 | Theme/Sprache/Help Auto; Dateiaktionen Web-Auto, Desktop-Dialoge bleiben Restarbeit | Desktop-Palette- und Dialog-Paritaet bleibt Restarbeit |
| Sidebar und Tabs | SUI-001 bis SUI-007 | Suche, Rename, Delete, Favorites und Tabs Auto; Drawer-Desktop-Paritaet bleibt hybrid | Keine Release-Freigabe ohne gruenen Sidebar-E2E |
| Web App Shell | WUI-001 bis WUI-010 | Auth, Onboarding, Notice, Browser Workspace und Health Auto | Browser Workspace ist M1-relevant |
| Public/Beta/Registrierung | PUI-001 bis PUI-007 | Gute Auto-Abdeckung | Legal/Cookies manuell schnell pruefen |
| Auth/Account | AUI-001 bis AUI-005 | Gate Auto, Access Tokens manuell | Token-UI manuell vor Beta |
| Wiki | KUI-001 bis KUI-008 | Gute Auto-Abdeckung | M1-ready nach gruenem `test:e2e:wiki` |
| Remote/Collaboration | RUI-001 bis RUI-007 | Connect/Indicator/Reconnect/Disconnect als Desktop-Contract Auto; Zwei-Client Sync/Persistence/Awareness Auto; gleichzeitiger Editor-Merge Hybrid | Beta-Feature, Content-Merge-Restfall gezielt nachziehen |
| Windows | WIN-UI-001 bis WIN-UI-006 | Manuell | Post-M1 Windows Beta Release |

## Automatisierungs-Backlog

Diese Tests sollten nach der M1-Stabilisierung automatisiert werden:

| Prioritaet | Test-IDs | Vorschlag |
|---|---|---|
| P0 | CUI-006 | Playwright Drag mit Pointer-Sequenz oder gezielter Component-Test fuer Drop-Targets |
| P0 | RUI-005 | Gleichzeitiger MDXEditor-Content-Merge im Zwei-Client-Playwright |
| P1 | SUI-004, SUI-005 | Sidebar-Kontextmenue Rename/Delete als Web-E2E |
| P1 | WUI-005, WUI-006 | Browser File System Access Mock fuer Local Workspace |
| P1 | EUI-009 | Speicherkonflikt-E2E mit API-Version-Konflikt |
| P2 | TUI-011 | Native Desktop-Palette-Smoke fuer Import/Export/New/Reload |
| P2 | WIN-UI-* | Windows CI Smoke, sobald Installer/URL-Handler reproduzierbar ist |

## Abschlusskriterien UI-QA

UI-QA fuer M1 ist abgeschlossen, wenn:

- alle `Auto`-Faelle in CI gruen sind
- alle `Manual`-Faelle fuer macOS mit Evidence dokumentiert sind
- Windows `WIN-UI-*` als Post-M1 Windows-Beta-Arbeit nachverfolgt wird
- alle `Gap`-Faelle entweder automatisiert, manuell belegt oder als akzeptierte M1-Ausnahme im
  Project Board kommentiert sind
- keine UI zeigt beim normalen M1-Basisflow alten Inhalt, schwarze Flaechen, unklare Fehlzustaende
  oder ueberlappende Controls
- Collaboration-UI ist als Beta-Funktion sichtbar begrenzt und verliert keine Aenderungen still
