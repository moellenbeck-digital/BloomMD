# Changelog

## In Entwicklung

- Workspace-Index (Teil 1, ohne Oberfläche): `bloommd-wiki workspace index <pfad>` zeigt je Datei und je Überschrift, wer darauf verweist (Quelldatei, Überschrift, Zeile, Link wie geschrieben; ein Link mit Anker zählt für die Überschrift, einer ohne für die Datei), und meldet drei Befunde: defekte oder mehrdeutige Links, veraltete Ziele (Anker ohne passende Überschrift; Zieldatei mit Status `veraltet`/`ersetzt` oder abgelaufenem `stale_after`, mit `replaced_by` als Nachfolger) und doppelte `bloommd:id` (auch die, die der Parser beim Öffnen still neu vergibt) mit allen Fundstellen. Ausgabe als Text, JSON oder GitHub-Annotationen; Fehler ergeben Exit-Code 1, mit `--strict` auch Warnungen. Der Wissens-MCP bekommt dazu `bloommd_workspace_index` (ohne `path`: Zusammenfassung und Befunde, mit `path`: eine Map mit den Rückverweisen ihrer Überschriften). `workspace lint` und seine Ergebnisse bleiben unverändert.
- Workspace index (part 1, no interface): `bloommd-wiki workspace index <path>` shows, per file and per heading, who links to it (source file, heading, line, link as written; a link with an anchor counts for the heading, one without for the file) and reports three findings: broken or ambiguous links, stale targets (an anchor without a matching heading; a target file with status `veraltet`/`ersetzt` or a past `stale_after`, naming `replaced_by` as the successor) and duplicate `bloommd:id`s (including those the parser silently reassigns on open) with every place. Output as text, JSON or GitHub annotations; errors exit 1, with `--strict` warnings do too. The knowledge MCP gains `bloommd_workspace_index` (without `path`: summary and findings, with `path`: one map with the backlinks of its headings). `workspace lint` and its results are unchanged.

- Registrierung: Die Quelladresse für die Limits je Adresse lässt sich nicht mehr per Header fälschen. Geglaubt wird nur noch ein Header: der in `BLOOMMD_TRUSTED_PROXY_HEADER` benannte (z. B. `cf-connecting-ip`), sonst der letzte Eintrag von `x-forwarded-for` (genau ein Proxy davor). `x-vercel-forwarded-for`, `cf-connecting-ip` und `x-real-ip` zählen nur noch, wenn sie dort benannt sind. Fehlt der Header im Produktionsbuild, zählen alle solchen Anfragen gemeinsam. `release:check` lehnt einen ungültigen Header-Namen ab und warnt, wenn er fehlt (ebenso `warnings` in `/api/health/ready`).
- Registration: the source address used for the per-address limits can no longer be forged with a header. Only one header is believed: the one named in `BLOOMMD_TRUSTED_PROXY_HEADER` (e.g. `cf-connecting-ip`), otherwise the last `x-forwarded-for` entry (exactly one proxy in front). `x-vercel-forwarded-for`, `cf-connecting-ip` and `x-real-ip` only count when named there. If the header is missing in a production build, all such requests are counted together. `release:check` rejects an invalid header name and warns when it is unset (also `warnings` in `/api/health/ready`).

- Registrierung: Für Bestätigungs- und Passwort-Reset-Mails gibt es eine globale Obergrenze, damit niemand mit vielen Adressen beliebig viele Mails auslösen kann (Kosten, Absender-Ruf). Standard 300 je Tag und 60 je Stunde (UTC), einstellbar mit `BLOOMMD_MAIL_DAILY_LIMIT` und `BLOOMMD_MAIL_HOURLY_LIMIT`; der Zähler liegt in der Datenbank (neue Migration `010_account_mail_budget.sql`, vor dem Rollout `db:migrate`). Ist die Grenze erreicht, antwortet die Registrierung „vorübergehend nicht verfügbar“, es geht keine Mail raus, es wird kein unbestätigtes Konto angelegt, und das Log enthält eine `[BloomMD][ALERT]`-Zeile. Einladungs- und Beta-Mails zählen nicht mit.
- Registration: confirmation and password-reset mails have a global cap, so nobody can trigger unlimited mail with many addresses (cost, sender reputation). Default 300 per day and 60 per hour (UTC), configurable with `BLOOMMD_MAIL_DAILY_LIMIT` and `BLOOMMD_MAIL_HOURLY_LIMIT`; the counter lives in the database (new migration `010_account_mail_budget.sql`, run `db:migrate` before the rollout). When the cap is reached, sign-up answers "temporarily unavailable", no mail is sent, no unconfirmed account is created, and the log gets a `[BloomMD][ALERT]` line. Invitation and beta mails are not counted.

- Registrierung: Unbestätigte Konten werden nach 7 Tagen samt offenen Tokens gelöscht (Datenmüll, Adressen Dritter). Betroffen sind nur Passwort-Konten, die nie bestätigt wurden und nichts besitzen (kein Workspace, keine Mitgliedschaft, kein Zugriffstoken, kein Zahlungskunde). Der Wartungsjob `db:maintenance` erledigt das (Frist einstellbar mit `BLOOMMD_UNCONFIRMED_ACCOUNT_RETENTION_DAYS`); `bun run --cwd apps/app db:purge-unconfirmed` zeigt vorab als Probelauf (Standard), was gelöscht würde, und löscht mit `--apply`. Wer sich danach erneut registriert, kann dieselbe Adresse wieder verwenden.
- Registration: unconfirmed accounts are deleted after 7 days together with their open tokens (junk data, third-party addresses). Only password accounts that were never confirmed and own nothing are affected (no workspace, no membership, no access token, no billing customer). The `db:maintenance` job does this (period configurable with `BLOOMMD_UNCONFIRMED_ACCOUNT_RETENTION_DAYS`); `bun run --cwd apps/app db:purge-unconfirmed` shows what would be deleted as a dry run (default) and deletes with `--apply`. Anyone registering again afterwards can reuse the same address.

- Test-Bypass fail-closed: Der Test-Login-Bypass (`BLOOMMD_E2E_AUTH_BYPASS=1`) gilt in einem Produktionsbuild nur noch, wenn zusätzlich `BLOOMMD_E2E_TEST_MODE=1` und `BLOOMMD_LOCAL_DEPLOYMENT=1` gesetzt sind; die öffentliche App setzt Letzteres nie. Die Absicherung hängt damit nicht mehr allein daran, dass `release:check` läuft. Test-Server mit Produktionsbuild (CI, Playwright-Konfigurationen, Testsystem) müssen `BLOOMMD_LOCAL_DEPLOYMENT=1` setzen.
- Test bypass fail-closed: the test login bypass (`BLOOMMD_E2E_AUTH_BYPASS=1`) now only applies in a production build when `BLOOMMD_E2E_TEST_MODE=1` and `BLOOMMD_LOCAL_DEPLOYMENT=1` are set as well; the public app never sets the latter. The protection no longer depends solely on `release:check` having run. Test servers running a production build (CI, Playwright configurations, test system) must set `BLOOMMD_LOCAL_DEPLOYMENT=1`.

- Registrierung, Nachtrag: `release:check` und `/api/health/ready` lehnen `BLOOMMD_LOCAL_DEPLOYMENT=1` in Produktion ab. Die Test-Mail-Outbox (`BLOOMMD_E2E_MAIL_OUTBOX`) gilt im Produktionsbuild nur noch zusammen mit `BLOOMMD_E2E_TEST_MODE=1` und `BLOOMMD_LOCAL_DEPLOYMENT=1`, wie der Test-Bypass. Die Bereinigung unbestätigter Konten lässt Konten aus, die Workspace-Einladungen versendet haben. Neue Betriebsdoku `docs/ACCOUNT-ABUSE-PROTECTION.md` (Rollout-Reihenfolge, Einstellungen für Ops, Wartungsjob, Grenzwerte).
- Registration, follow-up: `release:check` and `/api/health/ready` reject `BLOOMMD_LOCAL_DEPLOYMENT=1` in production. The test mail outbox (`BLOOMMD_E2E_MAIL_OUTBOX`) only applies in a production build together with `BLOOMMD_E2E_TEST_MODE=1` and `BLOOMMD_LOCAL_DEPLOYMENT=1`, like the test bypass. The cleanup of unconfirmed accounts skips accounts that sent workspace invitations. New operations guide `docs/ACCOUNT-ABUSE-PROTECTION.md` (rollout order, settings for Ops, maintenance job, limits).

- Desktop: Der Startbildschirm (Splash) zeigt die Version, die wirklich gebaut wurde, statt immer `v0.3.0`. Er zeigt dieselbe Zeichenkette wie der About-Dialog: `BloomMD <Version> (<Kurz-SHA>)`, ohne Klammer, wenn der Build keine SHA kennt. Stable-, Development- und Insiders-Builds zeigen jeweils ihre eigene Version.
- Desktop: The start screen (splash) shows the version that was actually built instead of always `v0.3.0`. It shows the same string as the About dialog: `BloomMD <version> (<short SHA>)`, without the parenthesis when the build has no SHA. Stable, development and insiders builds each show their own version.

- Desktop: Ein Ordner-, Datei- oder PDF-Dialog darf beliebig lange offen bleiben. Wer den Dialog „Ordner wechseln“, „Datei importieren“ oder die Auswahl einer Ressource/PDF länger als 60 Sekunden offen ließ, bekam nach der Auswahl „Dateien konnten nicht geladen werden“ bzw. einen Fehler, obwohl die App die Auswahl übernommen hatte (Ordner gewechselt, Einstellung gespeichert). Die Auswahl erreicht jetzt auch nach langer Wartezeit die Oberfläche; ein Abbrechen bleibt ohne Meldung, ein echter Fehler (z. B. gewählter Pfad ist kein Ordner) wird weiter angezeigt. Alle übrigen Anfragen zwischen Oberfläche und App behalten ihre Zeitgrenze von 60 Sekunden.
- Desktop: A folder, file or PDF dialog may stay open as long as needed. Leaving the "Change folder", "Import file" or resource/PDF picker open for more than 60 seconds used to end in "Files could not be loaded" or an error after the choice, although the app had accepted it (folder switched, setting saved). The choice now reaches the interface after any wait; cancelling stays silent and a real error (e.g. the chosen path is not a folder) is still shown. All other requests between interface and app keep their 60-second limit.

