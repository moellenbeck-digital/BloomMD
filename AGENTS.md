# BloomMD

Mindmap-App, deren natives Datenformat **Markdown-Dateien** sind.
Vollständige Architektur, Datenmodell und Projektplan: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Tech Stack

- **Sprache:** TypeScript (strict), kein `any`
- **Runtime / Package Manager:** Bun
- **Monorepo:** Bun Workspaces (`apps/app`, `apps/marketing`, `packages/core`, `packages/ui`, `packages/desktop`, `packages/mobile`, `packages/sync`, `plugins/obsidian`)
- **UI:** React 19, Tailwind CSS v4, Lucide React (Icons)
- **Mindmap-Rendering:** @xyflow/react + dagre (Layout)
- **Markdown-Parsing:** unified + remark + gray-matter (Frontmatter)
- **WYSIWYG-Editor:** @mdxeditor/editor
- **State:** Zustand
- **Web:** Next.js 16 (App Router, Turbopack)
- **Desktop:** Electrobun v1 (Bun Main Process, Type-safe RPC)
- **Mobile:** Capacitor 8 (iOS/Android, @capacitor/filesystem; nicht Teil des M1-Beta-Supports)

## Befehle

```bash
bun install                    # Dependencies installieren

# Web
bun run dev:app                # Private App starten
bun run dev:marketing          # Marketing-App starten

# Desktop
bun run --cwd packages/desktop build:renderer
bun run --cwd packages/desktop dev

# Mobile (außerhalb des M1-Beta-Supports)
bun run --cwd packages/mobile build
cd packages/mobile && bunx cap sync

# Sync Server
cd packages/sync && bun run dev  # Sync-Server starten (localhost:4100)

# Tests
bun test ./packages/core/src/parser.test.ts
```

## Package-Struktur

- `@bloommd/core` — Parser, Types, Operations, FileStore (Node.js)
- `@bloommd/core/browser` — Gleich wie core, aber ohne FileStore (browser-safe, kein `node:fs`)
- `@bloommd/ui` — React-Komponenten (MindMapCanvas, NodeEditor, Toolbar, etc.)
- `@bloommd/web-app` — Private Next.js App (`apps/app`) mit Auth, Workspaces, Sync, Collaboration, OKF/llm-wiki
- `@bloommd/marketing` — Public Next.js App (`apps/marketing`) mit Landingpage, Docs/Fumadocs, Legal, Templates, Demo
- `@bloommd/desktop` — Electrobun App mit RPC + File Watcher
- `@bloommd/mobile` — Capacitor App mit Filesystem API
- `@bloommd/sync` — Yjs Sync-Server (Bun + Hono, y-protocols, Room-per-file)
- `@bloommd/agent-runtime` — Laufzeit und native `bloommd-agent`-Binary für lokale Workspace-Agenten
- `@bloommd/wiki-cli` — optionale native `bloommd-wiki`-Binary für lokale Wiki-Workflows

### Obsidian-Plugin: Source und Release-Mirror

