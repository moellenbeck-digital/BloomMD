# Changelog

## In Entwicklung

- Payload-Spike-Anhang auf Stand der Admin-App (Ticket 204): `docs/adr/0001-payload-spike.md` hat einen Abschnitt „Ergebnis #204“ mit den Messwerten von Produktions-Build und -Start (42 s, Spitze 1983 MB, `next start` 181 MB), den Zahlen des Inventar-Tests, den Abweichungen vom Spike und der Aufwandseinschätzung je Paket (bestätigt: 77 bis 122 Personentage, weiter Annahme); „nicht belegt“ steht nur noch dort, wo #204 nichts belegt; keine Änderung an App oder Marketing-Seite
- Payload spike appendix brought up to the state of the admin app (ticket 204): `docs/adr/0001-payload-spike.md` has a section "Ergebnis #204" (result of #204) with the measurements of the production build and start (42 s, peak 1983 MB, `next start` 181 MB), the numbers of the inventory test, the deviations from the spike and the effort estimate per package (confirmed: 77 to 122 person-days, still an assumption); "not proven" remains only where #204 proves nothing; no change to the app or the marketing site

- Admin-App `apps/cms` aufgesetzt (Ticket 204): eigener Dienst auf Payload 3.93.0 unter Node ≥ 22.23.4 (`.nvmrc` angehoben) mit Collections für Konten, Zugänge, Testzeitraum, Token (nur Hash), Betreiber, Blog, News und Medien sowie der internen, signierten Schnittstelle `/svc/v1` (OpenAPI-Datei, Vertragstest); GraphQL ist aus, jede Collection verweigert standardmäßig, ein Wächter vor `/api` antwortet ohne Betreiber-Sitzung mit 404. Dockerfile-Ziel `cms`, Build, Typecheck, Tests (auch gegen Postgres 17) und Produktions-Start laufen in der CI. Es wird nichts ausgerollt, die App und die Marketing-Seite verhalten sich unverändert
- Admin app `apps/cms` set up (ticket 204): a service of its own on Payload 3.93.0 under Node ≥ 22.23.4 (`.nvmrc` raised) with collections for accounts, access, trial period, tokens (hash only), operators, blog, news and media, and the internal signed interface `/svc/v1` (OpenAPI file, contract test); GraphQL is off, every collection denies by default, a guard in front of `/api` answers 404 without an operator session. Dockerfile target `cms`; build, typecheck, tests (also against Postgres 17) and the production start run in CI. Nothing is rolled out; the app and the marketing site behave as before

- Payload-Spike, Doku-Korrekturen (Ticket 103): Anker-Links zwischen ADR und Spike-Anhang repariert, Zeilenzahl des Auth-Laufs, Stelle der Passwort-Regel beim Zurücksetzen und die Aussage zu „nur veröffentlicht“ bei News berichtigt; der Anhang nennt jetzt, welche Messungen nicht unabhängig nachgeprüft sind; keine Änderung an App oder Marketing-Seite
- Payload spike, documentation fixes (ticket 103): anchor links between the ADR and the spike appendix repaired, line count of the auth run, location of the password rule on reset and the statement on "published only" for news corrected; the appendix now lists which measurements were not independently verified; no change to the app or the marketing site

- Payload-Spike nachgezogen (Ticket 103): `docs/adr/0001-payload-cms.md` verweist auf den Spike-Anhang und führt O12, O14, O16, O17, Annahme A6 und die Aufwandsschätzung (77 bis 122 Personentage, Annahme) auf dem Stand des Spikes; der Anhang listet die Abweichungen von der ADR und enthält die Prüfskripte samt Wiederholungsablauf; keine Änderung an App oder Marketing-Seite
- Payload spike follow-up (ticket 103): `docs/adr/0001-payload-cms.md` links to the spike appendix and brings O12, O14, O16, O17, assumption A6 and the effort estimate (77 to 122 person-days, an assumption) up to the state of the spike; the appendix lists the deviations from the ADR and contains the check scripts with a repeatable procedure; no change to the app or the marketing site

- Payload-Spike (Ticket 103): `docs/adr/0001-payload-spike.md` hält fest, was die gewählte Payload-Version (3.93.0) für Anmeldung der Endnutzer, `/svc/v1`, Lese-Token und Laufzeit (Node statt Bun, Node ≥ 22.23.4) belegt, und schätzt den Aufwand neu (77 bis 122 Personentage, Annahme); keine Änderung an App oder Marketing-Seite
- Payload spike (ticket 103): `docs/adr/0001-payload-spike.md` records what the chosen Payload version (3.93.0) proves for end-user sign-in, `/svc/v1`, read token and runtime (Node instead of Bun, Node ≥ 22.23.4) and re-estimates the effort (77 to 122 person-days, an assumption); no change to the app or the marketing site

- Learnings-Ablage: Checkliste je Brand und Verweis auf die Betriebsanleitung (Ticket 115): `docs/LEARNINGS-ABLAGE.md` ergänzt „Muster für eine weitere Brand“ um eine Checkliste mit Backend-Wahl (Vault oder Cloud), Rechten, Vault-Name und Pfad, Velero (Backup/Restore-Test, beim Betrieb), täglichem Export und Verantwortlichem, jeweils mit Verweis auf den passenden Abschnitt, und verweist für Betrieb und Cluster-Teil (PVC-Vorlage, Chart-Werte, `adapter.wissen`, Rechte, Backup, Export) auf die Kurzanleitung „Learnings-Ablage einrichten“ in `md-brand-cluster-base`. Die sechs bestehenden Schritte bleiben unverändert.
- Learnings store: checklist per brand and pointer to the operations guide (ticket 115): `docs/LEARNINGS-ABLAGE.md` extends "Muster für eine weitere Brand" (pattern for another brand) with a checklist covering backend choice (vault or cloud), rights, vault name and path, Velero (backup/restore test, owned by operations), the daily export and the owner, each pointing to the matching section, and points to the short guide "Learnings-Ablage einrichten" in `md-brand-cluster-base` for operations and the cluster part (PVC template, chart values, `adapter.wissen`, rights, backup, export). The six existing steps are unchanged.

- Obsidian-Plugin: Zeichenverlust beim Umbenennen behoben (Ticket 57): Wer direkt nach dem Doppelklick auf einen Knoten losgetippt hat, verlor die ersten Zeichen des Titels, weil das Titelfeld seinen Text 50 ms nach dem Öffnen noch einmal markierte; das passiert jetzt nur noch, solange nichts getippt wurde
- Obsidian plugin: lost characters when renaming fixed (ticket 57): typing straight after double-clicking a node lost the first characters of the title because the title field selected its text again 50 ms after opening; that now only happens while nothing has been typed

- Obsidian-Navigator, Nacharbeit (Ticket 57): `Esc` in der Map führt zurück in die Liste bzw. den Baum, aus der die Map geöffnet wurde (nicht mehr in den Editor); am Ende des Verlaufs („Zurück“/„Vor“, `Strg/Cmd+[` und `]`) bleibt der Fokus auf einem bedienbaren Element statt verloren zu gehen; das bloße Öffnen der Map einer Notiz verändert die Notiz nicht mehr — die `bloommd:id`-Kommentare werden erst mit der ersten Bearbeitung in der Map geschrieben
- Obsidian navigator, follow-up (ticket 57): `Esc` in the map returns to the list or tree the map was opened from (no longer to the editor); at the end of the history ("Back"/"Forward", `Ctrl/Cmd+[` and `]`) focus stays on a usable element instead of falling onto the page; merely opening the map of a note no longer changes the note — the `bloommd:id` comments are written with the first edit made in the map

- Link-Vorschau gegen DNS-Rebinding gehärtet (Ticket 209): `/api/link-preview` (app und Marketing-Seite) löst den Hostnamen nur noch einmal auf, prüft alle Adressen und verbindet genau zu einer der geprüften Adressen; ein zweiter DNS-Abruf, den ein Angreifer-DNS auf eine interne Adresse umbiegen könnte, entfällt. Zertifikatsprüfung und `Host`-Header behalten den Original-Hostnamen. Die Sperrlisten sind vollständig (IPv4 u. a. Testnetze, Benchmark, Multicast, reserviert; IPv6 nur globale Adressen, IPv4-mapped und 6to4 nach den IPv4-Regeln); Hostnamen mit Punkt am Ende (`localhost.`) werden wie ohne geprüft. Jeder Redirect wird neu aufgelöst, geprüft und gebunden; Redirects auf andere Protokolle, interne Ziele oder von HTTPS auf HTTP werden abgelehnt. Das Verhalten steht als Kommentar in `route.ts`
- Link preview hardened against DNS rebinding (ticket 209): `/api/link-preview` (app and marketing site) resolves the host name only once, checks all addresses and connects to exactly one of the checked addresses; the second DNS lookup that an attacker-controlled DNS could point at an internal address is gone. Certificate check and `Host` header keep the original host name. The blocklists are complete (IPv4 incl. documentation, benchmarking, multicast and reserved ranges; IPv6 global addresses only, IPv4-mapped and 6to4 judged by the IPv4 rules); host names with a trailing dot (`localhost.`) are checked like the ones without. Every redirect is resolved, checked and pinned anew; redirects to other protocols, internal targets or from HTTPS to HTTP are refused. The behavior is documented as a comment in `route.ts`

- Doku mit echten Screenshots und Release-Status (Ticket 47): Die News „Shared Mode und lokale Agenten“ zeigt jetzt den echten Desktop-Konflikt-Dialog und die echte Agenten-Vorschau (DE/EN mit eigenem Alt-Text) und nennt den Release-Status in der Vergangenheit (Desktop 0.5.6, Hosted 0.4.18, 22.09.2026). Die Hilfe „Zusammenarbeit“ zeigt den Konflikt-Screenshot und erklärt die Entscheidungen „Cloud-Version verwenden“ und „Lokale Version beibehalten“. Ein neuer Test prüft, dass jedes Bild in Blog und News einen Alt-Text hat und unter `public/` existiert.
- Docs with real screenshots and release status (ticket 47): the news post "Shared mode and local agents" now shows the real Desktop conflict dialog and the real agent preview (DE/EN with their own alt text) and states the release status in the past tense (Desktop 0.5.6, Hosted 0.4.18, 22 September 2026). The "Collaboration" help page shows the conflict screenshot and explains the choices "Use cloud version" and "Keep local version". A new test checks that every picture in blog and news has alt text and exists under `public/`.

- CI sendet kein Plausible-Server-Signal mehr (Ticket 321): Der `web`-Container des Agent-E2E-Laufs und die Jobs `verify` und `full-e2e` setzen `BLOOMMD_PLAUSIBLE_DISABLED=true`; bisher meldete jeder CI-Lauf ein `server-start` an die Plausible-Instanz. Für Installationen ändert sich nichts.
- CI no longer sends a Plausible server signal (ticket 321): the `web` container of the agent E2E run and the `verify` and `full-e2e` jobs set `BLOOMMD_PLAUSIBLE_DISABLED=true`; so far every CI run reported a `server-start` to the Plausible instance. Nothing changes for installations.

- Plausible über die eigene Domain (Ticket 297): Die Marketing-Seite lädt das Plausible-Script und sendet Events über `bloommd.io/_plausible/…` an die neue Plausible-Instanz von Ops; die Weiterleitung reicht nur Besucher-IP und User-Agent durch (Land und Gerät stimmen), keine Cookies. Die Content-Security-Policy nennt keinen Fremdhost mehr. Das Script lädt nur noch auf `bloommd.io` und `www.bloommd.io`, damit das Testsystem nicht in die Statistik schreibt. Im Produktions-Image waren die Plausible-Werte leer eingebaut, sodass keine Messung lief; die Standardwerte stehen jetzt im Dockerfile (nicht als CI-Build-Argumente, damit jedes Image aus diesem Dockerfile sie trägt) und der Build prüft den tatsächlich eingebauten Domain-Wert, nicht nur, ob der Text irgendwo vorkommt. Die Weiterleitung ist ein eigener Server-Handler statt eines Next.js-Rewrites, weil ein Rewrite Cookies mitschickt und kein `no-store` für Events zulässt. Datenschutz-, Cookie-Text und die Plausible-News sind angepasst.
- Plausible through our own domain (ticket 297): the marketing site loads the Plausible script and sends events through `bloommd.io/_plausible/…` to Ops' new Plausible instance; the forwarding passes on only the visitor IP and user agent (country and device stay accurate), no cookies. The Content-Security-Policy no longer lists a third-party host. The script now only loads on `bloommd.io` and `www.bloommd.io`, so the test system does not write into the statistics. The production image had empty Plausible values baked in, so nothing was measured; the defaults now live in the Dockerfile (not as CI build args, so every image from this Dockerfile carries them) and the build checks the domain value actually baked in, not just that the text appears somewhere. The forwarding is a server route handler instead of a Next.js rewrite, because a rewrite sends cookies along and cannot set `no-store` for events. The privacy and cookie texts and the Plausible news post are updated.

- Sync-Server speichert nach einem Speicherfehler selbstständig nach (Ticket 46): Schlug das Speichern einer per WebSocket eingegangenen Änderung fehl (z. B. kurzer Datenbankausfall), blieb die Änderung nur im Arbeitsspeicher des Raums, bis jemand erneut bearbeitete; nach Reload war sie weg. Der Raum versucht es jetzt mit wachsendem Abstand (2 s bis 60 s) erneut, auch wenn der letzte Client schon gegangen ist. Versionskonflikte, fehlende Berechtigung und ungültige Daten werden bewusst nicht wiederholt.
- Sync server saves again by itself after a storage error (ticket 46): when saving a change that arrived over the WebSocket failed (for example a short database outage), the change stayed only in the room's memory until someone edited again, and was gone after a reload. The room now retries with a growing delay (2 s to 60 s), even after the last client has left. Version conflicts, missing permission and invalid data are deliberately not retried.

- Website-Vorschau mit Datenschutz-Hinweis (Ticket 91): Im Knoten-Panel steht über „Website-Vorschau laden“ jetzt dauerhaft, welche URL beim Klick abgerufen wird (volle URL und Host, aktualisiert sich mit dem URL-Feld), dass nur diese URL gesendet wird (keine Inhalte, Datei- oder Ordnernamen deiner Maps) und dass dein Browser das Vorschaubild vom Host der Seite lädt. Liefert eine Seite weder Titel noch Beschreibung noch Bild, erscheint „Keine Metadaten gefunden“; alte Fehler- und Leer-Hinweise verschwinden beim nächsten Versuch. Das gespeicherte Vorschaubild wird nicht mehr beim bloßen Öffnen einer Map vom fremden Server geladen: Direkt nach deinem eigenen Abruf erscheint es, danach (Neuladen, andere Leser, Präsentationsansicht) braucht es einen Klick auf „Vorschaubild von <Host> laden“; geladene Bilder werden ohne Referrer abgerufen. Titel und Beschreibung bleiben sichtbar und lösen keinen Abruf aus.
- Website preview with a privacy notice (ticket 91): above "Load website preview" the node panel now always shows which URL a click requests (full URL and host, updated with the URL field), that only this URL is sent (no contents, file or folder names of your maps) and that your browser loads the preview image from the page's host. If a page yields no title, description or image, "No metadata found" appears; old error and empty notices clear on the next attempt. The stored preview image is no longer loaded from the third-party server just by opening a map: it appears right after your own fetch, afterwards (reload, other readers, presentation view) it takes a click on "Load preview image from <host>"; loaded images are requested without a referrer. Title and description stay visible and trigger no request.

- Plattform-Adapter für Datei- und API-Zugriffe (Ticket 79): Die gemeinsame Oberfläche (`@bloommd/ui`) ruft `/api/...` nicht mehr selbst auf und liest keine Umgebungsvariablen; Dateiliste, Lesen, Anlegen, Speichern, Löschen, Umbenennen und die Link-Vorschau laufen über einen `PlatformAdapter`, den der Host bereitstellt (Web: HTTP-API, Desktop: RPC an den Hauptprozess, Handy-App: lokaler Speicher bzw. Cloud). Die alten Fensterereignisse `bloommd:list-maps`, `bloommd:load-map-document` und `bloommd:load-link-preview` entfallen. Für Nutzer ändert sich im Web nichts; in der Handy-App findet das Knoten-Panel jetzt Backlinks im lokalen Speicher bzw. in der Cloud. Hosts ohne Adapter fallen auf den Web-Adapter zurück.
- Platform adapters for file and API access (ticket 79): the shared UI (`@bloommd/ui`) no longer calls `/api/...` itself and reads no environment variables; the file list, read, create, save, delete, rename and the link preview go through a `PlatformAdapter` the host provides (web: HTTP API, desktop: RPC to the main process, mobile app: local store or cloud). The old window events `bloommd:list-maps`, `bloommd:load-map-document` and `bloommd:load-link-preview` are gone. Nothing changes for users on the web; in the mobile app the node panel now finds backlinks in the local store or the cloud. Hosts without an adapter fall back to the web adapter.

- Backlink-Kanten im Obsidian-Plugin (Ticket 75): Die Karte kann optional zeigen, welcher Knoten auf welchen verlinkt (gestrichelter Pfeil vom verlinkenden zum verlinkten Knoten; im Ordner-Modus von Datei zu Datei). Der Schalter „Backlink edges“ in der Kopfzeile und der Befehl „Toggle backlink edges“ sind standardmäßig aus, die Wahl wird je Karte bzw. Ordner gespeichert. Es ist nur eine Ansicht: Die Markdown-Datei wird nie geschrieben. Kaputte oder mehrdeutige Links (z. B. gleiche Überschrift zweimal) werden nicht geraten, sondern als Warn-Badge am Knoten mit Tooltip angezeigt. Der Export bleibt unverändert, die Kanten erscheinen dort nicht.
- Backlink edges in the Obsidian plugin (ticket 75): the map can optionally show which node links to which (dashed arrow from the linking to the linked node; in folder mode from file to file). The "Backlink edges" switch in the header and the command "Toggle backlink edges" are off by default, the choice is saved per map or folder. It is a view only: the Markdown file is never written. Broken or ambiguous links (e.g. the same heading twice) are not guessed at but shown as a warning badge on the node with a tooltip. The export stays unchanged; the edges do not appear in it.

- Anonyme Nutzungsstatistik in der App (Ticket 299): Auf bloommd.app zählt die App Seitenaufrufe (als Routenmuster ohne Kennungen, Parameter und Fragment) mit Plausible, ohne Cookies und ohne persönliche Kennung. Standard ist an, nur auf dem Host `bloommd.app`; `BLOOMMD_PLAUSIBLE_DISABLED=true` schaltet ab. Der Browser spricht nur die App selbst an (`/_plausible`), die Weiterleitung liest ihr Ziel zur Laufzeit (`BLOOMMD_PLAUSIBLE_TARGET_URL`, Standard `https://ping.bloommd.app`). Installationen anderer Betreiber senden aus dem Browser nie an uns. Ist das Ziel nicht erreichbar, bemerkt der Nutzer nichts. Beim Start steht eine Zeile im Server-Log. Beschreibung in der README und in `docs/LICENSING.md`; der Text der Datenschutzerklärung wird gesondert übernommen.
- Anonymous usage statistics in the app (ticket 299): on bloommd.app the app counts page views (as a route pattern without ids, parameters and fragment) with Plausible, without cookies and without a personal identifier. On by default, only on the host `bloommd.app`; `BLOOMMD_PLAUSIBLE_DISABLED=true` switches it off. The browser talks only to the app itself (`/_plausible`), and the forwarding reads its target at runtime (`BLOOMMD_PLAUSIBLE_TARGET_URL`, default `https://ping.bloommd.app`). Installations run by others never send from the browser to us. If the target is unreachable the user notices nothing. A line is written to the server log at start. Described in the README and in `docs/LICENSING.md`; the privacy policy text is taken over separately.
- Server-Signal für Installationen (Ticket 299): Ein Server, der kein eigenes Ziel (`BLOOMMD_PLAUSIBLE_TARGET_URL`) gesetzt hat, sendet beim Start und danach höchstens alle 24 Stunden ein anonymes Ereignis `server-start` mit der BloomMD-Version an `https://ping.bloommd.app` (Domain `installations.bloommd.app`, feste Server-Kennung `BloomMD-Server/<Version>` als User-Agent, kein Browser, keine Endnutzer-IP, keine Kennung, keine Cookies). Es kommt vom Server, blockiert den Start nicht (Timeout etwa 3 Sekunden) und bleibt still, wenn das Ziel nicht erreichbar ist. `BLOOMMD_PLAUSIBLE_DISABLED=true` schaltet es ab; wer ein eigenes Ziel setzt, sendet es nicht. Die Startzeile im Server-Log nennt es, README und `docs/LICENSING.md` beschreiben die Datenübertragung.
- Server signal for installations (ticket 299): a server that has not set a target of its own (`BLOOMMD_PLAUSIBLE_TARGET_URL`) sends one anonymous event `server-start` with the BloomMD version to `https://ping.bloommd.app` at start and then at most every 24 hours (domain `installations.bloommd.app`, fixed server identifier `BloomMD-Server/<version>` as User-Agent, no browser, no end-user address, no identifier, no cookies). It comes from the server, does not block the start (timeout about 3 seconds) and stays silent when the target is unreachable. `BLOOMMD_PLAUSIBLE_DISABLED=true` switches it off; whoever sets a target of their own does not send it. The start-up line in the server log mentions it, README and `docs/LICENSING.md` describe the data transmission.

- CI Playwright-Install (Ticket 307, Nacharbeit): Nach einem abgebrochenen Versuch lief das root-eigene `apt-get` weiter und hielt die dpkg-Sperre, die nächsten Versuche scheiterten sofort mit „Unable to acquire the dpkg frontend lock“. Der Wrapper beendet jetzt die apt-Prozesse, die ein fehlgeschlagener Versuch zurückgelassen hat (nie dpkg), wartet vor jedem Versuch bis zu 120 Sekunden, bis apt/dpkg frei ist, und nennt die Prozesse in einer Warnung. PackageKit wird vor dem Install gestoppt, weil es in allen hängenden Läufen neben dem festsitzenden `apt-get` lief.
- CI Playwright install (ticket 307, follow-up): after a cut-off attempt the root-owned `apt-get` kept running and held the dpkg lock, so the next attempts failed at once with "Unable to acquire the dpkg frontend lock". The wrapper now ends the apt processes a failed attempt left behind (never dpkg), waits up to 120 seconds before every attempt until apt/dpkg is idle, and names the processes in a warning. PackageKit is stopped before the install because it ran next to the stuck `apt-get` in every hung run.

- DB-Tests laufen in der CI (Ticket 305): Der Job `verify` startet einen Postgres-17-Dienst mit Wegwerf-Datenbank, migriert sie zweimal (der zweite Lauf prüft, dass die Migration wiederholbar ist) und führt damit die neun `*-db.integration.test.ts` aus, die bisher nie liefen. Fehlt `BLOOMMD_TEST_DATABASE_URL` in der CI, bricht der Lauf ab, statt die Tests still zu überspringen (`tests/integration/db-test-url.ts`); lokal ohne die Variable werden sie weiter übersprungen.
- DB tests run in CI (ticket 305): the `verify` job starts a Postgres 17 service with a throwaway database, migrates it twice (the second run checks that the migration is repeatable) and runs the nine `*-db.integration.test.ts` files with it, which never ran before. If `BLOOMMD_TEST_DATABASE_URL` is missing in CI the run fails instead of silently skipping the tests (`tests/integration/db-test-url.ts`); locally without the variable they are still skipped.

- Mobile-Testmatrix in der CI (Ticket 68): Der neue Workflow `mobile.yml` öffnet die gebauten Assets der Handy-App mit den Geräteprofilen iPhone SE, iPad (Hochformat) und Pixel 5 und prüft je Ansicht (Start, Karte, Knoten, Editor, Dateibrowser) horizontalen Überlauf, die 44-px-Trefferfläche und dass sich der Editor aus der Karte öffnet; Verstöße machen den Lauf rot, Screenshot und Trace hängen am Lauf. Die Job-Summary nennt, was gemessen wurde und was nicht geprüft wird. Das Bundle-Budget der Handy-App ist auf die gemessenen Werte gesenkt (Einstieg 800 000 Byte, Editor-Chunk 40 000 Byte statt 1 600 000 und 1 500 000), damit der Check Rückschritte auch erkennt. Beschreibung in `docs/MOBILE-MATRIX.md`.
- Mobile test matrix in CI (ticket 68): the new workflow `mobile.yml` opens the built assets of the mobile app with the iPhone SE, iPad (portrait) and Pixel 5 device profiles and checks every view (start, map, node, editor, file drawer) for horizontal overflow, the 44 px hit area and that the editor opens from the map; violations turn the run red, a screenshot and trace are attached to the run. The job summary lists what was measured and what is not checked. The mobile app's bundle budget is lowered to the measured values (entry 800,000 bytes, editor chunk 40,000 bytes instead of 1,600,000 and 1,500,000) so the check actually catches regressions. Described in `docs/MOBILE-MATRIX.md`.
- Mobile-CI Nachbesserung (Ticket 68): Der Bundle-Check der Handy-App bricht jetzt ab, wenn der Editor-Chunk fehlt (`--require-lazy`), statt die Prüfung still zu überspringen; die Desktop-App ist unverändert. `ios.yml` und `android.yml` schreiben eine Job-Summary mit dem Stand je Schritt, dem Artefakt (oder dem Grund, warum keines entstand) und dem, was nicht geprüft wird; der Text steht an einer Stelle und gilt auch für `mobile.yml`. `ios.yml` legt zusätzlich die Simulator-App als Artefakt `ios-simulator-app` ab.
- Mobile CI follow-up (ticket 68): the mobile app's bundle check now fails when the editor chunk is missing (`--require-lazy`) instead of silently skipping the check; the desktop app is unchanged. `ios.yml` and `android.yml` write a job summary with the status of each step, the artifact (or why there is none) and what is not checked; the text lives in one place and also serves `mobile.yml`. `ios.yml` additionally keeps the simulator app as the artifact `ios-simulator-app`.

- Touch-Bedienung (Ticket 66): Auf Touch-Geräten (Web-App, Handy-App, Desktop mit Touchscreen) haben Zoom-Steuerung, Aktionsleiste am Knoten, Aufklapp-Griff, Kopfzeile, Tab-Leiste, Dateibrowser, Editor-Kopf und die Werkzeugleiste des Editors jetzt mindestens 44 × 44 Pixel Trefferfläche; mit der Maus ändert sich nichts. Die Bedienelemente am Knoten behalten ihre Größe auch bei stark verkleinerter Karte. Öffnet sich die Bildschirmtastatur, bleibt das Eingabefeld im Editor sichtbar (Web-App und Handy-App). Die Matrix mit Prüfungen, Ausnahmen und der Liste für echte Geräte steht in `docs/MOBILE-MATRIX.md`.
- Touch operation (ticket 66): on touch devices (web app, mobile app, desktop with a touchscreen) the zoom controls, node action bar, expand handle, header, tab bar, file browser, editor header and the editor toolbar now have a hit area of at least 44 × 44 pixels; with a mouse nothing changes. Controls on a node keep their size even when the map is zoomed far out. When the on-screen keyboard opens, the editor's input field stays visible (web app and mobile app). The matrix with checks, exceptions and the list for real devices is in `docs/MOBILE-MATRIX.md`.

- Eigene Farbthemen (Ticket 74): Neben Hell und Dunkel gibt es im Menü „Hilfe und Einstellungen“ den Eintrag „Eigenes Theme…“. Der Dialog bietet fünf fertige Vorlagen (Ocean, Forest, Sepia, Midnight, Graphite) und eigene Farben für Akzent, Oberfläche und Text als Hex-Wert; die übrigen Farben leitet die App davon ab. Gespeichert wird nur, wenn der Text auf der Oberfläche mindestens 4,5:1 und der Akzent mindestens 3:1 Kontrast hat, sonst erklärt ein Hinweis, was zu ändern ist. Die Wahl bleibt nur lokal im Browser, wird vor dem ersten Bild angewendet (kein Aufblitzen) und lässt sich über „Standard-Theme wiederherstellen“ löschen. Der Hell/Dunkel-Umschalter setzt ein eigenes Theme zurück. Gespeicherte Werte aus früheren Versionen bleiben gültig.
- Custom colour themes (ticket 74): besides light and dark, the "Help and settings" menu has a "Custom theme…" entry. The dialog offers five ready-made presets (Ocean, Forest, Sepia, Midnight, Graphite) and your own colours for accent, surface and text as hex values; the app derives the other colours from them. A theme is saved only if text on the surface has at least 4.5:1 and the accent at least 3:1 contrast, otherwise a message explains what to change. The choice stays in the browser only, is applied before the first paint (no flash) and can be removed with "Restore default theme". The light/dark toggle resets a custom theme. Values saved by earlier versions stay valid.

- Missbrauchsschutz für Mehrfach-Testkonten (Ticket 277): Adressvarianten desselben Postfachs (`name+zusatz@…`, bei Gmail auch Punkte und `googlemail.com`) bekommen nicht mehr jeweils einen eigenen Testzeitraum. Ist die Adresse einer Variante schon bestätigt, legt die Registrierung kein weiteres Konto an und sendet keine Mail, mit derselben Antwort wie bei einer bereits bestätigten Adresse; wird eine Variante erst bestätigt, nachdem eine andere bestätigt wurde, bekommt sie keinen Testzeitraum und eine verständliche Meldung (auch bei gleichzeitigen Bestätigungen und der Wartelisten-Aktivierung). Das Registrierungs-Limit je Konto zählt die Varianten zusammen. Bestehende Konten bleiben unverändert. Datenschutzerklärung (App und Marketing) um „Missbrauchsschutz Testaccount“ ergänzt, Betriebshinweise in `docs/ACCOUNT-ABUSE-PROTECTION.md`. Datenbank-Migration `014` vor dem Ausrollen mit `db:migrate` anwenden.
- Abuse protection against multiple trial accounts (ticket 277): address variants of one mailbox (`name+tag@…`, for Gmail also dots and `googlemail.com`) no longer each get their own trial period. If another variant is already confirmed, signup creates no further account and sends no email, with the same answer as for an already confirmed address; a variant that is confirmed only after another one was gets no trial period and a clear message (also for simultaneous confirmations and waitlist activation). The per-account signup limit counts the variants together. Existing accounts stay unchanged. The privacy policy (app and marketing) gains "Abuse protection for the trial account", operating notes are in `docs/ACCOUNT-ABUSE-PROTECTION.md`. Apply database migration `014` with `db:migrate` before rolling out.

- Rechtstexte für den öffentlichen, kostenlosen Betrieb (Entwurf, Ticket 199; rechtliche Prüfung und Freigabe stehen aus): Die AGB regeln Registrierung, Testzeitraum und dessen Ablauf, Konto löschen, zulässige Nutzung, eigene Inhalte, Haftung und Änderung der Bedingungen ohne Beta-Bezug. Die Lizenzseite beschreibt den Zugang zu BloomMD Web und Cloud über den kostenlosen Testaccount. Die Datenschutzerklärung hat neue Abschnitte „Speicherdauer und Löschung“ (Fristen und Folgen der Konto-Löschung) und „Empfänger und Auftragsverarbeiter“ und nennt die Hinweis-Mails für bestehende Konten (30.11. und 08.12.2026). Die Widerrufsseite spricht von Testaccount, Konto löschen und Abmeldung von der Warteliste statt von „M1“ und „Beta“; das Impressum zeigt keine leere Telefonzeile mehr. Fristen und Konto-Löschung sind in `docs/LOESCHKONZEPT.md` beschrieben. Alle Änderungen stehen in App und Marketing, auf Deutsch und Englisch.
- Legal texts for public, free operation (draft, ticket 199; legal review and approval pending): the terms cover registration, the trial period and what happens when it ends, deleting your account, acceptable use, your own content, liability and changes to the terms, without any beta wording. The license page describes access to BloomMD Web and Cloud through the free trial account. The privacy policy has new sections "Retention and deletion" (periods and the effects of deleting an account) and "Recipients and processors" and names the reminder emails for existing accounts (30 Nov and 8 Dec 2026). The withdrawal page speaks of the trial account, deleting your account and unsubscribing from the waitlist instead of "M1" and "beta"; the legal notice no longer shows an empty phone line. Periods and account deletion are described in `docs/LOESCHKONZEPT.md`. All changes appear in the app and the marketing site, in German and English.

- Testaccount: 30 Tage ab E-Mail-Bestätigung mit Hinweis-Mails nach 15 und 23 Tagen (Ticket 274): Neue Konten erhalten beim Bestätigen der E-Mail-Adresse ihr Testende (30 Tage später) und die Sprache der Registrierung. Der neue Job `bun run --cwd apps/app db:trial-reminders` sendet die Hinweis-Mails (Deutsch oder Englisch, mit Restlaufzeit, Testende und Link zur App); jede Mail geht höchstens einmal raus, ein verspäteter Lauf sendet nur den letzten fälligen Hinweis und nie nach Testende. Bestehende Konten (auch frühere Wartelisten-Konten) enden fest am 15.12.2026, ihre Hinweise (30.11. und 08.12.) werden erst mit dem Schalter `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` versendet. Optional und standardmäßig aus: Mit `BLOOMMD_TRIAL_READONLY=1` sind Konten nach Testende nur lesbar (Schreiben wird zentral mit klarer Meldung abgelehnt, Lesen und Export bleiben, nichts wird gelöscht), mit Hinweis in der App; auf `/account` steht „Testzeitraum bis“. Doku: `docs/TRIAL.md`. Datenbank-Migration `013` vor dem Ausrollen mit `db:migrate` anwenden.
- Trial account: 30 days from email confirmation with reminder emails after 15 and 23 days (ticket 274): new accounts get their trial end (30 days later) and the signup language when the email address is confirmed. The new job `bun run --cwd apps/app db:trial-reminders` sends the reminders (German or English, with days left, trial end and a link to the app); each email goes out at most once, a late run sends only the latest due reminder and never after the trial ended. Existing accounts (including former waitlist accounts) end on 15 Dec 2026; their reminders (30 Nov and 8 Dec) are only sent once the switch `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` is set. Optional and off by default: with `BLOOMMD_TRIAL_READONLY=1`, accounts are read-only after the trial (writes are refused centrally with a clear message, reading and export stay, nothing is deleted), with a notice in the app; `/account` shows "Trial period until". Docs: `docs/TRIAL.md`. Apply database migration `013` with `db:migrate` before rolling out.

- Marketing 0.5.8 (#278, #279): Die DE/EN-Startseite zeigt nach dem Produktbeweis die Wissensplattform-Vision mit getrennten Statusangaben für heutige Funktionen, den internen Pilot #116 und geprüfte Roadmap-Felder. Drei Einstiege, kompakte Anwendungsfälle und je drei Vorlagen verkürzen den Weg zur Demo. Orange Buttons mit weißer Schrift erfüllen nun den Textkontrast nach WCAG AA.
- Marketing 0.5.8 (#278, #279): The DE/EN homepage places the knowledge platform vision after product proof and separates shipped features, internal pilot #116 and roadmap exploration. Three entry paths, compact use cases and three templates per locale shorten the path to the demo. Orange buttons with white text now meet WCAG AA text contrast.
- Einheitlicher Wortlaut für den Cloud-Zugang (Ticket 271): Er heißt überall „kostenloser Testaccount“ (30 Tage ab E-Mail-Bestätigung, ohne Einladung und ohne Warteliste; nach Ablauf nur lesbar, Export bleibt möglich; bestehende Konten zählen ab 15.11.2026). „Beta“ steht nur noch für die lokale Software, nie mehr mit „geschlossen“. Angepasst: Marketing (Landing, /leistungen, /download, /obsidian, Doku, News), Rechtstexte inkl. Hinweis-E-Mails nach 15 und 23 Tagen, App-Registrierung, Gate-Meldungen und Freischaltungs-E-Mail. Slug `closed-beta-zugang` und Zugangsschalter bleiben.
- Consistent wording for cloud access (ticket 271): it is called the "free trial account" everywhere (30 days from email confirmation, no invitation and no waitlist; read-only after it ends with export still possible; existing accounts count from 15 Nov 2026). "Beta" now only refers to the local software and is never "closed". Updated: marketing (landing, /leistungen, /download, /obsidian, docs, news), legal pages including reminder emails after 15 and 23 days, app signup, access-gate messages and the enablement email. The `closed-beta-zugang` slug and the access switch stay.

- Deutsche Landingpage (#275): Use-Case-Markdown, Map-Knoten und Template-Karten zeigen deutsche Beispieltexte. Vorlagen werden als normale, anpassbare Markdown-Dateien beschrieben; interne SEO-Formulierungen und englische Buttons entfallen. Verlinkte Beispieldateien enthalten keine unbelegten Preisstufen oder Nutzererkenntnisse mehr.
- German landing page (#275): use-case Markdown, map nodes and template cards show German examples. Templates are described as ordinary, editable Markdown files; internal SEO wording and English buttons are removed. Linked examples no longer make unsupported pricing or user-research claims.

- Windows: Der Desktop-Client speichert den Zugriffstoken eines Verbindungsprofils jetzt im Windows-Anmeldeinformationsspeicher (Credential Manager) des angemeldeten Benutzers (Ticket 73). Cloud-Verbindungen scheitern unter Windows nicht mehr mit „Secure Storage nicht verfügbar“. Der Token liegt nie in einer Datei, in den Einstellungen, in Logs oder in der Kommandozeile eines Prozesses; ist der Speicher nicht erreichbar, schlägt das Speichern mit einer Fehlermeldung fehl, statt auf Klartext auszuweichen. Ein alter Token aus der Einstellungsdatei wandert beim Start in den Speicher und steht danach nicht mehr in der Datei.
- Windows: the desktop client now keeps a connection profile's access token in the signed-in user's Windows Credential Manager (ticket 73). Cloud connections no longer fail on Windows with "secure storage unavailable". The token is never written to a file, the settings, logs or the command line of a process; if the store cannot be reached, saving fails with an error instead of falling back to plaintext. An old token from the settings file moves into the store on startup and is gone from the file afterwards.

- Wissensplattform-Roadmap (#256, #269, #272): README mit allen zehn Themen, Einzel-Tickets und vier Planungsmeilensteinen W0–W3; die öffentliche Roadmap und beide Startseiten erklären die Richtung zweisprachig. Die Roadmap zeigt die freigegebenen Planungstickets, auch lokal mit einem klar gekennzeichneten statischen Stand, und führt zur Demo oder zu GitHub-Feedback. Der deutsche Startseiten-Text verliert doppelte Beta-/CTA-Blöcke und eine unbelegte „ohne Limits“-Aussage. Marketing-Version 0.5.7 und zweisprachige News. Die Meilensteine sind Scope-Entscheidungen ohne Termin- oder Funktionszusage; der lokale Markdown-Kern und M1 bleiben vorrangig.
- Knowledge platform roadmap (#256, #269, #272): README now covers all ten themes, individual issues, and four planning milestones W0–W3; the public roadmap and both landing pages explain the direction in German and English. The roadmap shows approved planning issues, with a clearly marked static snapshot locally, and points to the demo or GitHub feedback. Duplicate beta/CTA blocks and an unsupported “no limits” claim are removed from the German landing page. Marketing version 0.5.7 and bilingual news. Milestones cover scope decisions without feature or date commitments; local Markdown and M1 remain the priority.

- Abmelden funktioniert auch ohne Formularfeld (Ticket 252): `POST /api/auth/logout` beendet die Sitzung, löscht das Cookie und leitet auf `/` weiter, egal ob der Aufruf ohne Body, mit JSON oder mit einem anderen Body kommt (vorher Fehler 500). Das Ziel `next` wird nur aus einem urlencoded-Formular gelesen, sonst gilt `/`. Die Prüfung auf denselben Ursprung bleibt: ein fremder `Origin` liefert weiter 403. Die übrigen Anmelde-Routen verlangen weiterhin ein urlencoded-Formular.
- Signing out also works without a form field (ticket 252): `POST /api/auth/logout` ends the session, clears the cookie and redirects to `/` whether the call has no body, a JSON body or any other body (before: error 500). The `next` target is read only from a urlencoded form, otherwise `/` applies. The same-origin check stays: a foreign `Origin` still gets 403. The other sign-in routes still require a urlencoded form.

- Online-Hilfe mit Screenshots und geführten Beta-Flows (Ticket 69): Die Hilfeseiten Erste Schritte, Desktop-App, Web-App und Closed-Beta Zugang haben nummerierte Schritte mit Bildern (Web-App mit Karte, Ordner öffnen mit „Nur Lesen“, Vorlagen-Auswahl, Browser-Demo, Registrierung und Bestätigung, Registrierung bei aktivem Zugangsschalter und über Einladungslink, Sync-Status). Neue Seite „Lokal oder Cloud“ (DE/EN): was lokal bleibt, was in die Cloud geht und wann Zusammenarbeit greift. Die echten Screenshots entstehen reproduzierbar aus den eingecheckten Fixtures: `bun run --cwd apps/marketing docs:screenshots` (eigene Config, getrennt vom normalen E2E-Lauf, Beschreibung in `apps/marketing/docs-screenshots/README.md`). Desktop-App und Obsidian sind als Schemazeichnungen (SVG) gekennzeichnet, nicht als Screenshot. Die Warteliste ist beendet, Windows gehört nicht zur Beta; beides ist so beschrieben. Nachtrag (Folge-PR): Neue Seite „Fehlerbehebung“ (DE/EN) mit Symptom, Ursache und Schritten zu Gatekeeper/DMG (Developer ID und Notarisierung ab 0.5.7), lokalen Ordnerrechten in Browser und Desktop, Sync-Status und Konflikten, Einladungs- und Zugangsproblemen und der Browser-Demo; verlinkt von Erste Schritte, Desktop-App, Web-App, Closed-Beta Zugang und Zusammenarbeit. „OKF und LLM-Wiki“ zeigt einen echten Screenshot der Wiki-Ansicht (Beispiel-Bundle `test-wiki/`), beschreibt Bundle anlegen und prüfen mit `bloommd-wiki` und nennt die Grenzen; „Obsidian-Plugin“ hat Schnellstart und einen Abschnitt, was mit den Dateien passiert. Ein Test (`docs-content.test.ts`) prüft DE/EN-Gegenstücke, vorhandene Bilder mit Alt-Text, Bilder auf den zentralen Seiten und Links zwischen Hilfeseiten; ein E2E-Test prüft, dass „Fehlerbehebung“ und „Lokal oder Cloud“ laden und in der Docs-Navigation (auch schmal) erreichbar sind. Der Hilfe-Link im Footer der englischen Startseite führt jetzt auf die englische Hilfe.
- Online help with screenshots and guided beta flows (ticket 69): the help pages Getting started, Desktop app, Web app and Closed beta access have numbered steps with pictures (Web app with a map, opening a folder with "Read only", template picker, browser demo, signup and confirmation, signup with the access switch on and from an invitation link, sync status). New page "Local or cloud" (DE/EN): what stays local, what goes to the cloud and when collaboration applies. The real screenshots are generated reproducibly from the checked-in fixtures: `bun run --cwd apps/marketing docs:screenshots` (a config of its own, separate from the normal E2E run, described in `apps/marketing/docs-screenshots/README.md`). The desktop app and Obsidian are shown as diagrams (SVG), labelled as not a screenshot. The waitlist has ended and Windows is not part of the beta; both are described that way. Addendum (follow-up PR): new page "Troubleshooting" (DE/EN) with symptom, cause and steps for Gatekeeper/DMG (Developer ID and notarization from 0.5.7), local folder permissions in the browser and on desktop, sync status and conflicts, invitation and access problems, and the browser demo; linked from Getting started, Desktop app, Web app, Closed beta access and Collaboration. "OKF and LLM Wiki" shows a real screenshot of the Wiki view (example bundle `test-wiki/`), describes creating and checking a bundle with `bloommd-wiki` and names the limits; "Obsidian plugin" has a quick start and a section on what happens to your files. A test (`docs-content.test.ts`) checks the DE/EN counterparts, existing pictures with alt text, pictures on the central pages and links between help pages; an E2E test checks that "Troubleshooting" and "Local or cloud" load and can be reached from the docs navigation (also the narrow one). The Help link in the footer of the English landing page now leads to the English help.

- Mobile: Ordner anlegen und Unterordner im App-Speicher (Ticket 64): „Auf diesem Gerät“ kennt jetzt Unterordner wie Desktop und Obsidian: Notizen in Ordnern werden gelesen, gespeichert (mit Sicherung im selben Ordner), gelöscht und als Konfliktkopie neben der Notiz abgelegt. Über „Neuer Ordner“ entsteht ein echter Ordner (auch verschachtelt, ohne Platzhalterdatei, auch im geöffneten Obsidian-Vault); leere Ordner stehen mit „leer“ in der Ordnerebene und lassen sich öffnen. „Neue Karte“ fragt Name und Ordner ab (der angezeigte Ordner ist vorgewählt), Namen mit `..`, absolute Pfade und Steuerzeichen lehnt der Dialog mit einem sichtbaren Hinweis ab. Ordner wie `.obsidian`, `.trash`, Punkt-Ordner und `node_modules` bleiben ausgeblendet. Das Plugin „capacitor-folder“ (iOS und Android) liefert dafür Ordner in `list()` und kennt `mkdir`.
- Mobile: create folders and sub-folders in the app storage (ticket 64): "On this device" now knows sub-folders like the desktop and Obsidian: notes in folders are read, saved (with a backup in the same folder), deleted and get their conflict copy next to the note. "New folder" creates a real folder (also nested, without a placeholder file, also in the opened Obsidian vault); empty folders show as "empty" in the folder level and can be opened. "New map" asks for a name and a folder (the folder shown is preselected); names with `..`, absolute paths and control characters are refused by the dialog with a visible message. Folders such as `.obsidian`, `.trash`, dot folders and `node_modules` stay hidden. The "capacitor-folder" plugin (iOS and Android) returns folders in `list()` and has `mkdir`.

- Test-Images der CI belegen je Commit deutlich weniger Registry-Platz (Ticket 247): Die Build-Metadaten (Commit-SHA, Zeit, Version) werden erst in den Build-Stages von App und Marketing gesetzt, nicht mehr vor der Installation der Abhängigkeiten; eine eigene Stage `deps` hält die Abhängigkeiten, sodass ihr Layer bei unverändertem `bun.lock` über Commits hinweg gleich bleibt und von App, Marketing und Sync geteilt wird. Das Sync-Image enthält nur noch die Abhängigkeiten plus `packages/sync` und `packages/core` statt des ganzen Workspace. Laufzeitverhalten und `/api/version` bleiben unverändert; die Produktions-Images sind nicht betroffen.
- CI test images take much less registry space per commit (ticket 247): the build metadata (commit SHA, time, version) is now set only in the app and marketing build stages instead of before the dependencies are installed; a separate `deps` stage holds the dependencies, so its layer stays the same across commits while `bun.lock` is unchanged and is shared by app, marketing and sync. The sync image now contains only the dependencies plus `packages/sync` and `packages/core` instead of the whole workspace. Runtime behavior and `/api/version` are unchanged; production images are not affected.

- Obsidian: Map-Ansicht bleibt nicht mehr leer (Ticket 63): „BloomMD: Visualize current note“ passt die Map erst ein, wenn die Ansicht ihre Größe hat (frisch geteiltes oder verborgenes Fenster), und stellt eine mit dem Workspace wiederhergestellte Map korrekt wieder her. Scheitert das Öffnen, Laden oder Rendern, zeigt die Ansicht eine verständliche Meldung mit „Back to Markdown“ (und „Try again“); auch eine leere Ansicht oder eine Notiz ohne Überschriften hat jetzt einen Weg zurück zu Markdown.
- Obsidian: the map view no longer stays blank (ticket 63): "BloomMD: Visualize current note" fits the map only once the view has a size (freshly split or hidden pane) and correctly revives a map restored with the workspace. If opening, loading or rendering fails, the view shows a clear message with "Back to Markdown" (and "Try again"); an empty view or a note without headings now also has a way back to Markdown.

- Mobile: Denselben Ordner wie Obsidian öffnen (Ticket 39): Markdown-Dateien aus der Dateien-App lassen sich mit BloomMD öffnen („Öffnen in…“, Dokumenttyp Markdown in der iOS-App; Kaltstart und laufende App). Die Datei wird dort gelesen und geschrieben, wo sie liegt, ohne Kopie im App-Ordner: über den Zugriff der übergebenen Datei, koordiniert mit iCloud und anderen Apps, ersetzt in einem Schritt und mit derselben Konfliktprüfung wie im Ordner (eine Änderung von einem anderen Gerät wird nie überschrieben; die Version vom iPad bleibt als Konfliktkopie im App-Ordner „Auf diesem Gerät“). Liegt die Datei im geöffneten Ordner, öffnet sie als Notiz dieses Ordners. Die Notizliste eines geöffneten Ordners zeigt Unterordner als Ebenen: Ordner zuerst (mit Zahl der Notizen), aktueller Pfad und Weg nach oben sichtbar, eine neue Notiz entsteht im angezeigten Ordner, Filter und Suche laufen weiter über den ganzen Ordner; `.obsidian`, `.trash` und Punkt-Ordner bleiben ausgeblendet. Pfade mit `..`, absolute Pfade und leere Teile lehnt der Ordner-Speicher jetzt selbst ab. Der Selbsttest deckt einen verschachtelten Vault und das Öffnen einer Datei-URL ab.
- Mobile: open the same folder as Obsidian (ticket 39): Markdown files in the Files app can be opened with BloomMD ("Open in…", Markdown document type in the iOS app; cold start and running app). The file is read and written where it lies, without a copy in the app folder: through the access of the handed-over file, coordinated with iCloud and other apps, replaced in one step and with the same conflict check as in a folder (a change from another device is never overwritten; the iPad's version is kept as a conflict copy in the app folder "On this device"). A file inside the opened folder opens as a note of that folder. The note list of an opened folder shows sub-folders as levels: folders first (with the number of notes), the current path and the way up visible, a new note is created in the folder shown, filter and search keep working across the whole folder; `.obsidian`, `.trash` and dot folders stay hidden. The folder store now refuses paths with `..`, absolute paths and empty parts itself. The self-test covers a nested vault and opening a file URL.

- Agent-Ingest mit Bereichs-Hubs und Tiefengrenze (Ticket 33): `bloommd-wiki agent ingest` und `bloommd_ingest` pflegen je Bereich (Schule, Arbeit, Projekte, Gespräche) eine Einstiegs-Map, die wie der Bereich heißt (z. B. `Schule/Schule.md`, Frontmatter `type: hub`). Fehlt sie, wird sie angelegt; sonst kommt unter dem Knoten „Maps“ ein `[[Titel]]`-Eintrag für die neue Map dazu, ein erneuter Ingest in dieselbe Map ergänzt nichts doppelt. Der Hub folgt den Rechten der Map (vorschlagen: zweiter Vorschlag, lesen: nichts, schreiben: eigener Protokolleintrag mit Undo), steht in der Antwort als `hub` und in `hinweise`, zählt nicht zu den 150 Knoten und ist kein Duplikat einer Map mit dem Bereichsnamen; lässt er sich nicht schreiben, bleibt der Ingest erfolgreich und meldet es als Hinweis. Neu ist die Tiefengrenze `INGEST_MAX_DEPTH` (5 Ebenen unter dem Maptitel, auch mit `--in-map`): darüber kommt eine Meldung mit Ist- und Grenzwert und es wird nichts geschrieben. Qualitätstests mit deutschen Beispieltexten für Gespräch, Diskussion, Lerneinheit, Projekt und Wochenrückblick (Map entsteht, keine Lint-Befunde, Original wörtlich als Quelle, nichts erfunden), dazu Tests für Hub und Tiefe und für eine zweite Besprechung zum selben Projekt. Die Doku (DE/EN) beschreibt Hub, Tiefe und den Eingang „Foto-Notiz“: Der Agent liest das Foto selbst, schreibt es ab und legt den Text mit `ingest` ab.
- Agent ingest with area hubs and a depth limit (ticket 33): `bloommd-wiki agent ingest` and `bloommd_ingest` keep one entry map per area (Schule, Arbeit, Projekte, Gespräche) that is named like the area (e.g. `Schule/Schule.md`, frontmatter `type: hub`). If it is missing it is created; otherwise a `[[title]]` entry for the new map is added below the node "Maps", and ingesting into the same map again adds nothing twice. The hub follows the rights of the map (propose: a second proposal, read: nothing, write: its own log entry with undo), appears in the answer as `hub` and in `hinweise`, does not count against the 150 nodes and is no duplicate of a map titled like the area; if it cannot be written, the ingest still succeeds and reports it as a hint. New is the depth limit `INGEST_MAX_DEPTH` (5 levels below the map title, also with `--in-map`): above it you get a message with the actual value and the limit and nothing is written. Quality tests with German example texts for conversation, discussion, lesson, project and weekly review (the map is made, no lint findings, the original word for word as the source, nothing invented), plus tests for the hub, the depth and a second meeting of the same project. The docs (DE/EN) describe the hub, the depth and the "photo note" input: the agent reads the photo itself, transcribes it and files the text with `ingest`.

- Ordnerfreigabe abgesichert und beschrieben (Ticket 55, Teil 3): Ein Integrationstest mit echtem Sync-Server prüft für veröffentlichte Ordner Veröffentlichung (Dateien im Ordner und in Unterordnern, ausgeschlossene Dateien bleiben lokal), Sync in beide Richtungen ohne Watcher-Echo, Namenskonflikte ohne Überschreiben und den Rechteentzug (kein Sync mehr, lokale Dateien unverändert). Die geöffnete Datei einer Ordnerfreigabe liefert dieselben Freigabe-Angaben wie eine einzeln geteilte Datei; die Zuordnung dafür liegt jetzt in einem eigenen, testbaren Modul, das Verhalten ist gleich geblieben. Neuer Abschnitt „Ordner als gemeinsamen Workspace veröffentlichen“ in der Desktop-Doku (DE/EN).
- Folder share secured and documented (ticket 55, part 3): an integration test with a real sync server covers published folders: publication (files in the folder and in subfolders, excluded files stay local), sync in both directions without a watcher echo, name conflicts without overwriting, and revoked access (no more sync, local files unchanged). The open file of a folder share returns the same share details as a single shared file; the lookup now lives in its own testable module, behavior is unchanged. New section "Publishing a folder as a shared workspace" in the desktop docs (DE/EN).

- Store-Einträge der Mobile-App geprüft und vervollständigt (Ticket 26): Store-Texte und Datenschutz-Antworten gegen den Code abgeglichen und korrigiert (Import von OPML, Export als Markdown, OPML, PDF, PNG und SVG, Universal Links, Android-Datensicherung, Einschränkung beim Webzugang). Neu: `REVIEW-NOTES.md` (Englisch, für Apple- und Google-Reviewer, Demo-Konto nur als Platzhalter) und `OWNER-CHECKLIST.md` (Klickliste für App Store Connect und Play Console mit Reihenfolge und offenen Entscheidungen). Die Hilfeseite „BloomMD auf iPad und iPhone“ (`/docs/ipad`, Deutsch und Englisch, Entwurf bis zum Release) ist die neue Support-URL. Die Datenschutzerklärung der Website beschreibt jetzt die App, Share-Links und Workspace-Agenten (Stand 4. November 2026; juristische Prüfung und Owner-Freigabe vor dem Deployment). Die News- und Blog-Entwürfe nennen Version 1.0. Nichts davon ist veröffentlicht oder hochgeladen.
- Store listings of the mobile app checked and completed (ticket 26): store texts and privacy answers compared with the code and corrected (OPML import, export as Markdown, OPML, PDF, PNG and SVG, universal links, Android backup, the limit on web access). New: `REVIEW-NOTES.md` (English, for Apple and Google reviewers, the demo account only as a placeholder) and `OWNER-CHECKLIST.md` (click list for App Store Connect and Play Console with the order of steps and open decisions). The help page "BloomMD on iPad and iPhone" (`/docs/ipad`, German and English, a draft until the release) is the new support URL. The privacy policy of the website now describes the app, share links and workspace agents (as of 4 November 2026; legal review and owner approval before deployment). The news and blog drafts state version 1.0. None of it is published or uploaded.

- Ordner-Abgleich für veröffentlichte Ordner (Ticket 55, Teil 2): Veröffentlichte Ordner stehen in der Seitenleiste unter „Ordnerfreigaben“ (Zähler für offene Änderungen). Die Aktivitätsliste zeigt Änderungen nur an, hochgeladen oder gelöscht wird nie von allein: „neu, noch nicht geteilt“ (Eintrag wird erst nach „Hochladen“ angelegt, Namenskonflikte und ungeeignete Namen lassen sich nur ignorieren), „lokal entfernt“ (pro Eintrag „Cloud-Dokument behalten“ oder – nach zweiter Bestätigung – „Cloud-Dokument entfernen“) und „lokal umbenannt“ (nur wenn Inhalt und genau eine neue Datei sicher zusammenpassen; „Neu zuordnen“ behält das Cloud-Dokument samt Cloud-Namen, „Als neue Datei behandeln“ trennt es; eine nicht erkannte Umbenennung lässt sich bei „lokal entfernt“ von Hand zuordnen). Entzieht der Server den Zugriff oder wird die Rolle zu Viewer, stoppt der Abgleich der Ordnerfreigabe: Status „Zugriff entzogen“, lokale Dateien bleiben unverändert, Hochladen und Entfernen sind gesperrt; ein nicht erreichbarer Server gilt nicht als Entzug. „Ordnerfreigabe trennen“ beendet nur die lokale Bindung (nach Bestätigung), löscht weder lokale Dateien noch Cloud-Dokumente und wird je Dokument im Workspace-Audit festgehalten (gebündelt, ohne lokale Pfade; bei entzogenem Zugriff bleibt die Trennung lokal). Eine geöffnete Datei einer Ordnerfreigabe wird wie eine einzeln geteilte Datei gespiegelt und hat keinen eigenen „Freigabe trennen“-Knopf.
- Folder sync for published folders (ticket 55, part 2): published folders appear in the sidebar under "Folder shares" (counter for open changes). The activity list only shows changes; nothing is ever uploaded or deleted on its own: "new, not shared yet" (the entry is created only after "Upload"; name conflicts and unsuitable names can only be ignored), "removed locally" (per entry "Keep cloud document" or, after a second confirmation, "Remove cloud document") and "renamed locally" (only when content and exactly one new file match with certainty; "Reassign" keeps the cloud document and its cloud name, "Treat as a new file" splits it; a rename that was not recognised can be assigned by hand under "removed locally"). If the server revokes access or the role becomes viewer, syncing of the folder share stops: status "Access revoked", local files stay unchanged, uploading and removing are blocked; a server that cannot be reached does not count as a revocation. "Disconnect folder share" ends the local binding only (after confirmation), deletes neither local files nor cloud documents and is recorded per document in the workspace audit trail (batched, without local paths; with revoked access the disconnect stays local). An open file of a folder share is mirrored like a single shared file and has no "Disconnect share" button of its own.

- Lokalen Ordner als gemeinsamen Workspace veröffentlichen (Ticket 55, Teil 1): Im lokalen Desktop-Modus gibt es in der Seitenleiste den eigenen Einstieg „Ordner als gemeinsamen Workspace veröffentlichen“, getrennt von „Diese lokale Datei teilen“ (die Einzeldatei-Freigabe bleibt unverändert). Ablauf: Ordner wählen (vorgeschlagen wird der geöffnete Ordner, sonst der native Dialog; die Auswahl allein liest und überträgt nichts), Server-Profil und Workspace wählen (Viewer-Workspaces sind gesperrt), Vorschau prüfen, mit „Veröffentlichen“ bestätigen. Die Vorschau zeigt Ziel-Workspace, Anzahl der Markdown-Dateien, Gesamtgröße, Konfliktstrategie und alle Dateien und Unterordner mit Häkchen zum Ausschließen (auch ganze Unterordner); Dateien, die nicht in einen Cloud-Namen passen, mit anderer lokaler Datei kollidieren oder größer als 1 MB sind, stehen mit Grund da und lassen sich nicht einschließen. Der Workspace kennt keine Unterordner: `notizen/2026/idee.md` wird zu `notizen__2026__idee.md`, jeder Name steht vorab in der Vorschau. Existiert der Name schon, gilt die gewählte Strategie: „Vorhandene Cloud-Datei nicht anfassen, als Konflikt melden“ (Standard) oder „Lokale Datei unter anderem Namen hochladen“ (`name-local.md`); nichts wird überschrieben oder gelöscht. Hochgeladen werden nur Markdown-Dateien, die angehakt waren; versteckte Ordner, `node_modules` und Symlinks werden übersprungen. Der Server erhält nur Workspace-ID, Dokument-ID und Cloud-Dateiname, nie einen lokalen Pfad; die Bindung steht pro Dokument im Workspace-Audit (ein gebündelter Aufruf `documentIds` an `/api/shared-documents/audit`, höchstens 200 je Aufruf). Scheitert das Audit, werden die in diesem Lauf angelegten Cloud-Dokumente wieder entfernt. Noch nicht Teil: fortlaufender Abgleich, neue/umbenannte/gelöschte Dateien, Aktivitätsliste, „Ordnerfreigabe trennen“.
- Publish a local folder as a shared workspace (ticket 55, part 1): in local desktop mode the sidebar has its own entry "Publish folder as a shared workspace", separate from "Share this local file" (the single-file share is unchanged). Flow: choose a folder (the open folder is proposed, otherwise the native dialog; choosing alone reads and transmits nothing), choose server profile and workspace (viewer workspaces are blocked), review the preview, confirm with "Publish". The preview shows the target workspace, number of Markdown files, total size, conflict strategy and all files and sub-folders with ticks to leave them out (whole sub-folders too); files that do not fit a cloud name, collide with another local file or exceed 1 MB are listed with the reason and cannot be included. The workspace has no sub-folders: `notes/2026/idea.md` becomes `notes__2026__idea.md`, and every name is shown in the preview first. If the name exists, the chosen strategy applies: "Leave the existing cloud file alone and report a conflict" (default) or "Upload the local file under another name" (`name-local.md`); nothing is overwritten or deleted. Only Markdown files that were ticked are uploaded; hidden folders, `node_modules` and symbolic links are skipped. The server receives only workspace ID, document ID and cloud filename, never a local path; each document's binding is recorded in the workspace audit trail (one batched `documentIds` call to `/api/shared-documents/audit`, at most 200 per call). If the audit fails, the cloud documents created in that run are removed again. Not part yet: continuous syncing, new/renamed/deleted files, an activity list, "disconnect folder share".

- Rich Preview für Mermaid, Bilder und Diagramme (Ticket 53): Ein Codeblock mit der Sprache `mermaid` erscheint im Knoteneditor als Diagramm; „Quelltext bearbeiten“ und „Vorschau anzeigen“ schalten um, der Quelltext bleibt ein normaler Codeblock. Bei einem Syntaxfehler zeigt eine Karte die Meldung von Mermaid mit der Zeile, der Quelltext bleibt sichtbar und editierbar, die App läuft weiter. Die Mermaid-Bibliothek (MIT) wird erst beim ersten Diagramm nachgeladen, nicht im Start-Bundle, mit `securityLevel: "strict"`. Bilder (`![](pfad)` und Obsidian-`![[bild.png]]`) werden im Editor und unter „Bilder in diesem Knoten“ angezeigt, relativ zur Notiz aufgelöst (gemeinsame Regel für Web mit lokalem Ordner, Desktop und Obsidian-Plugin; `./`, `../`, Leerzeichen, Umlaute und `%20` funktionieren, nichts außerhalb des Workspace/Vaults wird gelesen); ein nicht auflösbarer Pfad zeigt einen Hinweis mit dem Pfad statt eines kaputten Bildsymbols, im Obsidian-Plugin neben Obsidians eigenem Bildsymbol. Diagramme und die Bildvorschauen unter „Bilder in diesem Knoten“ öffnen per Klick oder Enter/Leertaste in einer Großansicht mit Zoom (+/−, Mausrad, 0 zum Zurücksetzen), Verschieben (Ziehen, Pfeiltasten) und Esc zum Schließen, mit Fokusfalle und Beschriftungen für Screenreader (de/en). Dort speichern „Bild speichern“ das Originalbild und „Diagramm als SVG/PNG speichern“ das Diagramm (gleicher Weg wie die Exporte aus Ticket 6: Browser-Download bzw. Downloads-Ordner auf dem Desktop; Beschreibung auf der Hilfeseite „Export und Import“). Vorschau und Großansicht ändern den Markdown-Text nie. Der Desktop-Export akzeptiert dafür zusätzlich die Bildformate JPG, JPEG, GIF, WebP, AVIF und BMP. Der Mirror-Sync des Obsidian-Plugins trägt `asset-path.ts` als weiteren Snapshot.
- Rich preview for Mermaid, images and diagrams (ticket 53): a code block with the language `mermaid` appears in the node editor as a diagram; "Edit source" and "Show preview" switch between the two, and the source stays an ordinary code block. On a syntax error a card shows Mermaid's message with the line, the source stays visible and editable, and the app keeps running. The Mermaid library (MIT) is loaded on the first diagram, not in the start bundle, with `securityLevel: "strict"`. Images (`![](path)` and Obsidian `![[image.png]]`) are shown in the editor and under "Images in this node", resolved relative to the note (one shared rule for the web app with a local folder, desktop and the Obsidian plugin; `./`, `../`, spaces, umlauts and `%20` work, nothing outside the workspace/vault is read); a path that cannot be resolved shows a hint with the path instead of a broken image icon, in the Obsidian plugin next to Obsidian's own icon. Diagrams and the image previews under "Images in this node" open by click or Enter/Space in an enlarged view with zoom (+/−, mouse wheel, 0 to reset), panning (drag, arrow keys) and Esc to close, with a focus trap and screen-reader labels (de/en). There, "Save image" saves the original image and "Save diagram as SVG/PNG" the diagram (the same route as the exports from ticket 6: browser download, or the Downloads folder on desktop; described on the help page "Export and import"). Preview and enlarged view never change the Markdown text. The desktop export additionally accepts the image formats JPG, JPEG, GIF, WebP, AVIF and BMP for this. The Obsidian plugin's mirror sync carries `asset-path.ts` as one more snapshot.

- Dokument-Tabs (Ticket 52): Geöffnete Dokumente stehen in einer Tab-Leiste, die ab dem ersten Dokument sichtbar ist (auch auf schmalen Bildschirmen, mit horizontalem Scrollen). Tabs behalten ihre Reihenfolge, neue kommen hinten dazu, höchstens 10 je Workspace (verdrängt wird das älteste Tab, nie das geöffnete oder eines mit ungespeicherten Änderungen). Jedes Tab zeigt den Titel (voller Titel und Dateiname als Tooltip) und hat einen Schließen-Knopf; Mittelklick schließt ebenfalls, beim einzigen Tab ist Schließen gesperrt, beim Schließen des offenen Tabs springt die Ansicht zum rechten, sonst linken Nachbarn. Dateien eines lokalen Ordners bekommen jetzt ebenfalls Tabs. Beim Wechsel zu einem anderen Dokument werden ungespeicherte Änderungen zuerst gespeichert; schlägt das fehl, bleibst du im Dokument und siehst eine Meldung. Tabs mit offenen Änderungen tragen einen Punkt, das Schließen eines solchen Tabs fragt nach (Speichern und schließen, Verwerfen, Abbrechen). Wer ein Dokument aus der Workspace-Karte oder über einen Link aus einem anderen Dokument geöffnet hat, kommt mit „Zurück“ (Knopf im Tab-Bereich oder Cmd/Strg+←) zur Karte bzw. zum Ursprungsdokument; ohne Herkunft gibt es keinen Zurück-Knopf. Dasselbe Dokument in zwei Workspaces ergibt zwei Tabs, Umbenennen und Löschen werden in den Tabs nachgeführt.
- Document tabs (ticket 52): open documents sit in a tab bar that is visible from the first document on (also on narrow screens, scrolling horizontally). Tabs keep their order, new ones are added at the end, at most 10 per workspace (the oldest tab is dropped, never the open one or one with unsaved changes). Each tab shows its title (full title and file name as a tooltip) and has a close button; a middle click closes too, closing is disabled on the only tab, and closing the open tab moves to its right neighbour, else the left one. Files of a local folder get tabs as well. Switching to another document first saves unsaved changes; if that fails you stay in the document and see a message. Tabs with open changes carry a dot, and closing such a tab asks first (save and close, discard, cancel). A document opened from the workspace map, or from another document through a link, returns with "Back" (button next to the tabs or Cmd/Ctrl+←) to the map or the originating document; without an origin there is no back button. The same document in two workspaces gives two tabs, and renaming or deleting is followed in the tabs.

- Mobile Deep Links (Ticket 38, Teil 1): Ein Link `https://bloommd.io/open?path=<Pfad>&node=<id>` öffnet die iPad/iPhone- und Android-App (Universal Links bzw. App Links) mit denselben Parametern und derselben Prüfung wie `bloommd://open?…`: nur exakt der Host `bloommd.io`, kein `..`, nur `.md`/`.markdown`, Knoten-ID wird geprüft; `auth` und `selftest` gelten weiter nur über `bloommd://`. Cloud-Dokumente werden als `https://bloommd.io/open/<dokument-id>?node=<id>` bzw. `bloommd://open?doc=<dokument-id>&node=<id>` erkannt (die App öffnet sie noch nicht). Ist die App nicht installiert, zeigt `/open` eine kurze Seite (de/en, `noindex`, ohne Inhalt aus dem Dokument) mit Download und Web-App. Die Website liefert `/.well-known/apple-app-site-association` und `/.well-known/assetlinks.json` aus den Umgebungsvariablen `APPLE_TEAM_ID` und `ANDROID_CERT_SHA256` (Fingerprints durch Komma getrennt); ohne Wert antworten beide mit 404. Vor dem Rollout setzen und den iOS-Build mit der Capability „Associated Domains“ signieren.
- Mobile deep links (ticket 38, part 1): a link `https://bloommd.io/open?path=<path>&node=<id>` opens the iPad/iPhone and Android app (universal links / app links) with the same parameters and the same validation as `bloommd://open?…`: exactly the host `bloommd.io`, no `..`, only `.md`/`.markdown`, node ids are checked; `auth` and `selftest` still work through `bloommd://` only. Cloud documents are recognised as `https://bloommd.io/open/<document-id>?node=<id>` or `bloommd://open?doc=<document-id>&node=<id>` (the app does not open them yet). If the app is not installed, `/open` shows a short page (de/en, `noindex`, nothing from the document) with download and web app. The website serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from the environment variables `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` (comma-separated fingerprints); without a value both answer 404. Set them before the rollout and sign the iOS build with the "Associated Domains" capability.

- Alle Exporte ohne Paywall (Ticket 6): Der Export-Knopf der Werkzeugleiste öffnet jetzt ein Menü mit Markdown, OPML, PDF, PNG und SVG (Cmd/Strg+E öffnet es, ebenso die Befehlspalette). Es ist auf Web, Desktop, Mobile und im Obsidian-Plugin gleich aufgebaut, nichts ist gesperrt, kein Abo nötig. Markdown liefert weiter `<Titel>.md`, OPML `<Titel>.opml` (OPML 2.0, Überschriften als verschachtelte Outlines, Notizen im Attribut `_note`, wie MindNode und Xmind sie lesen). PNG, SVG und PDF zeigen die aktuelle Karte ohne Griffe und Aktionsleisten; die SVG-Datei ist eine echte Vektordatei (Verbindungslinien als Pfade, Knoten als Text), kein Bild. Desktop speichert den Export im Downloads-Ordner und zeigt ihn dort; Mobile öffnet den Teilen-Dialog (z. B. „In Dateien sichern“). Der Import nimmt zusätzlich `.opml` (Web, Desktop, Mobile): die Datei wird zu einer neuen Karte, benannt wie bei `.md`; kaputte oder leere Dateien, DOCTYPE und externe Entities werden mit klarer Meldung abgelehnt. Obsidian-Plugin: gleiche fünf Einträge im Karten-Menü (Markdown als Kopie der Notiz, OPML, PDF, PNG, SVG im Anhangsordner) und der Befehl „Import OPML“. „Präsentation und Export“ steht nicht mehr als Pro-Merkmal in den Tarifen. Neue Hilfeseite „Export und Import“ (Entwurf bis zum Release).
- All exports without a paywall (ticket 6): the toolbar's export button now opens a menu with Markdown, OPML, PDF, PNG and SVG (Cmd/Ctrl+E opens it, so does the command palette). It is the same on web, desktop, mobile and in the Obsidian plugin; nothing is locked and no subscription is needed. Markdown still delivers `<title>.md`, OPML `<title>.opml` (OPML 2.0, headings as nested outlines, notes in the `_note` attribute that MindNode and Xmind read). PNG, SVG and PDF show the current map without handles and action bars; the SVG file is a real vector file (connections as paths, nodes as text), not an image. Desktop saves the export to the Downloads folder and reveals it there; mobile opens the share sheet (e.g. "Save to Files"). Import also accepts `.opml` (web, desktop, mobile): the file becomes a new map named like a `.md` file; broken or empty files, DOCTYPE and external entities are rejected with a clear message. Obsidian plugin: the same five entries in the map menu (Markdown as a copy of the note, OPML, PDF, PNG, SVG in the attachment folder) and the command "Import OPML". "Presentation and export" is no longer listed as a Pro feature in the plans. New help page "Export and import" (draft until the release).

- PDF-Quellen und Zitate (Ticket 5): Ein Link `[[datei.pdf#page=3]]` (auch `[[datei.pdf#page=3|Label]]`) ist jetzt ein Quell-Link statt eines kaputten Map-Links. Im Knoten-Panel erscheint er mit Dateiname und „Seite 3“; ein Klick öffnet das PDF an dieser Seite (Web über den Seitenparameter des Browser-Viewers, Desktop soweit der Viewer ihn auswertet, sonst steht die Seite sichtbar im Panel). Fehlt die Datei oder ist sie mehrdeutig, erscheint eine Meldung statt eines stillen Fehlschlags. Ohne `#page=` oder bei ungültiger Seite gilt Seite 1. Ein Zitat (`> …`) direkt unter dem Link gehört zum Knoten und wird im Panel als Zitat angezeigt; der Markdown-Text bleibt unverändert erhalten. Neuer Befehl „PDF-Zitat einfügen“ in der Befehlspalette (Datei, Seite, Zitat). `workspace lint` und `workspace index` (CLI und Health-Panel) melden einen PDF-Link auf eine nicht vorhandene Datei als Warnung `missing-resource` (mehrere gleichnamige PDFs als mehrdeutig); PDF-Links zählen nicht mehr als defekte Links oder Anker. Zitierschlüssel: `citekey: <schlüssel>` im Frontmatter (optional `author`, `year`, `title`). Die Befehlspalette exportiert die Literaturliste einer Map als BibTeX (`@misc{…}`) oder Markdown-Liste: eigener `citekey` plus die `citekey`s der per `[[…]]` verlinkten Maps (ein Hop), nach Schlüssel sortiert, ohne Duplikate.
- PDF sources and quotes (ticket 5): a link `[[file.pdf#page=3]]` (also `[[file.pdf#page=3|Label]]`) is now a source link instead of a broken map link. The node panel shows it with the file name and "Page 3"; a click opens the PDF at that page (web via the page parameter of the browser viewer, desktop as far as the viewer honours it, otherwise the page stays visible in the panel). If the file is missing or ambiguous, a message appears instead of a silent failure. Without `#page=` or with an invalid page, page 1 applies. A quote (`> …`) directly below the link belongs to the node and is shown as a quote in the panel; the Markdown text is preserved unchanged. New command "Insert PDF citation" in the command palette (file, page, quote). `workspace lint` and `workspace index` (CLI and health panel) report a PDF link to a file that is not in the workspace as a `missing-resource` warning (several PDFs with the same name as ambiguous); PDF links no longer count as broken links or anchors. Citation key: `citekey: <key>` in the frontmatter (optional `author`, `year`, `title`). The command palette exports a map's bibliography as BibTeX (`@misc{…}`) or a Markdown list: its own `citekey` plus the `citekey`s of the maps it links with `[[…]]` (one hop), sorted by key, without duplicates.

- Versionsverlauf und Konfliktkopien (Ticket 3): Jede Notiz hat einen Verlauf ihrer letzten 20 Fassungen. Über „Verlauf“ in der Werkzeugleiste (Desktop und Web; auch in der Befehlspalette) lässt sich eine Fassung nach Bestätigung wiederherstellen; die bis dahin aktuelle Fassung bleibt im Verlauf, es geht also nichts verloren. Lokale Ordner nutzen dafür die Backups unter `.bloommd/backups` (je Unterordner getrennt, ältere als die letzten 20 werden beim Speichern entfernt), Cloud-Workspaces die neue Tabelle `bloom_document_revisions` (Migration `012_document_revisions.sql`, vor dem Rollout `db:migrate`; Leser sehen den Verlauf, wiederherstellen dürfen nur Editoren und Eigentümer). Konfliktkopien („… (iPad-Konflikt).md“, „… (Android-Konflikt 2).md“) tragen in Dateibrowser, Befehlspalette, Desktop-Dateiliste und Mobile-Liste das Badge „Konfliktkopie“; in der geöffneten Kopie verweist ein Hinweis auf die Originalnotiz, soweit sie noch existiert.
- Version history and conflict copies (ticket 3): every note has a history of its last 20 versions. "History" in the toolbar (desktop and web; also in the command palette) restores a version after confirmation; the version that was current stays in the history, so nothing is lost. Local folders use the backups in `.bloommd/backups` (kept apart per sub-folder, versions older than the last 20 are removed on save), cloud workspaces the new table `bloom_document_revisions` (migration `012_document_revisions.sql`, run `db:migrate` before the rollout; readers see the history, only editors and owners can restore). Conflict copies ("… (iPad-Konflikt).md", "… (Android-Konflikt 2).md") carry the badge "Conflict copy" in the file browser, command palette, desktop file list and mobile list; an opened copy shows a notice pointing to the original note, if it still exists.

- CI-Sicherheit (Ticket 211): Alle Drittanbieter-Actions in `.github/workflows/*.yml` und im Obsidian-Plugin-Workflow sind auf vollständige Commit-SHAs mit Versionskommentar festgenagelt statt auf veränderliche Tags (gleiche Major-Versionen, kein Upgrade). Der Prozess zum Aktualisieren und die Prüfzeile stehen in `docs/CI-ACTIONS-PINNING.md`.
- CI security (ticket 211): all third-party actions in `.github/workflows/*.yml` and in the Obsidian plugin workflow are pinned to full commit SHAs with a version comment instead of mutable tags (same major versions, no upgrade). The update process and the check command are in `docs/CI-ACTIONS-PINNING.md`.

- Link-Vorschau (Ticket 208): `/api/link-preview` in der app und der Marketing-Seite hat ein Limit je Client, damit die Route nicht als Outbound-Proxy missbraucht werden kann. Anonym 30 Anfragen je Minute und Adresse, angemeldet in der app 120 je Konto; darüber antwortet die Route mit 429 und `Retry-After`, ohne die Zielseite abzurufen. Überschreitungen stehen als JSON-Zeile (gehashter Schlüssel, ohne Adresse und URL) im Log. Die Marketing-Seite zählt die Quelladresse jetzt wie die app (letzter `x-forwarded-for`-Eintrag bzw. `BLOOMMD_TRUSTED_PROXY_HEADER`) statt nach dem fälschbaren ersten Eintrag. Ohne Datenbank zählt jede Instanz für sich; Details in `docs/ACCOUNT-ABUSE-PROTECTION.md`
- Link preview (ticket 208): `/api/link-preview` in the app and on the marketing site has a per-client limit, so the route cannot be abused as an outbound proxy. Anonymous callers get 30 requests per minute and address, signed-in app users 120 per account; beyond that the route answers 429 with `Retry-After` without fetching the target page. Violations are logged as a JSON line (hashed key, no address and no URL). The marketing site now counts the source address like the app (last `x-forwarded-for` entry or `BLOOMMD_TRUSTED_PROXY_HEADER`) instead of the forgeable first entry. Without a database each instance counts on its own; details in `docs/ACCOUNT-ABUSE-PROTECTION.md`

- Warteliste, Teil 2 (Ticket 105): Bestätigte, nicht abgemeldete Wartelisten-Adressen bekommen ein vorbereitetes, noch nicht aktives Konto und eine Einladungsmail mit einem einmaligen, 14 Tage gültigen Aktivierungslink. Erst über diesen Link bestätigt die Person die Adresse, vergibt ein Passwort und stimmt Datenschutzerklärung und AGB zu (serverseitig erzwungen); vorher ist keine Anmeldung möglich, und ein Passwort-Reset oder eine erneute Bestätigungsmail kann das Konto nicht freischalten. Unbestätigte und abgemeldete Einträge werden weder übertragen noch angeschrieben. Wer sich inzwischen selbst registriert hat, bleibt unberührt. Die Übertragung läuft als Skript (`db:transfer-waitlist`, Probelauf ist der Standard, `--apply` schreibt und sendet) und gibt nur Zahlen aus; sie zählt gegen das globale Mail-Limit. Nicht aktivierte Konten werden 90 Tage nach der Mail gelöscht. Neue Migration `011_waitlist_transfers.sql` (vor dem Rollout `db:migrate`); die Datenschutzerklärung nennt die Übertragung.
- Waitlist, part 2 (ticket 105): confirmed, not unsubscribed waitlist addresses get a prepared account that is not active yet and an invitation mail with a single-use activation link valid for 14 days. Only through that link does the person confirm the address, choose a password and agree to the privacy policy and terms (enforced on the server); before that nobody can sign in, and neither a password reset nor a new confirmation mail can unlock the account. Unconfirmed and unsubscribed entries are neither transferred nor mailed. Anyone who has registered on their own in the meantime is left alone. The transfer runs as a script (`db:transfer-waitlist`, dry run is the default, `--apply` writes and sends) and prints numbers only; it counts against the global mail cap. Accounts that are not activated are deleted 90 days after the mail. New migration `011_waitlist_transfers.sql` (run `db:migrate` before the rollout); the privacy policy names the transfer.

- Wissensschicht, Bestätigen-/Verwerfen-Kreislauf (Ticket 176): Neuer Learning-Status `verworfen` (ausgemustert wie `veraltet`/`ersetzt`: aus der Standardsuche und der Duplikatprüfung ausgeblendet, im Wiki-Lint `deprecated`). `bloommd-wiki agent search --status <s>` sucht exakt nach einem Status (z. B. nur `bestätigt` für den Preflight) und braucht dann keinen Suchtext. `bloommd-wiki agent decide` bestätigt oder verwirft ein Learning mit Grund, Quelle und Name (setzt Status, `verified`, bei `bestätigt` `stale_after` + 90 Tage, hängt den Knoten „Entscheidung“ an; im Protokoll und per `agent undo` zurücknehmbar). `bloommd-wiki agent review` liefert den Wochenlauf als kurzen Text (oder mit `--json`): Learnings mit Status `neu`, abgelaufene und bald ablaufende (ohne ausgemusterte), Duplikat-Kandidaten und eine Qualitätszeile bei mehr als 10 neuen Learnings in 7 Tagen; ohne Befund genau `NO_REPLY`. `scripts/learnings-review.sh` ruft ihn montags für den Chief of Staff auf.
- Knowledge layer, confirm/discard cycle (ticket 176): new learning status `verworfen` (retired like `veraltet`/`ersetzt`: hidden from the default search and the duplicate check, `deprecated` in the wiki lint). `bloommd-wiki agent search --status <s>` searches for one exact status (e.g. only `bestätigt` for the preflight) and then needs no search text. `bloommd-wiki agent decide` confirms or discards a learning with reason, source and name (sets the status and `verified`, on `bestätigt` `stale_after` + 90 days, and appends the node "Entscheidung"; in the log and reversible with `agent undo`). `bloommd-wiki agent review` prints the weekly run as a short text (or with `--json`): learnings with status `neu`, expired and soon expiring ones (retired ones left out), duplicate candidates and a quality line for more than 10 new learnings in 7 days; exactly `NO_REPLY` when there is nothing. `scripts/learnings-review.sh` runs it on Mondays for the chief of staff.

- Dev-Team-Pod: `scripts/team-lauf <befehl>` erzwingt per `flock`, dass pod-weit nur ein schwerer Lauf zugleich läuft (Build, `next dev`, E2E, Voll-Tests); weitere Aufrufe warten und melden Halter und Wartezeit. Exit-Code und Signale werden durchgereicht, die Sperre ist nach dem Ende oder `kill -9` des Wrappers frei, ein verschachtelter Aufruf hängt nicht, `TEAM_LAUF_TIMEOUT` (Standard 1800 s) begrenzt das Warten (Exit 75). `AGENTS.md` verlangt den Wrapper für schwere Läufe.
- Dev team pod: `scripts/team-lauf <command>` uses `flock` to allow only one heavy run at a time pod-wide (build, `next dev`, E2E, full tests); further calls wait and report the holder and the wait time. The exit code and signals are passed through, the lock is free after the wrapper ends or is killed with `kill -9`, a nested call does not hang, and `TEAM_LAUF_TIMEOUT` (default 1800 s) limits the wait (exit 75). `AGENTS.md` requires the wrapper for heavy runs.

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
