# BloomMD Architecture

## Principles

1. Markdown remains the portable source format.
2. Local workflows do not require an account or cloud database.
3. Cloud persistence is isolated by workspace and document.
4. Realtime authorization is short-lived and document-scoped.
5. Web, desktop, mobile, and the Obsidian companion share the same file semantics.

## System Map

```text
Markdown / browser folder / Obsidian vault
                  |
          @bloommd/core
    remark parser + Yjs document
                  |
          @bloommd/ui
 React Flow + editor + view modes
       /          |          \
 Next.js      Electrobun    Capacitor
    |              |
 API routes    local RPC/files
    |
 Auth + workspace authorization
    |
 Postgres documents <-> signed sync ticket <-> WebSocket sync
```

## Markdown Model

Headings are structural nodes. Heading depth defines hierarchy; blocks until the next heading are node content. Files remain valid Markdown and BloomMD stores only optional HTML comments for durable identity and typed-node metadata:

```markdown
# Research <!-- bloommd:id=research -->

## CommonMark <!-- bloommd:id=commonmark --> <!-- bloommd:meta={"kind":"source","url":"https://spec.commonmark.org/0.31.2/"} -->
```

The shared parser uses `unified` and `remark-parse`, preserves frontmatter and pre-heading content, supports multiple top-level heading trees, ignores apparent headings inside code/HTML/blockquote content, and normalizes serialization to ATX headings. Regression tests cover Setext headings, fenced and indented code, reference links, nested lists, rich Markdown, stable IDs, and metadata roundtrips.

Typed node kinds are `topic`, `workspace`, `folder`, `portal`, `web`, `file`, `pdf`, `source`, `task`, and `decision`. Metadata is optional; removing it returns a node to a plain Markdown topic.

## Workspace Map Model

Opening a folder creates a derived `MindMapDocument`, not a new Markdown source file. The workspace root is synthetic, folders and Markdown files become structural nodes, and every Markdown file is parsed below its file node as the normal heading tree. Cross-file `[[Page]]` and Markdown references are stored as derived references on the document so the shared canvas can render them as relation edges without writing those edges into Markdown.

When a file has exactly one top-level H1 with the same title as its file node and no semantic node metadata, the derived view combines them into the file node. Its child headings attach directly to that node; root content and references are retained, including redirects of heading anchors and local portal targets. Distinct titles, multiple roots, other heading levels and semantic root metadata retain separate heading nodes. The cached source contributions and Markdown files are unchanged.

Derived workspace documents carry `derived.kind = "workspace"` and `writable = false`. Save/export flows must refuse to serialize them as one large Markdown file. Editing remains file-scoped: opening a file node switches into the concrete source document, and only that file is written back.

## LLM Wiki Direction

BloomMD is the visual and deterministic layer for an LLM-maintained Markdown wiki. Raw sources remain preserved, Wiki pages are ordinary Markdown concepts, and a human-defined schema controls metadata and workflows. Agent execution is intentionally not part of the current core runtime.

The Wiki Bundle implements OKF v0.2 (reading v0.1 too): `index.md` declares `okf_version`, `log.md` records the audit trail, and pages carry typed YAML frontmatter, relative links, and OKF trust signals (`sources`, `generated`, `verified`, `status`, `stale_after`). A trust tier is derived, never stored. BloomMD's `contentHash` per source is an optional extension for drift detection. The Core package exposes deterministic `status`, `lint`, `index`, and `log` operations plus a proposal/diff/apply workflow. The CLI runs these operations without an LLM. An agent may propose a Markdown patch; BloomMD validates hashes, renders the diff, records an audit event, and requires explicit approval before applying it.

## Shared UI

`packages/ui` owns the main React Flow canvas used by the web and desktop renderers:

- Dagre hierarchy layout and collapsible branches
- hierarchy, link, backlink, and combined edge modes
- focus, outline, and presentation modes
- local view snapshots containing viewport, focused branch, collapsed IDs, and edge mode
- indexed before/inside/after branch drops
- Shift multi-select and in-app branch copy/paste
- portal/resource actions and typed-node editor controls
- Yjs undo/redo and character-level content updates

The Obsidian plugin has its own React Flow host because it must use Obsidian views and vault APIs. It persists positions and viewport in local plugin data and edits the active Markdown note with conflict checks.

## Local Storage

Desktop and self-hosted modes use `FileStore` with normalized paths, traversal protection, and backups. The web editor can also open a local directory through the File System Access API. Directory handles remain browser-local; BloomMD requests explicit read/write permission and excludes these documents from API saves and cloud sync.

## Postgres Cloud Storage

A cloud database is optional for local/self-hosted use and required for hosted authenticated workspaces. Connectivity is provider neutral: the private beta targets platform Postgres via CloudNativePG, and any TLS-reachable Postgres behaves the same. The cloud schema contains:

- `bloom_users`, auth tokens, subscriptions, and entitlements
- `bloom_workspaces`
- `bloom_workspace_members` with `owner`, `editor`, and `viewer` roles
- `bloom_workspace_agents`, `bloom_agent_tasks`, and `bloom_agent_proposals` for visible,
  review-only workspace agents
- `bloom_documents` with `workspace_id`, Markdown, frontmatter, soft deletion, and optimistic `version`
- `bloom_document_views` for future cloud view sharing; current UI presets are deliberately local

Every storage query first resolves membership for the authenticated UUID user. Filenames are unique only inside one active workspace, so two tenants may safely use the same filename. Writes reject viewers and stale versions.