- Die einzige Entwicklungsquelle ist `plugins/obsidian` in diesem Repository: `moellenbeck-digital/BloomMD`. Gemeinsame Änderungen an `packages/core` werden ebenfalls zuerst hier entwickelt.
- Das öffentliche Repository `moellenbeck-digital/bloommd-obsidian` ist ein generierter Read-only-Release-/Distribution-Mirror für BRAT und manuelle Releases. Dort keine Implementierung und keine Pull Requests entwickeln. Nutzer dürfen dort öffentliche Plugin-Bugs und Kompatibilitätsprobleme als Issues melden; die Umsetzung erfolgt anschließend im Monorepo.
- Gemeinsame Markdown-/Struktur-Logik liegt in `packages/core/src/obsidian-markdown.ts` und wird über `@bloommd/core/browser` exportiert. Obsidian-spezifische Vault-, View-, Settings- und UI-Logik bleibt im Plugin.
- Der kanonische Workspace verwendet React 19. Der standalone Public-Mirror wird wegen der Obsidian-Review-Anforderung beim Packaging auf React 18.3 normalisiert.
- Das Obsidian-Plugin bündelt kein React: Der `build`-Script von `plugins/obsidian` aliasiert `react`/`react-dom` (inkl. `react/jsx-runtime`, `react-dom/client`) per esbuild auf `preact/compat` (~180 KB weniger `main.js`). Typen bleiben `@types/react`; Plugin-Tests laufen über `scripts/test-preact.ts` mit demselben Alias. Keine React-19-only-APIs (`use`, `useActionState`, `ref` als Prop, Ref-Cleanup-Rückgaben, `<Context>` als Provider) im Plugin- oder `packages/ink`-Code verwenden; `src/bundle-size.test.ts` zeigt die `main.js`-Größe und prüft Budget und Alias.
- Der aktuelle synchronisierte Plugin-Stand ist Version `0.5.12`. `MIRROR.json` im Public-Mirror bindet Plugin-Version, Monorepo-Git-SHA und Core-SHA-256 aneinander. Die dort eingetragene `sourceCommit` bezeichnet den historischen Quell-Commit, aus dem dieser Mirror erzeugt wurde; ältere SHAs können noch auf das private Archiv verweisen.
- Mirror synchronisieren: `scripts/sync-obsidian-repo.sh <path-to-bloommd-obsidian>`; nur prüfen: `scripts/sync-obsidian-repo.sh --check <path-to-bloommd-obsidian>`.
- Das Plugin importiert Core-Logik über den schmalen Export `@bloommd/core/obsidian-markdown`, nicht über den Sammel-Export `@bloommd/core/browser`; sonst landen YAML-, Yjs- und Agenten-Code in `main.js` und sprengen das 600-KiB-Budget.
- Handschrift (Ink) liegt im Plugin (`src/ink-*.ts(x)`): Zeichnungen sind SVG-Dateien mit eingebetteten Strichdaten (`bloommd-ink` v1). Umzug nach Core erst, wenn Web/Mobile-App sie nutzen.
- Mobile-Support (`isDesktopOnly: false`) wird öffentlich nur mit bestandener Touch-Matrix für genau diese Version ausgeliefert (`plugins/obsidian/MOBILE-MATRIX.md`, von `release.mjs` erzwungen). Automatisierter Nachweis: `bun run qa:obsidian-ink-smoke`.
- Im Monorepo sind `plugins/obsidian/main.js`, `plugins/obsidian/styles.css` und der verschachtelte Plugin-Lockfile Build-Artefakte und werden nicht versioniert; der Public-Mirror erzeugt sie beim Release.

## Konventionen