- Texte zur Registrierung: Die Seite „Beta“ der App, die Hilfe zum Zugang sowie Startseite, Leistungsbeschreibung, Obsidian- und Download-Seite sprechen nicht mehr von einer Cloud-Beta „auf Einladung“ oder einer Warteliste, sondern von der offenen Registrierung. Der Wartelisten-Link im Zugangsblock der Registrierung entfällt. Die Datenschutzerklärung der App beschreibt die beendete Warteliste wie die auf bloommd.io (Löschung 90 Tage nach der Einladungs-E-Mail).
- Registration wording: the app's "Beta" page, the access help, the landing page, service description, Obsidian and download pages no longer describe the cloud beta as "by invitation" or mention a waitlist, but the open registration. The waitlist link in the access block of the signup page is gone. The app privacy policy describes the ended waitlist like the one on bloommd.io (deletion 90 days after the invitation email).

- Neue Dateien lassen sich aus einer Vorlage anlegen, damit niemand mit einer leeren Fläche starten muss. Es gibt fünf eingebaute Vorlagen, jeweils auf Deutsch und Englisch (Sprache der Oberfläche): Vorlesung, Cornell, Literaturnotiz, Prüfungsvorbereitung und Projekt. Jede beginnt mit `# {{title}}`, die Überschriften sind die Knoten der Map. Vorlagen sind gewöhnliche `.md`-Dateien; ersetzt werden nur `{{title}}` (Dateiname ohne `.md`) und `{{date}}` (heutiges Datum, `JJJJ-MM-TT`), andere `{{…}}` bleiben stehen. In der Web-App wählst du die Vorlage im Dialog „+ Datei“ (Voreinstellung „Leer“ wie bisher), in der Desktop-App über den neuen Knopf „Neu aus Vorlage“ in der Werkzeugleiste, im Obsidian-Plugin über das Kommando „New note from template“ (Auswahl, Name; die Datei entsteht im Ordner für neue Notizen neben der aktiven Datei und öffnet sich). Eigene Vorlagen: alle `.md`-Dateien direkt im Ordner `Vorlagen/` im Wurzelverzeichnis des Workspaces bzw. Vaults erscheinen hinter den eingebauten, mit dem Dateinamen als Titel; Unterordner werden nicht durchsucht, fehlt der Ordner, gibt es nur die eingebauten. Im Obsidian-Plugin ist der Ordnername unter Einstellungen → „Template folder“ änderbar. Die Galerie der Marketing-Templates bleibt unverändert.
- New files can be created from a template, so nobody has to start from a blank page. There are five built-in templates, each in German and English (the interface language): Lecture, Cornell, Literature note, Exam prep and Project. Each starts with `# {{title}}`, and the headings are the nodes of the map. Templates are ordinary `.md` files; only `{{title}}` (the file name without `.md`) and `{{date}}` (today, `YYYY-MM-DD`) are replaced, any other `{{…}}` stays as written. In the web app you pick the template in the "+ File" dialog (default "Blank", as before), in the desktop app with the new "New from template" toolbar button, in the Obsidian plugin with the command "New note from template" (choose, name; the file is created in the folder Obsidian uses for new notes next to the active file and opens). Your own templates: all `.md` files directly inside the `Vorlagen/` folder at the root of the workspace or vault appear after the built-in ones, with the file name as title; sub-folders are not searched, and without the folder only the built-in templates are offered. In the Obsidian plugin the folder name can be changed under Settings → "Template folder". The gallery of marketing templates is unchanged.

- Offene Aufgaben über alle Maps eines Vaults: `bloommd-wiki agent tasks [--owner <name>] [--faellig-bis <YYYY-MM-DD>] [--vault <ordner>]` gibt sie als JSON (`{ "tasks": [...] }`) aus, nach Fälligkeit sortiert (ohne Datum zuletzt), überfällige mit `overdue: true`; ohne Treffer `{ "tasks": [] }` und Exitcode 0. Das MCP-Werkzeug `bloommd_tasks` liefert dasselbe und nimmt neu `owner`. Als Aufgaben zählen Knoten mit `kind: task` (nicht erledigt) und neu offene `- [ ]`-Zeilen im Inhalt eines Knotens (`- [x]` und Codeblöcke nicht); eine Checkbox erbt weder Fälligkeit noch Verantwortliche. `owner` ist ein Alias für `assignee`: Beim Lesen, in `bloommd_create_map`, `bloommd_update_map`, `bloommd_update_node` und `agent update-node` angenommen, gespeichert wird weiter `assignee`; beide Felder mit verschiedenen Werten werden abgelehnt. Bestehende Maps bleiben unverändert.
- Open tasks across all maps of a vault: `bloommd-wiki agent tasks [--owner <name>] [--faellig-bis <YYYY-MM-DD>] [--vault <folder>]` prints them as JSON (`{ "tasks": [...] }`), sorted by due date (no date last), overdue ones with `overdue: true`; without a match `{ "tasks": [] }` and exit code 0. The MCP tool `bloommd_tasks` returns the same and now takes `owner`. Tasks are nodes of `kind: task` (not done) and now also open `- [ ]` lines in a node's content (not `- [x]`, not code blocks); a checkbox inherits neither due date nor owner. `owner` is an alias of `assignee`: accepted when reading, in `bloommd_create_map`, `bloommd_update_map`, `bloommd_update_node` and `agent update-node`, while `assignee` stays what is stored; both fields with different values are refused. Existing maps stay unchanged.

- Der Hinweis „Workspace-Ansichten sind abgeleitet …“ bleibt nach dem Speichern in der Workspace-Übersicht nicht mehr stehen, wenn man eine Markdown-Datei öffnet: Beim Wechsel des Dokuments (Workspace → Datei, Datei → Datei, zurück zur Übersicht) verschwindet die Statusmeldung des vorigen Dokuments. Die Meldung zum entzogenen Zugriff bleibt sichtbar.
- The hint "Workspace views are derived …" no longer stays visible after saving in the workspace overview and then opening a Markdown file: when the document changes (workspace → file, file → file, back to the overview) the status message of the previous document disappears. The access-revoked message stays visible.

- Text und Transkripte lassen sich als Map nach Vorlage ablegen: `bloommd-wiki agent ingest` (CLI) und das MCP-Werkzeug `bloommd_ingest` nehmen den Originaltext (Datei, stdin bzw. Textfeld), eine Vorlage (Besprechung, Gespräch, Diskussion, Lerneinheit, Projekt, Wochenrückblick), Titel, Quellenverweis mit Datum und die vom Agenten schon gegliederten Abschnitte und legen die Map an. Der Originaltext steht wörtlich als Knoten `kind: source` unter „Quellen“, ohne Kürzung; ohne Text oder Quellenverweis wird nichts geschrieben. Das Werkzeug erfindet nichts und ruft kein Modell auf. Grenzen: Originaltext höchstens 200 000 Zeichen, Abschnitte höchstens 150 Knoten (sonst klare Fehlermeldung, nichts geschrieben). Rechte, Vorschlag/Freigabe, Protokoll und Undo wie bei `bloommd_create_map`; bei gleichem Titel im Zielbereich wird nichts angelegt (Exitcode 3, Pfad der vorhandenen Map). Keine Zugangsdaten und keine Personendaten ablegen; Details in der Hilfe „Agent-Wissen“.
- Text and transcripts can be filed as a map from a template: `bloommd-wiki agent ingest` (CLI) and the MCP tool `bloommd_ingest` take the original text (file, stdin or text field), a template (meeting, conversation, discussion, lesson, project, weekly review), a title, a source reference with date and the sections the agent has already structured, and create the map. The original text stands word for word as a node of `kind: source` below "Quellen", without shortening; without text or source reference nothing is written. The tool invents nothing and calls no model. Limits: original text at most 200,000 characters, sections at most 150 nodes (otherwise a clear error, nothing written). Rights, proposal/approval, log and undo as for `bloommd_create_map`; with the same title in the target area nothing is created (exit code 3, path of the existing map). Do not file credentials or personal data; details in the "Agent knowledge" help.

- Eine neue Besprechung ergänzt eine bestehende Map, statt eine zweite anzulegen: `bloommd-wiki agent ingest --in-map <pfad>` und das MCP-Werkzeug `bloommd_ingest` mit `inMap` nehmen denselben strukturierten Inhalt wie beim Ablegen (Originaltext, Quellenverweis mit Datum, Abschnitte). Hat der Elternknoten eines Abschnittsknotens schon genau ein Kind mit gleichem Titel (Groß-/Kleinschreibung und Satzzeichen zählen nicht), wird es nicht doppelt angelegt: die neuen Kinder hängen darunter, sein Inhalt bleibt unverändert; sonst entsteht ein neuer Knoten (bei mehreren Treffern mit Hinweis „mehrdeutig“). Das Original kommt als weiterer Knoten „Originaltext <Datum>“ (`kind: source`) unter „Quellen“, bestehende Quellen bleiben unverändert; dieselbe Quelle mit demselben Datum zweimal abzulegen wird abgelehnt (Exitcode 3, nichts geschrieben). `relations` und `[[Notiz]]`-Verweise werden gesetzt, wenn ihr Ziel eindeutig ist, sonst steht ein Eintrag in `hinweise`. Eine fehlende Ziel-Map oder ein nicht auflösbarer Elternknoten lehnt den Aufruf ab (Exitcode 2). Rechte, Vorschlag/Freigabe, Protokoll und Undo wie beim Ablegen.
- A new meeting adds to an existing map instead of creating a second one: `bloommd-wiki agent ingest --in-map <path>` and the MCP tool `bloommd_ingest` with `inMap` take the same structured input as filing (original text, source reference with date, sections). If the parent of a section node already has exactly one child with the same title (case and punctuation do not matter), it is not created twice: the new children hang below it and its content stays unchanged; otherwise a new node is created (several matches come with an "ambiguous" hint). The original becomes one more node "Originaltext <date>" (`kind: source`) below "Quellen", existing sources stay unchanged; filing the same source with the same date twice is refused (exit code 3, nothing written). `relations` and `[[Note]]` links are set when their target is unambiguous, otherwise an entry in `hinweise` says so. A missing target map or an unresolvable parent refuses the call (exit code 2). Rights, proposal/approval, log and undo as for filing.