Browser sessions are signed, revocable database records. Native clients use revocable personal access tokens that are stored only as hashes. Cross-tenant saved-view references are rejected twice: by application authorization and by a composite database foreign key from `(document_id, workspace_id)` to the owning document.

Existing legacy filesystem files are not silently assigned to the first cloud user. Migration needs an explicit ownership decision.

## Workspace Agents

The first hosted workspace agent is OpenClaw. It is a separate service identity, not a human user
and not a Sync client. A workspace owner explicitly adds or revokes it; editors can assign it work,
while viewers remain read-only.

An assignment starts in the visible **Agent beauftragen** window with an `@OpenClaw` instruction.
The app sends the deployment-owned adapter exactly one bounded context: the selected document's
filename, Markdown, version, the workspace ID/name, and the task ID. It does not send database URLs,
sync secrets, access tokens, or the rest of the workspace. The adapter can return a summary and one
complete Markdown proposal. BloomMD stores that proposal as an isolated *Vorschlagszweig* bound to
the source hash and version.

Only a human editor or owner can accept or reject a proposal. Acceptance rechecks the document hash
and version, then writes through the sync server using the reviewing human's identity. A changed
source becomes `stale` instead of being overwritten. Agent membership, task lifecycle, rejection,
staleness, and acceptance create content-free audit events; task and proposal content are kept in
their scoped workspace records for review.

Agenten werden lokal gepaart und bauen selbst eine ausgehende Verbindung zu BloomMD auf. Der Server
speichert nur gehashte, widerrufbare Agent-Tokens; ein Agent erhält ausschließlich den Kontext eines
selbst abgeholten Auftrags und kann nur überprüfbare Vorschläge zurückgeben.

## Realtime Sync

The collaboration implementation covers workspace lifecycle, invitations, member removal,
roles, bilingual onboarding, security checks, and rollout.

The web API issues a five-minute HMAC ticket containing:

```text
userId, workspaceId, documentId, filename, permission, expiresAt
```

The sync server verifies the signature, expiry, exact WebSocket document path, and permission. A cloud room is keyed by document ID rather than filename. Read-only clients may receive Yjs sync and awareness messages but cannot submit updates. Database persistence verifies document/workspace membership on load and rechecks owner/editor membership plus the expected document version on every save.

The sync server is the single cloud-document write authority. Web, desktop, mobile, and other clients do not write `bloom_documents` directly: create, version-checked snapshot, rename, and delete go through the secret-protected internal sync command API. Snapshot commands serialize with room open/close and mutation locks and are rejected while a room has connected clients, pending persistence, or a persistence error. The previous unconditional database-version fallback is intentionally absent; a conflict is surfaced as `VERSION_CONFLICT` instead of overwriting newer Yjs state. The low-level database mutation helpers remain only for the isolated release-verification script and are not part of the runtime request path.

Required hosted configuration:

```text
DATABASE_URL=postgresql://...
BLOOMMD_AUTH_SECRET=<long random secret>
BLOOMMD_REQUIRE_AUTH=1
BLOOMMD_SYNC_SECRET=<at least 32 random characters>
NEXT_PUBLIC_SYNC_URL=wss://sync.bloommd.app
SYNC_REPLICA_COUNT=1
```

`SYNC_API_KEY` remains only as a legacy self-hosted filesystem-sync option. Static sync tokens are not exposed to the browser.

## Security Boundary

Application-level tenant authorization and database-level saved-view integrity are implemented and live-schema isolation has been tested with two temporary users, separate workspaces, identical filenames, denied cross-workspace access, optimistic versions, access-token isolation/revocation, rate limits, account export/deletion, Stripe retry behavior, and cascading cleanup.

Content-free security audit events record session creation/revocation, verification and reset token use, password changes, and personal access-token creation/revocation. They contain user and generated target UUIDs only, never Markdown, file names, email addresses, URLs, token values, or request bodies, and are removed by the configured retention job.

Mutating cookie-authenticated routes require an exact same-origin request. Request bodies are content-type checked and size bounded, API responses are not cached, and the production gate requires TLS URLs, non-placeholder secrets, Resend, Sentry, legal identity, a usable closed-beta gate, and a single sync writer replica. Stripe credentials are demanded only when billing is enabled. Public operation still needs a database restore drill, provider-level smoke tests, load/reconnect tests, signed native artifacts, and an independent production security review.

## Packages

| Package | Responsibility |
|---|---|
| `packages/core` | Markdown AST, tree operations, Yjs bridge, sync tickets, local file store |
| `packages/ui` | Shared React UI and React Flow interactions |
| `apps/app` | Next.js app, auth, billing, APIs, Postgres tenant storage, browser workspaces |
| `packages/sync` | WebSocket rooms, ticket enforcement, filesystem/Postgres persistence |
| `packages/desktop` | Electrobun host, native filesystem and RPC |
| `packages/mobile` | Capacitor renderer |
| `plugins/obsidian` | Obsidian companion view and vault-safe Markdown editing |

## Verification

Run the complete local gate from the repository root:

```bash
node --version # v22.x
bun run typecheck
bun run test
bun run build
bun audit
bun run --cwd plugins/obsidian release:package
```

The web E2E suite uses a non-production auth bypass and repository fixtures; it does not contact the database. Tenant isolation is validated separately with temporary database records through `bun run --cwd apps/app db:verify`. Production deployment must additionally pass `bun run --cwd apps/app release:check` using the real environment.