- Sprache im Code: **Englisch** (Variablen, Funktionen, Kommentare)
- Sprache in Docs/Commits/UI: **Deutsch** erlaubt
- Öffentliche Produktflächen, Marketing-Seiten, Hilfe/Dokumentation und Roadmap-UI sollen grundsätzlich **Deutsch und Englisch** unterstützen; GitHub-Tickets werden in ihrer jeweils vorhandenen Sprache übernommen und nicht nachträglich vereinheitlicht.
- Exports: Named Exports, kein `export default`
- Imports zwischen Packages: Über `@bloommd/core`, `@bloommd/ui` (nicht relative Pfade)
- Browser-Packages importieren `@bloommd/core/browser` (nicht `@bloommd/core`)
- Tests: Neben der Quelldatei als `*.test.ts` / `*.test.tsx`
- Fehler: Keine stillen `catch`-Blöcke — Fehler loggen oder weiterwerfen
- Icons: Lucide React (`lucide-react`)
- Farben: Brand-Palette aus `assets/ASSETS.md` (#FF6B35 Primary, #1A1A1A Ink)
- Fonts: Outfit (Display), DM Sans (Body), JetBrains Mono (Code)

## Plattform-Patterns

### Desktop RPC (Electrobun)

Neue RPC-Methode hinzufügen = 3 Dateien:

1. **`packages/desktop/src/shared/rpc-types.ts`** — Request/Message-Typ in `BloomMDRPC` definieren
2. **`packages/desktop/src/bun/index.ts`** — Handler im Bun-Prozess implementieren
3. **`packages/desktop/src/mainview/rpc.ts`** — Aufruf im Webview via `electrobun.rpc!.request.methodName()`

Messages (Bun → Webview, fire-and-forget) vs. Requests (bidirektional, mit Response).
Electrobun kennt nur ein globales `maxRequestTime` (60 s, `RPC_MAX_REQUEST_TIME_MS`), kein Timeout je Request. Native Dialoge, die auf einen Menschen warten (`chooseDirectory`, `chooseResourceFile`, `importFile`), laufen deshalb nicht als Request mit Ergebnis: der Request quittiert nur den Start, das Ergebnis kommt als Message `nativeDialogResult` (`bun/native-dialog.ts`, `mainview/native-dialog-client.ts`). Neue Dialog-Requests genauso anbinden.
File Watcher nutzt chokidar mit `awaitWriteFinish: { stabilityThreshold: 500 }`.

### Web API (Next.js 16)

- Route Handler exportieren HTTP-Verben: `export async function GET(request: Request) { ... }`
- Dynamic Route Params sind async: `const { filename } = await params`
- Middleware (`middleware.ts`): `X-API-Key` Header prüfen, `sec-fetch-site: same-origin` überspringt Auth
- Responses immer via `NextResponse.json()` mit explizitem Status-Code

### Web App Split

BloomMD hat ab M1 zwei getrennte Next.js-Anwendungen im selben Monorepo:

- `apps/marketing` (`@bloommd/marketing`) → `bloommd.io`: Landingpage, Docs/Fumadocs, Legal, Templates, isolierte Demo und optional public Wiki (die Warteliste ist beendet, Registrierung unter `bloommd.app/signup`)
- `apps/app` (`@bloommd/web-app`) → `bloommd.app`: Auth, Account, Workspaces, OKF/llm-wiki, Sync, Collaboration und Closed-Beta-Flows

`BLOOMMD_DEPLOYMENT` ist nach dem Split obsolet und wird von `release:check` abgelehnt. Die Trennung
passiert über getrennte App-Roots und getrennte Builds, nicht über Runtime-Routing in einem gemeinsamen
Image. Marketing darf keine App-Secrets tragen: kein `DATABASE_URL`, kein `BLOOMMD_AUTH_SECRET`, kein
`BLOOMMD_SYNC_SECRET`, keine Stripe-Secrets und kein `NEXT_PUBLIC_SYNC_URL`. Die beendete Waitlist
liegt nur noch in `BLOOMMD_WAITLIST_DATABASE_URL` (eigene Tabelle) bis zu Export, Einladung und Löschung
(`apps/marketing/scripts/waitlist.ts`). Die Produkt-App setzt global
`X-Robots-Tag: noindex, nofollow`. App-Routen existieren im Marketing-Build nicht; Demo-/
Docs-/Template-Routen existieren im App-Build nicht.

Die öffentliche Demo darf nicht die private App freischalten. Sie lebt in `apps/marketing`, nutzt nur
browser-sichere Core-/UI-Teile und hat keinen Zugriff auf Accounts, Workspaces, Sync-Tickets, Billing
oder die Produktdatenbank.

### Version und Build-Info

- Alle auslieferbaren Apps und Services zeigen bzw. melden die laufende BloomMD-Version, damit Nutzer, Support und Feedback eindeutig referenzieren können, was gerade live ist.
- Bei jedem Release oder Deployment, das Nutzer sichtbar betrifft, muss die SemVer-Version der betroffenen auslieferbaren Packages passend erhöht werden; nur den Git-Hash/Image-Pin zu ändern reicht nicht.
- Dazu gehören insbesondere `apps/app/package.json`, `apps/marketing/package.json`, `packages/desktop/package.json`, `packages/sync/package.json`, `packages/agent-runtime/package.json`, `packages/wiki-cli/package.json` und bei Mobile-Releases `packages/mobile/package.json`.
- Gemeinsame Release-Artefakte müssen dieselbe SemVer-Version tragen, z. B. Web-App + Marketing + Sync bei einem gemeinsamen Hosted-Beta-Release oder Desktop + CLI bei einem Desktop-Beta-Release. Interne Libraries (`packages/core`, `packages/ui`) werden mitgezogen, wenn sie als Teil dieses Release-Artefakts versioniert oder veröffentlicht werden.
- Die sichtbare Kurzform bleibt konsistent: `BloomMD <version> (<short-sha>)`, z. B. `BloomMD 0.1.0-beta.2 (2269618)`.
- Git-SHA, Git-Tag und Image-Digest sind Nachweis- und Rollout-Metadaten; die fachliche Produktversion bleibt SemVer.
- App-Flächen mit sichtbarer Version: Login, Account/About, Help/Feedback und App-Shell, soweit der Viewport Platz hat.
- Marketing-Flächen mit sichtbarer Version: Footer; Legal-/Support-Kontext darf die Version ebenfalls nutzen.
- App und Marketing bieten `/api/version` mit nicht-geheimer Build-Info: Produkt, Package, Deployment, Version, Git-SHA, Short-SHA, Git-Tag, Build-Zeitpunkt und Display-Version.
- Feedback-Issues müssen Version, SHA, Deployment, Route, Browser/OS und Zeitstempel automatisch enthalten.
- CI/Docker injiziert Build-Metadaten deterministisch über `BLOOMMD_RELEASE_VERSION`, `BLOOMMD_BUILD_SHA`, `BLOOMMD_BUILD_TAG`, `BLOOMMD_BUILD_TIME` und die zugehörigen `NEXT_PUBLIC_BLOOMMD_*` Werte.
- Release-Nachweis bleibt SHA-/Digest-basiert: Git-Tags und sichtbare Versionen helfen Menschen, ersetzen aber nicht den unveränderlichen Image-Pin.

### Release- und Kommunikationspflichten

- Jeder nutzerrelevante Funktionsblock wird als gemeinsames Release-Ticket geplant: betroffene SemVer-Versionen, Artefakte, Tests, Deployment, Release Notes, Dokumentation und externe Kommunikation gehören in denselben überprüfbaren Lieferumfang.
- Ein Feature- oder Meilenstein-Release aktualisiert neben dem Changelog mindestens eine zweisprachige `/news`-Meldung. Für einen größeren, eigenständig verständlichen Funktionsblock werden zusätzlich mindestens zwei zweisprachige Blogposts geplant und veröffentlicht, sofern sie unterschiedliche Nutzerfragen beantworten.
- News, Blog und Hilfe beschreiben ausschließlich verifizierte Funktionen des tatsächlich ausgelieferten Stands. Sie enthalten echte, vor Veröffentlichung visuell geprüfte Screenshots der relevanten Flows mit beschreibenden Alt-Texten; keine Mockups oder unzutreffenden Plattformversprechen.
- Release- und Kommunikations-Tickets enthalten den Nachweis für Builds, automatisierte Tests, passende native/E2E-Smokes, Deployment sowie die sichtbaren Versions- und `/api/version`-Angaben. Verlinkte Release Notes, News, Blog, Hilfe und Artefakte müssen denselben Release-Stand referenzieren.
- Öffentliche Tags, GitHub-Releases, Deployments und Veröffentlichungen in externen Kanälen bleiben trotz vollständiger Vorbereitung erst nach einer ausdrücklichen Owner-Freigabe erlaubt.

### Mobile (Capacitor)

- `packages/mobile/src/storage.ts` — Wrapper um `@capacitor/filesystem`
- Festes Verzeichnis `Documents/bloommd/` (nicht konfigurierbar wie Desktop)
- Kein File Watching — externe Änderungen werden nicht erkannt

### Dateizugriff pro Plattform

| Plattform | File I/O | Parser |
|-----------|----------|--------|
| Web | `FileStore` (node:fs) via API Routes | `parseFile()` |
| Desktop | `FileStore` (node:fs) via RPC | `parseFile()` |
| Mobile | Capacitor `Filesystem` via `storage.ts` | `parseFile()` |

### Map ↔ Record Serialization

`MindMapDocument.nodes` ist intern `Map<string, MindMapNode>`. Für JSON/RPC:
- Serialisieren: `Object.fromEntries(doc.nodes)`
- Deserialisieren: `new Map(Object.entries(data.nodes))`

### Zustand Store (`useMindMapStore`) — Always-Yjs

- Store nutzt intern **immer ein `Y.Doc`** (auch standalone, ohne Server)
- `setDocument(doc)` → `documentToYDoc(doc)` → Y.Doc erstellen + `observeDeep` registrieren
- Alle Mutations über `yjs-operations.ts` (`yAddNode`, `yDeleteNode`, `yMoveNode`, etc.)
- **Nie direkt** `addNode`/`deleteNode` aus `@bloommd/core` im UI aufrufen — immer Store-Actions
- `Y.UndoManager` ersetzt die alte custom History — Content-Edits sind jetzt undo-fähig
- `observeDeep` auf `nodes` Map recomputed Layout automatisch
- `nodeContents` (Y.Text pro Node) sind separater Map — triggern keinen Layout-Recompute
- Wenn selektierter Node nach Undo nicht mehr existiert → fällt auf Root zurück
- `editorVisible` (boolean) steuert Editor-Sichtbarkeit, entkoppelt von `selectedNodeId`
- `syncProvider` / `syncStatus` / `connectSync(url)` / `disconnectSync()` für WebSocket-Sync
- `SyncProvider` nutzt `SYNC_ORIGIN` als Transaction-Origin → UndoManager ignoriert Remote-Updates
- `remoteUsers` (Array) enthält Remote-User mit Name, Farbe, selectedNodeId (via y-protocols/awareness)
- `setSelectedNodeId` broadcasted Selection automatisch an alle Peers
- `MindMapNode` zeigt farbige Dots unter Nodes für Remote-User-Präsenz
- `updateNodeContent` nutzt `yUpdateContentDiff` (fast-diff) für Character-Level CRDT-Merge
- `nodeContents.observeDeep()` synct Remote-Content-Änderungen in den Editor

### Sync-Server (`@bloommd/sync`)

- Room = 1 `.md` Datei = 1 `Y.Doc`
- WebSocket-Endpoint: `ws://localhost:4100/ws/:filename`
- y-protocols: SyncStep1/SyncStep2 Handshake, dann Update-Forwarding
- Persistence: Debounced 2.5s → `yDocToDocument()` → `serializeToMarkdown()` → `FileStore.write()`
- Room wird 30s nach letztem Client-Disconnect zerstört
- Env: `BLOOMMD_DIR`, `SYNC_PORT` (4100), `SYNC_PERSIST_DEBOUNCE`, `SYNC_DESTROY_DELAY`,
  `SYNC_PERSIST_RETRY_*`, `SYNC_PERSIST_SAVE_TIMEOUT_MS` (Timeouts werden per Operation
  abgeglichen und nie blind wiederholt)

### Keyboard-Shortcuts

- Event-Listener auf **capture phase** (`true`) — fängt vor CodeMirror/MDXEditor
- `deleteKeyCode={null}` auf ReactFlow — eigenes Delete deaktiviert
- Pfeiltasten navigieren zwischen Nodes (→ Kind, ← Parent, ↑↓ Siblings)
- Alt+Enter togglet Editor (funktioniert überall, auch im Editor)
- `focusCanvas()` stellt Fokus nach Mutations auf `#mindmap-canvas` wieder her

## Workflow — GitHub Project Board

**Das [GitHub Project Board `BloomMD Roadmap`](https://github.com/orgs/moellenbeck-digital/projects/3) ist die verbindliche TODO- und Backlog-Quelle für BloomMD.**

BloomMD-Tickets **müssen** im Repository `moellenbeck-digital/BloomMD` und im Project `BloomMD Roadmap`
(`https://github.com/orgs/moellenbeck-digital/projects/3`) erfasst werden. Tickets in anderen
Org-Projekten wie `SitePilot Bugs and Features` zählen nicht als korrekt geplant, auch wenn sie im
BloomMD-Repo oder in einem Milestone liegen.

- **Keine parallelen TODO-Listen:** Lokale Dateien wie `todo.md` oder Gesprächsnotizen nur als temporäre Arbeitsnotiz verwenden; dauerhafte Aufgaben ins Project Board überführen
- **Vor jeder Aufgabe:** Issue im Repo `moellenbeck-digital/BloomMD` anlegen (oder bestehendes verwenden), Labels setzen (`desktop`, `web`, `sync`, `core`, `ui`, `mobile`, `ux`, `infra` + `bug`/`enhancement`), ins Project `BloomMD Roadmap` aufnehmen und dort den Status setzen
- **Pflichtprüfung nach Ticketanlage:** `gh issue view <N> --repo moellenbeck-digital/BloomMD --json projectItems,milestone,labels` muss das Project `BloomMD Roadmap` mit passendem Status zeigen; falsch zugeordnete Project-Items sofort entfernen
- **Milestones:** Für geplante Milestone-Arbeit muss das Issue sowohl den Milestone als auch den Project-Status im `BloomMD Roadmap` haben; Milestone allein reicht nicht
- **Planung/Priorisierung:** Status, Reihenfolge und Umfang im Project Board pflegen, nicht ausschließlich in lokalen Dateien oder Chat-Verläufen
- **Board-Status sauber führen:**
  - `Backlog`: erfasst, aber noch nicht für den aktiven Milestone eingeplant
  - `Ready`: für den aktiven Milestone eingeplant und startklar, aber noch nicht begonnen
  - `In progress`: aktiv in Umsetzung, aber noch kein reviewbarer PR offen
  - `In review`: ein offener, reviewbarer PR setzt das Issue um; bleibt dort bis Merge oder Rework
  - `Done`: gemerged, verifiziert und Issue geschlossen
- **Während der Arbeit:** Lösungsansätze und Entscheidungen als Kommentar im Issue dokumentieren
- **Milestone-Start:** Beim offiziellen Start eines Milestones die eingeplanten Tickets auf `Ready` setzen; nicht pauschal auf `In progress`
- **PRs:** PRs referenzieren die betroffenen Issues (`fixes #N` oder `refs #N`); alle durch den PR abgedeckten Issues im Board auf `In review` setzen
- **Nach Abschluss:** Issue schließen, im Board auf Done verschieben
- **Neue Ideen/Bugs:** Sofort als Issue anlegen — kein Wissen nur im Kopf
- **Kleine Bugfixes:** Ebenfalls sofort als eigenes Issue anlegen und zusätzlich mit `bugfixing` labeln. Das gilt auch für klar abgegrenzte Dokumentations-, UX- und Release-Fehler.
- **PR-Reviews:** Wenn ein Review oder ein wichtiger PR-Kommentar gepostet wird, den PR dem zuständigen Autor bzw. Bearbeiter zuweisen, damit die Nachricht sichtbar und nachverfolgbar ist

## Wichtig

- Desktop Vite-Build braucht Custom `monorepoResolve` Plugin wegen Bun Workspace Hoisting
- Mobile Vite-Build braucht `commonjsOptions.transformMixedEsModules: true`
- `@bloommd/ui` Node-Styles unterstützen 6 Markdown-Levels (# bis ######)
- Env-Variablen App lokal: `apps/app/.env.local` auf Basis von `apps/app/.env.example`
- Env-Variablen Marketing lokal: `apps/marketing/.env.local` auf Basis von `apps/marketing/.env.example`
- Closed-Beta-Gate (`BLOOMMD_BETA_ACCESS`): `1` = Registrierung nur mit Einladung (Allowlist, Code oder DB-Einladung); jeder andere Wert bzw. nicht gesetzt = offene Selbst-Registrierung ohne Einladung. In beiden Zuständen gelten E-Mail-Bestätigung (ohne sie kein Login), Pflicht-Einwilligung zu Datenschutz/AGB und Signup-Limits (je E-Mail und je Client-Adresse, `SIGNUP_RATE_LIMIT` in `apps/app/src/lib/request-security.ts`). `BLOOMMD_E2E_AUTH_BYPASS`, `BLOOMMD_E2E_TEST_MODE` und `BLOOMMD_E2E_MAIL_OUTBOX` sind nur für Test-Server; `release:check` lehnt sie ab. Der Gate-Standardwert in Deployment/CI wird nicht ohne Owner-Freigabe geändert.
- Env-Variablen Hosted App-Beta: `DATABASE_URL`, `BLOOMMD_AUTH_SECRET`, `BLOOMMD_REQUIRE_AUTH=1`, `BLOOMMD_BETA_ACCESS=1` (Gate an; für offene Registrierung weglassen bzw. `0`), `BLOOMMD_BETA_ALLOWED_EMAILS` oder `BLOOMMD_BETA_INVITE_CODES` (nur bei Gate an), `BLOOMMD_BILLING_ENABLED=0`, `NEXT_PUBLIC_SITE_URL=https://bloommd.app`, `NEXT_PUBLIC_APP_URL=https://bloommd.app`, `NEXT_PUBLIC_MARKETING_URL=https://bloommd.io`
- Env-Variablen Marketing: `NEXT_PUBLIC_SITE_URL=https://bloommd.io`, `NEXT_PUBLIC_MARKETING_URL=https://bloommd.io`, `NEXT_PUBLIC_APP_URL=https://bloommd.app`, optional `BLOOMMD_WAITLIST_DATABASE_URL` (nur für die Abwicklung der beendeten Warteliste); keine App-/Sync-/Stripe-Secrets
- Desktop Data-Dir: `~/bloommd`
- M1 Desktop-Support ist macOS-first; Linux und Windows werden nach M1 als eigene Beta-Releases nachgezogen und dürfen M1 nicht blockieren
- Mobile Data-Dir: `Documents/bloommd/`