- Neue Planungsunterlage `docs/HOSTED-AGENT-EXECUTION.md` (Englisch): Sie beschreibt, wie gehostete Agent-Ausführung hinter denselben Schutzmechanismen liefe wie der lokale Weg — Ausführungsgrenzen, Wiederverwendung von `propose → approve → apply`, die sieben Pflicht-Schutzmaßnahmen, Berechtigungsmodell, Audit-Ereignisse, Fehlerfälle und Freigabe-Kriterien. Es ist reine Planung: Es wird nichts aktiviert, gehostete Agenten bleiben außerhalb der Beta, und am Verhalten der App ändert sich nichts.
- New planning document `docs/HOSTED-AGENT-EXECUTION.md` (English): it describes how hosted agent execution would run behind the same safeguards as the local path — execution boundaries, reuse of `propose → approve → apply`, the seven mandatory safeguards, permission model, audit events, failure modes and enablement criteria. It is planning only: nothing is enabled, hosted agents stay outside the beta, and the app's behaviour does not change.

- Quelländerungen im Wiki werden selbst erkannt: `bloommd-wiki status|lint <bundle> --sources <ordner>` liest den aktuellen Hash jeder zitierten lokalen Quelle (`sources[].resource`) direkt aus dem Quellordner, ohne handgepflegte JSON-Datei. Neu: der Befund `missing-source` für eine Quelle, deren Datei nicht mehr existiert (eigener Zähler `missingSourceFileCount`, getrennt von `missing-source-hash`); `http(s)`-Quellen werden nicht überwacht und sind kein Fehler. `bloommd-wiki watch <bundle> --sources <ordner> [--state <datei>] [--once]` meldet je geänderter Quelle die betroffenen Seiten (`--format json` je Zeile), fasst schnelle Mehrfachschreibvorgänge zusammen und liest unveränderte Dateien (gleiche Größe und Änderungszeit) nicht neu. `bloommd-wiki mcp <bundle> --sources <ordner>` lässt `knowledge_wiki_status` live rechnen; der Ordner kommt nur vom Start, nie vom Agenten. `/api/wiki` und `/wiki` lesen alternativ zur Hash-Datei `BLOOMMD_WIKI_SOURCES_DIR` und zeigen „Quelle geändert“ bzw. „Quelle fehlt“ je Seite und Zitat. Bestehende Felder und Befunde bleiben unverändert.
- Source changes in the Wiki are detected automatically: `bloommd-wiki status|lint <bundle> --sources <folder>` reads the current hash of each cited local source (`sources[].resource`) straight from the source folder, without a hand-kept JSON file. New: the `missing-source` finding for a source whose file no longer exists (its own counter `missingSourceFileCount`, separate from `missing-source-hash`); `http(s)` sources are not watched and are not an error. `bloommd-wiki watch <bundle> --sources <folder> [--state <file>] [--once]` reports the affected pages per changed source (`--format json` per line), merges quick successive writes and does not reread unchanged files (same size and modification time). `bloommd-wiki mcp <bundle> --sources <folder>` makes `knowledge_wiki_status` compute live; the folder comes from the start command only, never from the agent. `/api/wiki` and `/wiki` read `BLOOMMD_WIKI_SOURCES_DIR` as an alternative to the hash file and show "Source has changed" or "Source is missing" per page and citation. Existing fields and findings are unchanged.

- Template-Metadaten werden zur Laufzeit geprüft: Eine ungültige `metadata.json` (kaputtes JSON, fehlendes Feld, falscher Typ, Slug oder Dateipfad außerhalb des Template-Ordners, ungültige Version oder Vorschaubild-Pfad) wird abgelehnt und serverseitig mit Template und Feldpfaden protokolliert. `/api/templates`, `/templates` und `/demo` zeigen dann die übrigen Templates weiter, `/api/templates/<slug>`, der Markdown-Download und die Detailseite antworten mit 404 statt mit einem Fehler; Rohdaten und Pfade werden nicht ausgegeben. Die sechs vorhandenen Templates bleiben unverändert.
- Template metadata is validated at runtime: an invalid `metadata.json` (broken JSON, missing field, wrong type, slug or file path outside the template folder, invalid version or preview image path) is rejected and logged on the server with the template and field paths. `/api/templates`, `/templates` and `/demo` keep showing the remaining templates, while `/api/templates/<slug>`, the Markdown download and the detail page answer 404 instead of failing; raw data and paths are never shown. The six existing templates are unchanged.

- Learnings lassen sich per Einzelbefehl lesen und schreiben, mit JSON auf stdout: `bloommd-wiki agent search`, `read`, `create`, `append` und `stale` (`--vault <ordner>` oder `--cloud <url>`, dazu `--name <agent>`). Die Suche zeigt standardmäßig nur gültige Learnings (nicht veraltet, nicht abgelaufen; `--include-stale` nimmt sie mit) und begrenzt die Treffer (`--limit`, Standard 5). `create` legt ein Learning nach der Vorlage an und legt bei gleichem oder sehr ähnlichem Titel nichts an (Exitcode 3, Pfad des vorhandenen Learnings; dann `append`). `create` und `append` brauchen `--ticket <id>` und erlauben höchstens drei Schreibvorgänge je Ticket (danach Exitcode 4). Es gelten dieselben Rechte wie beim Wissens-MCP; Vorschläge gibt weiterhin nur ein Mensch frei. Grundlage des künftigen Adapters `wissen/bloommd` in `md-agents`; Details in `docs/LEARNINGS-ABLAGE.md`.
- Learnings can be read and written with single commands that print JSON on stdout: `bloommd-wiki agent search`, `read`, `create`, `append` and `stale` (`--vault <folder>` or `--cloud <url>`, plus `--name <agent>`). Search shows only valid learnings by default (not veraltet, not expired; `--include-stale` includes them) and caps the hits (`--limit`, default 5). `create` files a learning from the template and files nothing for the same or a very similar title (exit code 3, path of the existing learning; use `append` then). `create` and `append` need `--ticket <id>` and allow at most three writes per ticket (exit code 4 afterwards). The same rights as for the knowledge MCP apply; proposals are still approved by a person only. This is the basis of the future adapter `wissen/bloommd` in `md-agents`; details in `docs/LEARNINGS-ABLAGE.md`.

- `bloommd-wiki export <vault> <zielordner> [--overwrite]` erzeugt den statischen Wiki-Export (`index.html`, `wiki.json`, Maps) aus der Kommandozeile; `scripts/learnings-export.sh` führt ihn für die Learnings-Ablage täglich aus. Ein als Vault genutztes Volume mit `lost+found` bricht Export und Wissens-MCP nicht mehr mit `EACCES` ab. Die Ablage im Brand-Cluster beschreibt `docs/LEARNINGS-ABLAGE.md`.
- `bloommd-wiki export <vault> <target>` writes the static wiki export (`index.html`, `wiki.json`, maps) from the command line; `scripts/learnings-export.sh` runs it daily for the learnings store. A volume used as a vault with `lost+found` no longer makes the export and the knowledge MCP fail with `EACCES`. `docs/LEARNINGS-ABLAGE.md` describes the store in the brand cluster.

- Wiki-Vorschläge lassen sich auf `/wiki` der App prüfen: Der neue Bereich „Vorschläge“ listet offene Vorschläge mit Erstellzeit und betroffenen Seiten, zeigt je Seite ein Zeilen-Diff, die zitierten Quellen mit Hash-Status („Quelle unverändert“, „Quelle hat sich geändert“, „ohne Hash“) und warnt, wenn ein Vorschlag keine Quelle nennt. „Freigeben“ übernimmt die Änderung mit einem Klick unter dem Namen der angemeldeten Person (Name, sonst E-Mail; das Wiki-Log nennt ihn); „Verwerfen“ verlangt eine Begründung, ändert das Wiki nicht und behält den Vorschlag mit Begründung, Name und Zeitpunkt im Verlauf. Hat sich die Seite seit der Erstellung geändert, ist Freigeben gesperrt und die API lehnt mit 409 ab. Die Funktion ist aus, solange `BLOOMMD_WIKI_PROPOSALS_DIR` fehlt (Ordner mit `<id>.json`-Vorschlägen; zusätzlich `BLOOMMD_WIKI_DIR`); das öffentliche Wiki (`/api/wiki`, Marketing-Seite) bleibt unverändert und read-only.
- Wiki proposals can be reviewed on `/wiki` in the app: the new "Proposals" area lists open proposals with creation time and affected pages, shows a line diff per page, the cited sources with hash status ("Source unchanged", "Source has changed", "without hash") and warns when a proposal names no source. "Approve" applies the change in one click under the signed-in person's name (name, otherwise email; the Wiki log names them); "Discard" requires a reason, leaves the Wiki alone and keeps the proposal with reason, name and time in the history. When the page has changed since creation, approving is blocked and the API refuses with 409. The feature is off unless `BLOOMMD_WIKI_PROPOSALS_DIR` is set (a folder of `<id>.json` proposals; `BLOOMMD_WIKI_DIR` is needed as well); the public Wiki (`/api/wiki`, marketing page) stays unchanged and read-only.

- Der Wissens-MCP kann mehr lesen: `bloommd_get_node` liefert einen einzelnen Knoten mit Inhalt, Metadaten, Eltern, Kinder-IDs, Beziehungen und der `version` der Map (eine unbekannte Knoten-ID wird abgelehnt), `bloommd_backlinks` nennt die Maps und Knoten, die auf eine Map oder Note verlinken (nur aus Maps, die der Agent lesen kann), und `bloommd_changes` zeigt mit `since` (ISO-Datum oder -Zeitpunkt) nur Änderungen ab diesem Zeitpunkt; ein ungültiges `since` wird abgelehnt. Alle drei ändern nichts. Die Hilfe „Agent-Wissen“ (DE/EN) beschreibt zusätzlich die Einrichtung in Claude Code und listet die Werkzeuge.
- The knowledge MCP can read more: `bloommd_get_node` returns a single node with content, metadata, parent, child ids, relations and the map's `version` (an unknown node id is refused), `bloommd_backlinks` names the maps and nodes that link to a map or note (only from maps the agent can read), and `bloommd_changes` with `since` (ISO date or date-time) shows only changes from that point on; an invalid `since` is refused. All three change nothing. The “Agent knowledge” help (DE/EN) also describes the setup in Claude Code and lists the tools.

- Das Werkzeug `bloommd_stale` des Wissens-MCP antwortet ohne Treffer mit genau `NO_REPLY` (wie `bloommd-wiki agent stale`), damit Routinen still bleiben; die Liste bleibt unverändert. Die Suche behandelt `veraltet` und `ersetzt` auch in anderer Groß-/Kleinschreibung als ausgeschlossen
- The `bloommd_stale` tool of the knowledge MCP answers with exactly `NO_REPLY` when nothing is due (like `bloommd-wiki agent stale`), so routines stay silent; the list is unchanged otherwise. Search also treats `veraltet` and `ersetzt` as excluded in any letter case

- Agenten können einen einzelnen Knoten gezielt ändern: `PATCH /api/mindmaps/<datei>/nodes/<knoten-id>`, das Werkzeug `bloommd_update_node` im Wissens-MCP und `bloommd-wiki agent update-node` (auch mit `--cloud`) setzen Status, Inhalt, Metadaten und Verknüpfungen und hängen neue Unterknoten ans Ende; nicht genannte Felder bleiben. Es gelten dieselben Rechte wie bisher (lesen, vorschlagen oder direkt schreiben), die Änderung steht mit Agent und Quelle im Protokoll und wirkt auch, während jemand die Map bearbeitet. Eine unbekannte Knoten-ID wird mit 404 abgelehnt.
- Agents can change a single node precisely: `PATCH /api/mindmaps/<file>/nodes/<node-id>`, the `bloommd_update_node` tool of the knowledge MCP and `bloommd-wiki agent update-node` (also with `--cloud`) set status, content, metadata and relations and append new child nodes; fields that are not named stay as they are. The usual rights apply (read, propose or write directly), the change appears in the log with agent and source, and it works while someone is editing the map. An unknown node id is refused with 404.
- Agent-Zugriff ist an mehreren Stellen strenger: Ein abgelaufenes, widerrufenes oder unbekanntes Zugriffstoken wird überall mit 401 abgelehnt und fällt nicht mehr auf eine Browser-Sitzung oder anonymen Zugriff zurück; Rechte, Protokoll und Rückgängig der Agent-Tokens gehören nur dem Workspace-Besitzer, nicht jedem Mitglied. Umbenennen und Löschen durch einen Agenten tragen im Protokoll Quelle und Grund, und die Oberfläche „Agent-Zugriff“ zeigt Quelle, Grund und Werkzeug an.
- Agent access is stricter in several places: an expired, revoked or unknown access token is refused with 401 everywhere and no longer falls back to a browser session or anonymous access; rights, log and undo of agent tokens belong to the workspace owner only, not to every member. Renaming and deleting by an agent record source and reason in the log, and the "Agent access" screen shows source, reason and tool.
- Strukturierte Daten in der Cloud-Datenbank werden als Objekt statt als JSON-Text gespeichert: Frontmatter von Dokumenten (App und Live-Sync), gespeicherte Ansichten, Kindknoten-Vorschläge von Agenten sowie Stripe-Ereignisse und Abo-Datensätze. Serverseitige Abfragen, Indizes und Berichte (etwa auf den Titel im Frontmatter) sehen damit echte Felder. Bereits gespeicherte Dokumente, Ansichten und Vorschläge im alten Format werden weiter korrekt gelesen; eine Umwandlung der Bestandsdaten findet nicht automatisch statt.
- Structured data in the cloud database is stored as an object instead of JSON text: document frontmatter (app and live sync), saved views, agent child-node proposals, and Stripe events and subscription records. Server-side queries, indexes and reports (for example on the frontmatter title) now see real fields. Documents, views and proposals already stored in the old format are still read correctly; existing data is not converted automatically.
- Agent-Rechte in Cloud-Workspaces liegen auf dem Server statt auf dem Rechner des Agenten: Rechte, Vorschläge und Protokoll gelten je Agent-Token für jeden Rechner und Pod mit diesem Token und werden dort erzwungen. Ein veränderter Client erreicht nichts: `read` lehnt mit einer Meldung ab, die den Bereich nennt, `propose` legt nur einen Vorschlag an, `write` schreibt direkt und protokolliert. Auch Umbenennen, Löschen, Lese-Links und die Live-Bearbeitung brauchen `write` im Bereich. Der Workspace-Besitzer gibt Vorschläge im Browser unter „Agenten verwalten → Agent-Zugriff“ frei oder lehnt sie ab (mit optionalem Grund), setzt die Rechte je Agent und Bereich und nimmt Änderungen zurück; das Protokoll nennt den angemeldeten Namen. `bloommd-wiki agent setup|rights|proposals|approve|reject|log|undo --cloud` arbeiten auf denselben Server-Rechten. Alte lokale Rechte (`agent.json`) werden einmal angezeigt und nie stillschweigend übernommen (`agent migrate --apply|--discard`); lokale Altdaten bleiben liegen. Widerrufene Tokens werden beim nächsten Aufruf abgelehnt.
- Agent rights in cloud workspaces live on the server instead of the agent's machine: rights, proposals and log apply per agent token to every machine and pod using that token and are enforced there. A modified client gains nothing: `read` refuses with a message naming the area, `propose` only stores a proposal, `write` writes directly and logs. Renaming, deleting, read-only links and live editing need `write` in the area as well. The workspace owner approves or rejects proposals in the browser under “Manage agents → Agent access” (with an optional reason), sets rights per agent and area, and undoes changes; the log names the signed-in person. `bloommd-wiki agent setup|rights|proposals|approve|reject|log|undo --cloud` work on the same server rights. Old local rights (`agent.json`) are announced once and never carried over silently (`agent migrate --apply|--discard`); old local data stays in place. Revoked tokens are refused on their next call.
- Eine offene Live-Verbindung folgt jetzt dem Zugriffstoken: Wird das Token widerrufen oder läuft es ab, werden die nächsten Änderungen dieser Verbindung nicht mehr übernommen und der Client wird informiert. Senkt der Besitzer das Recht eines Agent-Tokens auf `read` oder `propose`, schreibt die Verbindung nicht weiter. Ein Ticket, das vor dem Widerruf ausgestellt wurde, öffnet keine Verbindung mehr.
- An open live connection now follows its access token: when the token is revoked or expires, the connection's next changes are no longer applied and the client is told. When the owner lowers an agent token's right to `read` or `propose`, the connection stops writing. A ticket issued before the revocation no longer opens a connection.
- Agent-Tokens schreiben nur noch in einem Cloud-Workspace: Läuft der Server mit `BLOOMMD_STORAGE_MODE=filesystem` bei konfigurierter Datenbank, lehnt `getMindmapStorage` jede ändernde Anfrage eines Agent-Tokens (Anlegen, Ersetzen, Umbenennen, Löschen, Knoten, Lese-Links) mit 403 ab, statt ohne Rechteprüfung in den Dateibereich des Nutzers zu schreiben. Die Ablehnung sitzt an einer Stelle für alle Routen. Das Gate lehnt Agent-Tokens ohne Workspace ab (nur Lesen). Lesen, andere Token-Arten und Sitzungen bleiben unverändert.
- Agent tokens write only in a cloud workspace: when the server runs with `BLOOMMD_STORAGE_MODE=filesystem` and a configured database, `getMindmapStorage` refuses every changing request of an agent token (create, replace, rename, delete, nodes, read-only links) with 403 instead of writing into the user's file area without a rights check. The refusal sits in one place for all routes. The gate refuses agent tokens without a workspace (read only). Reading, other token kinds and sessions are unchanged.
- Agent-Rechte gelten auch für Unterbereiche: `--area Learnings/dev-team=write` greift, es gilt der längste passende Bereich (Unterbereich vor übergeordnetem Bereich vor Standardrecht). Im Vault wie im Cloud-Workspace; dort steht der Bereich im Dateinamen (`Learnings › dev-team – Idee.md`).
- Agent rights also apply to sub-areas: `--area Learnings/dev-team=write` works, and the longest matching area wins (sub-area before parent area before default). In a vault as well as in a cloud workspace, where the area is part of the file name (`Learnings › dev-team – Idee.md`).
- Der Wissens-MCP kann Vertrauen und Veraltung von Maps schreiben und finden: `bloommd_create_map` und `bloommd_update_map` setzen `status`, `stale_after`, `verified` (wird an die Liste angehängt), `scope` und `replaced_by` im Frontmatter (geprüft, ohne den Rest der Map zu ändern; Version, Protokoll und Undo wie bisher). `bloommd_search` durchsucht zusätzlich Tags und Frontmatter, filtert nach `status`, `tag` und `scope`, nennt je Treffer Status, Ablaufdatum und Alter und lässt abgelaufene sowie als `veraltet` oder `ersetzt` markierte Maps weg, außer mit `includeStale`. Das neue Werkzeug `bloommd_stale` und `bloommd-wiki agent stale <ziel> [--days <n>]` listen Maps mit abgelaufenem `stale_after` (leer: `NO_REPLY`).
- The knowledge MCP can write and find trust and expiry of maps: `bloommd_create_map` and `bloommd_update_map` set `status`, `stale_after`, `verified` (appended to the list), `scope` and `replaced_by` in the frontmatter (validated, leaving the rest of the map untouched; version, change log and undo as before). `bloommd_search` also searches tags and frontmatter, filters by `status`, `tag` and `scope`, shows status, expiry date and age per hit, and leaves out expired maps and maps marked `veraltet` or `ersetzt` unless `includeStale` is set. The new tool `bloommd_stale` and `bloommd-wiki agent stale <target> [--days <n>]` list maps whose `stale_after` has passed (empty: `NO_REPLY`).
- Learnings haben ein festes Format: Die neue Agenten-Vorlage `learning` legt eine Map mit Symptom, Ursache, Regel, Beleg, Gilt für und Aufgaben an und trägt `type`, `status: neu`, `scope`, `source` und ein `stale_after`-Datum (heute + 90 Tage) ins Frontmatter ein. `bloommd-wiki lint` akzeptiert für diese Seiten die Status `neu`, `bestätigt`, `veraltet` und `ersetzt`. Format und Lebenszyklus stehen in `docs/LEARNINGS.md`, ein Beispielbündel in `docs/learnings-beispiel/`.
- Learnings have a fixed format: the new agent template `learning` creates a map with symptom, cause, rule, evidence, applies to and tasks, and writes `type`, `status: neu`, `scope`, `source` and a `stale_after` date (today + 90 days) to the frontmatter. `bloommd-wiki lint` accepts the statuses `neu`, `bestätigt`, `veraltet` and `ersetzt` for these pages. Format and lifecycle are described in `docs/LEARNINGS.md`, with an example bundle in `docs/learnings-beispiel/`.
- Die Warteliste ist beendet: Auf bloommd.io führen die Startseite, die Verfügbarkeitsübersicht und die Demo jetzt direkt zur Registrierung statt zu einem Anmeldeformular. Alte Wartelisten-Links (`/waitlist`, Bestätigungs- und Fehlerseite) leiten dauerhaft zur Registrierung weiter; neue Einträge entstehen nicht mehr. Abmeldelinks aus bereits versendeten Mails funktionieren weiter. Die Datenschutzerklärung beschreibt das Ende der Warteliste: einmalige Einladung zur Registrierung, Löschung 90 Tage danach.
- The waitlist has ended: on bloommd.io the landing page, availability overview and demo now lead straight to registration instead of a signup form. Old waitlist links (`/waitlist`, confirmation and error pages) permanently redirect to registration; no new entries are created. Unsubscribe links in mails already sent keep working. The privacy policy describes the end of the waitlist: one invitation to register, deletion 90 days later.
- Wiki-Bundles lassen sich als statischer Export teilen: ein Ordner mit OKF-Kopie, `wiki.json` und einem eingebauten Read-only-Browser (`index.html`), der ohne Server, Datenbank und Netzwerkzugriff läuft. Der Browser zeigt Seiten, Suche, Index, Log, Vertrauensstufen, Quellen und Medien auf Deutsch und Englisch, lässt sich per `?embed=1` in eine Seite einbetten und öffnet sich auch direkt aus dem Dateisystem. Dateien außerhalb des Bundles und Skript-fähige Dateitypen werden nicht mitgeliefert, sondern als „nicht verfügbar“ aufgeführt.
- Wiki bundles can be shared as a static export: a folder with an OKF copy, `wiki.json` and a built-in read-only browser (`index.html`) that runs without a server, database or network access. The browser shows pages, search, index, log, trust tiers, sources and media in German and English, embeds into another page with `?embed=1`, and also opens straight from disk. Files outside the bundle and file types that can carry script are not shipped but listed as “not available”.
- Registrierung ohne Einladung: Sobald die Closed Beta geöffnet wird, kann sich jede Person selbst registrieren, die E-Mail-Adresse bestätigen, sich anmelden und das Passwort zurücksetzen. Bei der Registrierung ist die Zustimmung zu Datenschutzerklärung und AGB Pflicht. Massenregistrierungen werden je E-Mail-Adresse und je Quelle begrenzt, unbestätigte Konten können sich nicht anmelden, und ein vorab für eine fremde Adresse gesetztes Passwort überlebt die Registrierung der echten Person nicht. Solange die Closed Beta geschlossen bleibt, gilt weiterhin die Einladung.
- Registration without an invitation: once the closed beta is opened, anyone can register themselves, confirm their email address, sign in and reset their password. Registration requires consent to the privacy policy and the terms. Mass registration is limited per email address and per source, unconfirmed accounts cannot sign in, and a password set in advance for someone else's address does not survive that person's own registration. While the closed beta stays closed, an invitation is still required.

## [Marketing 0.5.6] - 2026-10-25

- Eine zweisprachige News-Meldung führt zum öffentlichen BloomMD-Quellcode, zu Issues und Beiträgen und erklärt ELv2, das MIT-lizenzierte Obsidian-Plugin sowie den Stand historischer Releases. Die ältere Lizenzmeldung verweist auf den neuen Repo-Stand.
- Bilingual news links to the public BloomMD source code, issues and contributions, and explains ELv2, the MIT-licensed Obsidian plugin, and historical releases. The earlier license announcement links to the current repository status.
- Startseite, Download, Obsidian, Hilfe und Leistungsbeschreibung unterscheiden klar zwischen frei verfügbaren lokalen Betas, Cloud-Zugang auf Einladung und noch nicht veröffentlichten Apps.
- Landing, download, Obsidian, help and service pages distinguish publicly available local betas, invitation-only cloud access and apps without a public download.

## [Obsidian 0.7.1] - 2026-10-25

- Das Obsidian-Plugin erfüllt die Hinweise aus dem Community-Plugin-Review (Styles über `setCssStyles`, Fenster-sichere Timer und Typprüfungen, `createEl`, Einstellungen per `update()`, strengere Typprüfung). Keine Verhaltensänderung.
- The Obsidian plugin addresses the community plugin review findings (styles via `setCssStyles`, window-safe timers and type checks, `createEl`, settings refreshed with `update()`, stricter type checking). No change in behaviour.

## [Obsidian 0.7.0, Marketing 0.5.5, Web-App 0.5.1] - 2026-10-24

- BloomMD für Obsidian 0.7.0 läuft erstmals auch in Obsidian auf iPad, iPhone und Android: Handschrift mit dem Apple Pencil im Knoten und auf der Map, Lernfortschritt mit Wiederholungen, Agenten-Panel für Vorschläge von Agenten. Das Plugin bleibt unter der MIT-Lizenz; News DE/EN, Lizenzseiten von Website und Web-App entsprechend angepasst.
- BloomMD for Obsidian 0.7.0 is the first version that also runs in Obsidian on iPad, iPhone and Android: Apple Pencil handwriting in nodes and on the map, learning progress with reviews, and an agent panel for proposals from agents. The plugin stays under the MIT license; bilingual news and the license pages of the website and web app are updated accordingly.

## [Marketing 0.5.4] - 2026-10-24

- Desktop-Updates, Kommandozeilen-Tools und OpenClaw-Plugin-Downloads bleiben beim Wechsel des GitHub-Repositories verfügbar: Die Download-Proxys suchen zuerst im neuen Repository und verwenden bei fehlendem Release oder Asset das private Archiv.
- Desktop updates, command-line tools, and OpenClaw plugin downloads remain available during the GitHub repository move: the download proxies check the new repository first and use the private archive when a release or asset is missing.
- Ältere News verlinken keine künftig unerreichbaren privaten Git-Commits mehr; die Datumsangaben bleiben erhalten.
- Older news posts no longer link to private Git commits that will become unreachable; their dates remain intact.

## [Mobile 1.0.0] - 2026-10-22

- Erste Store-Version der BloomMD-App für iPad und iPhone (auch auf Macs mit Apple Silicon): Ordner aus der Dateien-App direkt bearbeiten, Handschrift mit dem Apple Pencil, Mind Map, Gliederung und Präsentation, optionale Anmeldung mit BloomMD-Konto.
- First store release of the BloomMD app for iPad and iPhone (also on Apple silicon Macs): edit folders from the Files app in place, Apple Pencil handwriting, mind map, outline and presentation, optional sign-in with BloomMD account.

## [Marketing 0.5.3] - 2026-10-22

- Zweisprachige News erläutern den ELv2-Lizenzwechsel, den unveränderten MIT-Status älterer Releases und die noch ausstehende Obsidian-Veröffentlichung.
- Bilingual news explains the ELv2 license change, the unchanged MIT terms of earlier releases, and the pending Obsidian release.

## [Marketing 0.5.2] - 2026-10-21

- Die deutsche und englische Lizenzseite erklärt die ELv2-Bedingungen für künftige Obsidian-Versionen und die unveränderte MIT-Lizenz bereits veröffentlichter Plugin-Versionen bis 0.5.12.
- The German and English license pages explain ELv2 for future Obsidian versions and preserve the MIT terms of plugin releases through 0.5.12.

## [Desktop 0.5.15] - 2026-10-21

- BloomMD Desktop 0.5.15 wird erstmals unter der Elastic License 2.0 (ELv2) ausgeliefert. App-Bundles und Pacman-Pakete enthalten den Lizenztext und den historischen MIT-Hinweis.
- Frühere Desktop-Versionen einschließlich 0.5.14 behalten ihre ursprüngliche MIT-Lizenz. Die Bedienung aus 0.5.14 bleibt erhalten.
- BloomMD Desktop 0.5.15 is the first desktop release under the Elastic License 2.0 (ELv2). App bundles and Pacman packages contain the license text and the historical MIT notice.
- Earlier desktop versions, including 0.5.14, retain their original MIT license. The interactions from 0.5.14 remain available.

## [Marketing 0.5.1] - 2026-10-21

- Deutsch- und englischsprachige News und Desktop-Hilfe erklären die Knotenbedienung in Desktop 0.5.14. Ein echter nativer Screenshot zeigt das Inline-Umbenennen.
- German and English news and desktop help explain node interaction in Desktop 0.5.14. A real native screenshot shows inline renaming.
- Der Quellcode dieses Release-Stands steht unter ELv2; frühere veröffentlichte Versionen und das separat veröffentlichte Obsidian-Plugin behalten ihre MIT-Lizenz.
- This release's source code uses ELv2; earlier published versions and the separately released Obsidian plugin retain their MIT license.

## [0.5.14] - 2026-10-21

- Die Mindmap bleibt beim Auswählen sichtbarer Knoten an ihrer Position. Tastaturnavigation macht nur Knoten außerhalb des sichtbaren Bereichs sichtbar.
- Doppelklick oder **R** benennt einen Knoten in bearbeitbaren Dateien um. **Enter** bestätigt, **Escape** verwirft; der Fokus kehrt zum Knoten zurück. Ressourcen öffnen über ihre eigene Aktion.
- Neue Kindknoten werden vor der Titelbearbeitung sichtbar. In der schreibgeschützten Workspace-Übersicht führt eine eigene Aktion zur Quelldatei.
- **Cmd/Ctrl+I** und **Cmd/Ctrl+K** funktionieren auch im Editor. Eine aktualisierte Hilfe erklärt Shortcuts und Schreibschutz auf Deutsch und Englisch.
- Sicherheitsupdate für Vite im Desktop-Build.
- Selecting a visible node leaves the map in place. Keyboard navigation reveals a node only when it lies outside the viewport.
- Double-click or **R** renames a node in an editable file. **Enter** confirms, **Escape** cancels, and focus returns to the node. Resources open through their own action.
- New child nodes become visible before title editing. The read-only workspace overview offers a separate action to open the source file.
- **Cmd/Ctrl+I** and **Cmd/Ctrl+K** also work in the editor. Updated German and English help explains shortcuts and read-only mode.
- Security update for Vite in the desktop build.

## [0.5.0] - 2026-10-19

- Lese-Links: Cloud-Maps lassen sich ohne Konto ansehen (Map oder Gliederung, nur lesend, 1–90 Tage gültig, jederzeit widerrufbar). Geteilt werden nur Titel, sichtbarer Text und Aufgaben-Infos; Suchmaschinen indexieren geteilte Maps nicht.
- Aufgaben bekommen Fälligkeit und Verantwortliche, Entscheidungen ihren Stand – im Knoten-Editor, auf der Map und im Lese-Link.
- Obsidian-Links und eingebettete Zeichnungen bleiben beim Öffnen eines Knotens im Editor erhalten.
- Sicherheitsupdates für Abhängigkeiten; Zugriffstoken lassen sich auf Workspaces und Lesen/Schreiben begrenzen.
- Read-only links: cloud maps can be viewed without an account (map or outline, read only, valid for 1–90 days, revocable at any time). Only titles, visible text and task details are shared; search engines do not index shared maps.
- Tasks get due dates and owners, decisions their state – in the node editor, on the map and in read-only links.
- Obsidian links and embedded drawings stay intact when a node is opened in the editor.
- Security updates for dependencies; access tokens can be limited to workspaces and to read or write.

## [Marketing 0.4.23] - 2026-10-12

- Deutsche und englische News sowie Desktop-Hilfe zu den Speicher- und Titelkorrekturen in Desktop 0.5.13, mit echtem Screenshot der nativen Ordneransicht.
- German and English news and desktop help cover the saving and title fixes in Desktop 0.5.13, with a real screenshot of the native folder overview.

## [0.5.13] - 2026-10-12

- Neue Markdown-Dateien bleiben beim Anlegen und Bearbeiten aktiv. Verzögerte Ordner-/Dateiaktualisierungen verwerfen keine ungespeicherten Knoten mehr; die Ordnerübersicht ist schreibgeschützt.
- Gleichnamiger Dateititel und eine einzelne erste Überschrift erscheinen in der Ordnerübersicht nur einmal. Die Markdown-Datei und ihre Unterknoten bleiben erhalten.
- Newly created Markdown files remain active while editing. Delayed folder/file updates no longer discard unsaved nodes; the folder overview is read-only.
- Matching file titles and a single top-level heading appear once in the folder overview. Markdown content and child nodes are preserved.

## [Marketing 0.4.22] - 2026-10-08

- Öffentliche News und Hilfe sind explizit zur Indexierung freigegeben; die Sitemap enthält die deutsch- und englischsprachigen Hilfeseiten.
- Public news and help explicitly allow indexing; the sitemap includes German and English documentation pages.

## [Marketing 0.4.21] - 2026-10-08

- Die englische Desktop-0.5.12-Meldung verlinkt wieder auf die englische Download-Seite und Desktop-Hilfe.
- The English Desktop 0.5.12 announcement now links to the English download page and desktop help.

## [Marketing 0.4.20] - 2026-10-08

- Deutsch- und englischsprachige News und Desktop-Hilfe erklären die kompakte Workspace-Ansicht und Hintergrundberechnung des Desktop-Releases 0.5.12.
- German and English news and desktop help explain the compact workspace view and background layout shipped in Desktop 0.5.12.

## [0.5.12] - 2026-10-08

- Große lokale Workspaces starten kompakt auf Datei-/Ordnerebene. Überschriften lassen sich aufklappen; das Layout entsteht im Hintergrund und die Ansicht rendert nur sichtbare Knoten.
- Unveränderte Parsergebnisse und Workspace-Beiträge werden wiederverwendet. Externe Änderungen, neue Dateien und Löschungen einschließlich `.markdown` werden zuverlässig aktualisiert; die Pfeilnavigation öffnet eingeklappte Eltern.
- Large local workspaces open as a compact file/folder overview. Expand files to reveal headings; layout runs in the background and the canvas renders visible nodes only.
- Unchanged parse results and workspace contributions are reused. External edits, additions and removals, including `.markdown` files, refresh reliably; arrow navigation expands collapsed parents.

## [0.5.11] - 2026-10-06

- Vorhandene Markdown-Dateien mit Sonderzeichen wie `?`, `"` und `*` lassen sich auf macOS/Linux öffnen. Einzelne unlesbare Dateien werden sichtbar gemeldet, während die übrigen Dateien verfügbar bleiben. Neu erzeugte Dateinamen vermeiden reservierte Windows-Gerätenamen.
- Existing Markdown filenames containing punctuation such as `?`, `"` and `*` can now be opened on macOS/Linux. Unreadable entries are reported visibly while the remaining files stay available. Newly generated filenames avoid reserved Windows device names.

## [0.5.10] - 2026-10-05

- Update-Testziel für die korrigierte Desktop-Version 0.5.9. Der Fix für den Installationsknopf ist enthalten; keine weitere Verhaltensänderung.
- Update test target for the corrected desktop version 0.5.9. Includes the installation-button fix, with no further behavior changes.

## [0.5.9] - 2026-10-05

- Der Installationsknopf wird nach einem fertigen Update-Download wieder freigegeben. Versionen 0.5.7/0.5.8 benötigen einmalig die Installation per DMG.
- The installation button is now enabled after an update download completes. Versions 0.5.7/0.5.8 require a one-time DMG installation.

## [0.5.8] - 2026-10-05

- Signierter und notarisierter Desktop-Patch als Ziel für den In-App-Update-Test von 0.5.7 auf 0.5.8. Keine Änderungen am App-Verhalten.
- Signed and notarized desktop patch for testing the in-app update from 0.5.7 to 0.5.8. No changes to application behavior.

## [0.5.7] - 2026-10-05

### macOS-Distribution / macOS distribution

- Release-Builds verlangen Developer-ID-Signierung und Apple-Notarisierung für App, Installer
  und DMG. Ein eigenes Gate prüft auch das Auto-Update-Archiv, bevor Artefakte veröffentlicht werden.
- Release builds require Developer ID signing and Apple notarization for the app, installer
  and DMG. A dedicated gate also verifies the auto-update archive before publishing artifacts.
- Signierte Installer verwenden einen nativen Launcher mit Installationshinweis.
- Signed installers use a native launcher with installation guidance.

## [0.4.19] - 2026-10-05

- Die deutsch- und englischsprachigen Download- und Hilfeseiten beschreiben die Installation des signierten macOS-Desktop-Releases 0.5.7.
- German and English download and help pages describe installation of the signed macOS desktop release 0.5.7.

## [0.5.6] - 2026-09-22

### Verbesserungen

- Shared Mode erklärt den Zustand einer bewusst geteilten lokalen Datei konsistent als
  **verbunden**, **offline**, **Konflikt** oder **Zugriff entzogen**. Die Freigabe bleibt pro Datei
  sichtbar und kann jederzeit getrennt werden.
- Lokale OpenClaw-Agenten arbeiten weiterhin nur für ihren explizit zugewiesenen Knoten. Ihre
  Ergebnisse bleiben Vorschläge und werden erst nach einer menschlichen Entscheidung übernommen.

### Fehlerbehebungen

- Die Aktion zum bewussten Teilen einer lokalen Datei bleibt auch nach dem Öffnen und Wechseln von
  Dateien erreichbar.

## [0.4.18] - 2026-09-22

### Verbesserungen

- App, Marketing und Sync tragen dieselbe Hosted-Release-Version für den dokumentierten Shared-
  Mode- und OpenClaw-Workflow.
- Die öffentliche Hilfe und die Release-Kommunikation erklären die Dateigrenze beim Teilen, die
  Rollen im Workspace und den prüfbaren Agenten-Vorschlagsablauf auf Deutsch und Englisch.

## [0.5.5] - 2026-09-14

### Neue Funktionen

- Lokale Markdown-Dateien können gezielt mit einem BloomMD-Workspace geteilt werden. Andere
  Dateien und Ordner des lokalen Vaults bleiben dabei privat.
- Die Desktop-App zeigt den Freigabestatus direkt an der geöffneten Datei und bietet die Freigabe
  auch aus dem Dateimenü an.

### Verbesserungen

- Die Karte wird beim Öffnen einer anderen Datei wieder passend eingepasst.
- Bei abweichenden lokalen und Cloud-Ständen erklärt BloomMD den Konflikt verständlich und lässt
  bewusst zwischen lokaler und Cloud-Version wählen.

### Fehlerbehebungen

- Eine erstmalig geteilte, sonst unveränderte Datei erzeugt keinen falschen Konflikt mehr, nur
  weil BloomMD technische IDs oder Zeitstempel ergänzt.

## [0.4.12] - 2026-09-12

### Neue Funktionen

- Die optionalen Kommandozeilen-Tools sind klar getrennt: `bloommd-agent` für kontrollierte
  lokale Agenten-Automatisierung und `bloommd-wiki` für Markdown-, OKF- und MCP-Workflows.
- Beide Tools werden als native, versionierte Binaries für macOS auf Apple Silicon sowie Linux auf
  x86_64 und ARM64 veröffentlicht; die Downloads enthalten SHA-256-Prüfsummen.

### Verbesserungen

- Das OpenClaw-Plugin enthält die Agent-Runtime weiterhin vollständig. Für normales Pairing und
  Arbeiten mit Agenten ist kein zweiter Download nötig.
- BloomMD.io dokumentiert Installation und Automatisierung auf Deutsch und Englisch; News und
  Blog erklären die Rollen der drei Komponenten anhand einer eigenen Grafik.

### Fehlerbehebungen

- Die geschlossene Beta-Hilfe verweist für Wiki-Workflows nicht mehr auf einen Repository-Bun-Befehl,
  sondern auf die öffentlich installierbare `bloommd-wiki`-Binary.

## [0.4.11] - 2026-09-11

### Verbesserungen

- OpenClaw-Plugin `0.4.2` übergibt dem lokalen Skill den bereits autorisierten Knotenauftrag
  strukturiert und nur für die Dauer dieses einen Turns.
- Die Agentenabnahme ist nun verpflichtend in CI: Browser-Interaktion am Knoten und der
  vollständige Docker-Compose-Durchlauf werden vor einer Veröffentlichung geprüft.

## [0.4.10] - 2026-09-11

### Fehlerbehebungen

- Die OpenClaw-Anleitung verwendet für den einmaligen Pairing-Code jetzt den tatsächlich
  unterstützten privaten Dateiübergabepfad, statt den Code über die Kommandozeile sichtbar zu machen.
- Docker-Compose- und Kubernetes-Beispiele referenzieren das aktuelle veröffentlichte
  OpenClaw-Plugin `0.4.1`.

## [0.4.9] - 2026-09-11

### Fehlerbehebungen

- Der aktuelle OpenClaw-Plugin-Download funktioniert wieder: `latest.tgz` und konkrete
  Versionsarchive verwenden nun denselben, eindeutigen Route-Handler.

## [0.4.8] - 2026-09-11

### Verbesserungen

- OpenClaw-Plugin-Downloads sind nun eindeutig versioniert: `latest.tgz` wird innerhalb einer
  Minute aktualisiert, während eine konkrete Versions-URL dauerhaft unveränderlich bleibt.
- Der veröffentlichte Plugin-Smoketest prüft sowohl die aktuelle als auch die erwartete
  Archivversion, bevor das Plugin in einem frischen OpenClaw-Container installiert wird.

## [0.4.7] - 2026-09-11

### Neue Funktionen

- OpenClaw kann als lokales, überprüfbares Workspace-Mitglied verbunden werden und arbeitet
  auf ausgewählten Mindmap-Knoten.
- Vorschläge werden im jeweiligen Kontext angezeigt, können geprüft und erst danach in den
  Workspace übernommen werden.
- Das OpenClaw-Plugin steht als installierbares Paket bereit; Docker- und Kubernetes-Setups
  sind dokumentiert.

### Qualität und Dokumentation

- E2E-Tests decken Pairing, nodebegrenzte Aufträge, Echtzeitstatus, Vorschläge und Übernahme ab.
- bloommd.io enthält eine deutsch- und englischsprachige, bebilderte Anleitung sowie Blog-Beiträge.

## [0.4.6] - 2026-09-07

### Verbesserungen

- Die Footer-Version auf bloommd.io ist jetzt eindeutig als `Marketing-Version` gekennzeichnet.
- Die Marketing-Version wird ohne Verwechslung mit der Desktop-App angezeigt.

## [0.4.5] - 2026-09-07

### Neue Inhalte

- Die BloomMD-Blogserie ist jetzt auf Deutsch und Englisch vollständig ausgebaut.
- Neue Beiträge behandeln Local-first, Wissensworkflow, Obsidian-Integration und Zusammenarbeit
  ohne Format-Lock-in.

### Verbesserungen

- Die Artikel enthalten eigene BloomMD-Visuals, Bildunterschriften und passende Alternativtexte.
- Der bestehende Beitrag zu Markdown als visueller Map wurde redaktionell erweitert.

## [0.4.4] - 2026-09-07

### Neue Inhalte

- Die News-Seite enthält jetzt zweisprachige Beiträge zu Navigation, Plausible, Omarchy/Linux,
  sicheren Linux-Serverprofilen, Remote-Löschen und der Linux-Lesbarkeit.
- Historische News sind den tatsächlichen Releases und Commit-Daten zugeordnet.

## [0.5.4] - 2026-09-07

### Verbesserungen

- Die BloomMD-Desktop-App bleibt unter Omarchy/Linux auch bei 160 % Skalierung gut lesbar.
- Linux verwendet einen lokalen, zuverlässigen Font-Stack und verbessert die Kontraste für
  sekundäre Mindmap-Texte.

## [0.4.3] - 2026-09-07

### Behobene Fehler

- Server-Dokumente können jetzt auch bei einer aktiven Sync-Verbindung gelöscht werden.
- Nach einem fehlgeschlagenen Löschversuch wird die Verbindung automatisch wiederhergestellt.

## [0.5.3] - 2026-09-05

### Verbesserungen

- Linux- und Omarchy-Nutzer können Serverprofile jetzt sicher speichern und nach einem Neustart
  wiederverwenden.
- Die Zugangstokens bleiben im systemweiten Secret Service; die BloomMD-Einstellungsdatei enthält
  weiterhin keine geheimen Zugangsdaten.

### Behobene Fehler

- Der Linux-Dialog meldet nicht mehr pauschal, dass sichere Speicherung nur unter macOS möglich
  ist.
- Fehlt der Linux-Schlüsselbund oder ist er gesperrt, erscheint eine konkrete Handlungsanweisung.

## [0.5.2] - 2026-09-05

### Behobene Fehler

- Die Linux-Bundle-Prüfung erwartet keine Metadatei mehr, die Electrobun erst nach dem
  `postBuild`-Staging erzeugt. Native Linux-Bundles können dadurch wieder als Pacman-Quelle
  verifiziert und veröffentlicht werden.

## [0.5.1] - 2026-09-05

### Behobene Fehler

- Das Linux-/Omarchy-Pacman-Paket startet wieder korrekt. Es verwendet jetzt das native
  Electrobun-Bundle statt des nicht direkt startbaren Self-Extractors.
- Die installierten Linux-App-Dateien werden mit korrekten Systemrechten ausgeliefert.

### Qualität

- Der Pacman-Workflow prüft Installation, echten App-Start unter Xvfb, Dateirechte und
  Deinstallation.

## [0.5.0] - 2026-09-05

### Neue Funktionen

- BloomMD Desktop kann jetzt als native Linux-App für x86_64 und ARM64/aarch64 gebaut und als
  Arch-/Pacman-Paket installiert werden.
- Linux registriert Markdown-Dateien und das `bloommd://`-URI-Schema über die Desktop-App.

### Verbesserungen

- Die öffentlichen Linux-Release-Assets tragen eine eindeutige Versions- und
  Architekturkennzeichnung: `bloommd-desktop-<version>-x86_64.pacman` bzw.
  `bloommd-desktop-<version>-aarch64.pacman`.
- Installations-, Start-, Update- und Deinstallationshinweise für den Linux-Beta-Track sind
  dokumentiert.

### Qualität

- Native Linux-Builds für x86_64 und aarch64 werden in CI erzeugt.
- Pacman-Metadaten sowie Installation und Entfernung des x86_64-Pakets werden automatisiert
  geprüft.

### Beta-Hinweis

- Linux ist ein separater Beta-Track; der manuelle Omarchy-4-Hardwaretest steht noch aus.

## [0.4.0] - 2026-08-30

### Neue Funktionen

- Zwischen der Workspace-Übersicht und der zuletzt geöffneten Markdown-Datei kann jetzt in beide
  Richtungen navigiert werden.
- Die Navigation funktioniert in Web-App und macOS-App über sichtbare Zurück-/Vorwärts-Schaltflächen.

### Verbesserungen

- `Cmd/Ctrl + ←` führt zur Workspace-Übersicht zurück; `Cmd/Ctrl + →` öffnet die zuletzt geöffnete
  Datei wieder.
- Ordner-, Remote- und Fokuskontext bleiben beim Wechsel erhalten, damit der Arbeitsfluss nicht
  verloren geht.
- Die Tastaturkürzel sind in der Hilfe für Deutsch und Englisch dokumentiert.

## [0.3.2] - 2026-08-29

### Release-Qualität

- Sichtbare Versions-Fallbacks in Hilfe und Build-Info entsprechen jetzt der ausgelieferten
  Version `0.3.2`.
- Die Versionsanzeige bleibt auch dann konsistent, wenn keine externen Build-Metadaten verfügbar
  sind.

## [0.3.1] - 2026-08-29

### macOS-App

- Nach dem Öffnen eines Ordners und einer darin enthaltenen Markdown-Datei kann jederzeit klar
  zur Workspace-Übersicht zurückgewechselt werden.
- Der lokale Ordner bzw. aktive Remote-Workspace bleibt beim Wechsel erhalten.
- Nach der Rücknavigation werden Fokus und Seitenleistenkontext wiederhergestellt.
- Die Rücknavigation ist neben dem sichtbaren Button auch über `Cmd/Ctrl + [` erreichbar.

### Behobene Fehler

- Die macOS-App verliert beim Wechsel von einer Datei zurück zur Workspace-Übersicht nicht mehr
  den Navigationskontext.
- Ein fehlgeschlagener Ladevorgang überschreibt die aktuell geöffnete Datei nicht mehr.

## [0.3.0] - 2026-08-29

### Neue Funktionen

- Mehrere Serververbindungen können jetzt als benannte Profile gespeichert und direkt gewechselt
  werden. Der Wechsel zwischen lokalem Workspace und mehreren Servern verliert die Zugangsdaten
  nicht mehr.

### Verbesserungen

- Das Umbenennen einer Mindmap hält Dateiname und Titel in Web-App und macOS-App konsistent.
- Nach dem Umbenennen bleibt die aktuelle Mindmap fokussiert und wird in der Dateiliste automatisch
  sichtbar gemacht — auch wenn sie vorher nicht geöffnet war.
- Der Sync-Server verwendet seine eigene Versionsspur für Persistenz und wartet vor einem Rename
  auf ausstehende Schreibvorgänge.

### Qualität

- Rename-, Fokus-, Dateipfad-, Sync- und Verbindungsprofil-Szenarien sind durch Regressionstests
  abgesichert.

## [0.2.13] - 2026-08-29

### Analyse und Datenschutz

- Plausible wird direkt von der selbst gehosteten Instanz geladen. Dadurch erhält die GeoIP-Auswertung
  die echte Besucher-IP statt einer Infrastruktur- oder Proxy-IP.
- Die Marketingseite bleibt cookielos; der bisherige Analytics-Consent-Dialog wird für Plausible nicht
  benötigt.

### Sicherheit und Qualität

- Script- und Event-Endpunkte sind auf den vertrauenswürdigen Plausible-Host begrenzt.
- Die veralteten `bloommd.io/_plausible/...`-Pfade sind nicht mehr verfügbar.

## [0.2.12] - 2026-08-28

### Neue Inhalte

- Die Marketingseite erhält zweisprachige `/blog`- und `/news`-Bereiche mit Artikelseiten,
  RSS-Feeds und Sitemap-Einträgen.
- Öffentliche News können aus Release-Informationen als redaktionell prüfbare Entwürfe erzeugt
  werden; sensible oder personenbezogene Inhalte werden dabei nicht übernommen.

### Zusammenarbeit und Speicherung

- Cloud-Mindmaps verwenden den Sync-Server jetzt als einzige Schreibinstanz für Anlegen,
  Speichern, Umbenennen und Löschen.
- Versionsprüfungen und eindeutige Fehlerzustände verhindern, dass REST- oder Offline-Aktionen
  aktive Yjs-Sitzungen und neuere Änderungen überschreiben.
- Lokale Änderungen bleiben bei einer Wiederverbindung erhalten und werden beim nächsten
  Sync-Handshake wieder angeboten.

### Editor und Zugänglichkeit

- Die Markdown-Formatierung im MDX-Editor stellt Listenebenen, Überschriften, Tabellen,
  Codeblöcke, Blockquotes und Checklisten wieder konsistent dar.
- Fokus, Tastatur-Navigation und semantische Node-Struktur sind für Web und Desktop weiter
  vereinheitlicht.

### Qualität

- Sync-Server-, API-, UI-, Marketing- und Editor-Regressionstests decken aktive Räume,
  Versionskonflikte, Reconnects und die neuen Content-Routen ab.

## [0.2.11] - 2026-08-27

### Verbesserungen

- Die Tastatursteuerung hält den Fokus nach Umbenennen, Löschen, Rückgängig und Wiederholen am
  erwarteten Node.
- Nach dem Löschen eines Nodes wird automatisch der Eltern-Node fokussiert; neue Nodes bleiben bis
  zum Abschluss der Bearbeitung eindeutig aktiv.
- Die Verbindungswiederherstellung im gemeinsamen Workspace bleibt stabil und zeigt den aktuellen
  Verbindungszustand zuverlässig an.

### Qualität

- Keyboard-first-Navigation, sichtbarer Fokus und semantische Node-Auswahl sind für Web und Desktop
  vereinheitlicht.

## [0.2.10] - 2026-08-26

### Behobene Fehler

- Beim Anlegen eines Child- oder Geschwister-Nodes öffnet und fokussiert sich der Umbenennen-Editor
  jetzt auch zuverlässig nach vorherigen Löschaktionen.
- Die Node-Erstellung per `Tab` und `Enter` verwendet jetzt den aktiven Sprachkontext statt eines
  hartcodierten englischen Platzhalters.

## [0.2.9] - 2026-08-25

### Verbesserungen

- Die Anwesenheitsanzeige für gemeinsam geöffnete Mindmaps bleibt während automatischer
  Verbindungswiederherstellungen sichtbar.
- Neue Nodes und neu angelegte Markdown-Dateien aktivieren den Umbenennen-Editor direkt.
- Das Desktop-Feedback-Feld erhält beim Öffnen und nach kurzzeitigem Fokusverlust zuverlässig den
  Eingabefokus.

### Behobene Fehler

- Web-Feedback kann jetzt auch ohne Screenshot gesendet werden; Screenshots bleiben optionale
  Anhänge zur besseren Analyse.
- Feedback-Entwürfe werden verzögert gespeichert, damit Eingaben nicht durch synchrone Persistenz
  beeinträchtigt werden.

## [0.2.8] - 2026-08-25

### Verbesserungen

- Markdown-Mindmap-Vorschauen auf der Landingpage verwenden jetzt dieselbe visuelle Sprache wie die BloomMD-App.
- Hero-, Use-Case- und Feature-Vorschauen werden aus echten Markdown-Strukturen erzeugt und bleiben in DE und EN konsistent.

### Qualität

- Gemeinsame read-only Preview-Komponente mit BloomMD-Grid, Nodes, Kanten und Fokus-Styling ergänzt.
- Responsive Marketing-Prüfungen für Desktop und Mobile erweitert.

## [0.2.7] - 2026-08-24

### Verbesserungen

- Die native macOS-App übernimmt die gewählte Sprache jetzt auch im macOS-Anwendungsmenü.
- Desktop- und gemeinsame UI-Flächen verwenden konsistente deutsche und englische Übersetzungen.
- Feedback-, Workspace-, Ressourcen-, Konflikt- und Verbindungsdialoge wurden sprachlich vereinheitlicht.

### Qualität

- Neue Sprach- und Menüverträge verhindern fehlende Übersetzungsschlüssel und gemischte Sprachen.
- Hosted-Web-App und Marketing bleiben unverändert auf `0.2.5`.

## [0.2.6] - 2026-08-23

### Desktop-Testrelease

- Neue macOS-arm64-App zum realen Test des Electrobun-Updatepfads von `0.2.5` auf `0.2.6`.
- Hosted-Web-App und Marketing bleiben unverändert auf `0.2.5`.

## [0.2.5] - 2026-08-23

### Behobene Fehler

- Der First-Party-Desktop-Proxy funktioniert auch bei privaten GitHub-Releases: Marketing löst
  Stable-Artefakte serverseitig über die GitHub-API mit einem Runtime-Token auf; der Token und die
  GitHub-URL bleiben vollständig außerhalb des Clients.
- Die Middleware blockiert den internen Proxy-Route-Pfad nicht mehr nach dem Rewrite.
- Der DMG-Link der Produktions-ConfigMap zeigt auf `/_desktop-updates` statt auf den veralteten
  statischen Beta-Artefaktpfad.

### Verbesserungen

- Die Downloadseite bezeichnet die laufende Desktop-Version eindeutig als `Version` und liest sie
  aus dem veröffentlichten Stable-Manifest.

## [0.2.4] - 2026-08-23

### Neue Features

- Die macOS-App prüft stabile Updates, lädt sie mit Fortschrittsstatus herunter und installiert sie
  erst nach ausdrücklicher Bestätigung im About-Dialog.
- Desktop-Update-Artefakte und der manuelle DMG-Download sind über einen First-Party-Proxy unter
  `bloommd.io` erreichbar; die GitHub-Release-URL bleibt aus der App heraus.
- Stable-Desktop-Artefakte werden durch einen tagbasierten GitHub-Actions-Workflow gebaut, geprüft
  und als GitHub Release veröffentlicht.

### Verbesserungen

- Die Marketing-Downloadseite ermittelt Version und Update-Hash live aus dem Stable-Manifest und
  verwendet denselben Proxy wie der Desktop-Updater.
- Hosted-Packages und Desktop-Bausteine verwenden gemeinsam die Release-Version `0.2.4`.

### Bekannte Einschränkungen

- Der macOS-Build ist für die Closed Beta ad-hoc signiert und noch nicht Developer-ID-signiert bzw.
  notarisiert. Die vollständige Vertrauenskette bleibt Bestandteil von [Archiv #282](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/282).

## [0.2.3] - 2026-08-23

### Neue Features

- Der About-Dialog ist jetzt auch in der Web-App verfügbar und zeigt Produktkontext, eingesetzte
  Technologien, rechtliche Links, den M1-Beta-Status sowie technische Build-Details.

### Verbesserungen

- Der Web-About-Dialog ist auf Deutsch und Englisch verfügbar, theming-kompatibel, responsiv und
  per Tastatur sowie Screenreader zugänglich.

## [0.1.0-beta.11] - 2026-08-23

### Neue Features

- Der macOS-About-Dialog zeigt BloomMD-Branding, eingesetzte Technologien, rechtliche Links, den M1-Beta-Status und technische Build-Details.

### Verbesserungen

- Git-SHA, Git-Tag, Build-Zeitpunkt und Versionsnummer werden im nativen macOS-Artefakt bereits beim CI-Build eingebettet und sind dadurch auch beim Start aus dem Finder verfügbar.

## [0.2.2] - 2026-08-23

### Verbesserungen

- Plausible-Analytics auf der Marketing-Seite läuft cookielos ohne Einwilligungsdialog; Pageviews und erlaubte, inhaltsfreie Events werden weiterhin über den First-Party-Proxy erfasst.
- Cookie- und Datenschutzhinweise erklären die cookielose Plausible-Konfiguration auf Deutsch und Englisch.

### Behobene Fehler

- Frühe Demo-Events gehen nicht mehr verloren, wenn das Plausible-Script noch lädt.

## [0.2.1] - 2026-08-22

### Neue Features

- BloomMD ist auf den öffentlichen App- und Marketing-Flächen durchgängig auf Deutsch und Englisch verfügbar – einschließlich Authentifizierung, Einladungen, Recovery, Account, Beta, Wiki, Dokumentation, Templates und Waitlist.
- Geteilte BloomMD-Links verwenden ein korrektes 1200×630-Social-Preview mit echtem BloomMD-Logo und echtem Demo-Screenshot.

### Verbesserungen

- Light- und Dark-Theme sind für App, Authentifizierung, Einladungen, Legal-Flächen, Marketing, Demo, Docs, Templates und Waitlist konsistent umgesetzt.
- Social-Media-Metadaten, Sprachvarianten und route-spezifische Canonicals sind für öffentliche Seiten konsistent.
- Web- und macOS-App bündeln Dokument-, Datei-, Suche- sowie Hilfe-/Einstellungsaktionen in einer gemeinsamen, übersetzten Toolbar; doppelte Header-Icons entfallen.
- Theme-, Lokalisierungs-, Accessibility- und Release-Contract-Tests schützen Desktop- und Mobile-Flächen sowie Fehler-, Erfolgs- und Formularzustände.

### Behobene Fehler

- Feste helle Oberflächen, Form Controls und kontrastarme Textfarben bleiben im Dark Mode nicht mehr als Light-Theme-Reste sichtbar.
- Englische Fehlermeldungen, Bestätigungs-E-Mails und Beta-Einladungslinks erhalten den korrekten Sprachkontext.

## [0.2.0] - 2026-08-21

### Neue Features

- Einheitlicher Authentifizierungs- und Einladungsablauf für Registrierung, Login, E-Mail-Bestätigung, Passwort-Wiederherstellung und Beta-Einladungen.
- Workspace-Einladungen können explizit angenommen werden; Einladungskontext bleibt beim Wechsel zwischen Login und Signup erhalten.
- Waitlist-Administration mit erneuter Bestätigungs-Mail, Beta-Einladung und bestätigungspflichtigem Löschen einzelner Waitlist-Einträge.

### Verbesserungen

- Authentifizierungsoberflächen und Fehlermeldungen unterstützen Deutsch und Englisch.
- Zugänglichkeit und Tastaturbedienung der Authentifizierungs- und Workspace-Flows verbessert.
- Kontrast des ungültigen Workspace-Einladungszustands für die Accessibility-Prüfung korrigiert.
- Version und Build-Informationen sind in den ausgelieferten Web-Flächen sowie über `/api/version` nachvollziehbar.

### Bekannte Einschränkungen

- Die neue Waitlist-Löschung entfernt ausschließlich den Eintrag aus der Marketing-Waitlist. Produkt-Accounts und bestehende Beta-Einladungen werden nicht gelöscht oder widerrufen.
- Das Hosted-Release `0.2.0` umfasst App, Marketing und Sync. Das separate macOS-Desktop-/CLI-Beta-Artefakt bleibt `0.1.0-beta.10`.
