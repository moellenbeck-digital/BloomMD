# Web Collaboration and LLM Wiki

## Yjs collaboration

The web app keeps the active document in a Yjs document. The sync service exchanges Yjs protocol messages over WebSocket and persists the resulting Markdown through the configured storage adapter. Cloud document mutations have one authority: the sync service. Web, desktop, mobile, and other clients call the private document-command endpoints for create, version-checked snapshot, rename, and delete; the web app never writes a cloud document directly to Postgres.

The snapshot command may open an idle room when a client is disconnected, but it refuses to overwrite an active room, a room with pending persistence, or a degraded room (`SYNC_ROOM_ACTIVE`, `SYNC_ROOM_PENDING`, `SYNC_ROOM_DEGRADED`). A stale version returns `VERSION_CONFLICT`; an unavailable or active sync authority returns an explicit error so the client can retain the local Yjs state and retry after reconnecting. Local filesystem/browser workspaces remain independent and continue to use their local storage adapter.

Cloud rooms use short-lived HMAC sync tickets. The browser requests a fresh ticket when a document is opened and refreshes it before every automatic reconnect. The ticket contains the user, workspace, document, filename, expiry, and read/write permission. The sync server validates the ticket before accepting the WebSocket and the persistence adapter remains the final authorization boundary.

Presence is awareness data only. It contains the authenticated display name, an optional account
email for hover/accessibility labels, a collision-resolved color, and the selected node ID. The
email is not rendered as permanent badge text. Markdown contents are not sent as analytics data;
presence remains ephemeral Yjs awareness and is cleared when a client disconnects.

Required web configuration for database-backed collaboration:

```env
NEXT_PUBLIC_SYNC_URL=wss://sync.bloommd.app
BLOOMMD_SYNC_SECRET=<at-least-32-character-secret>
DATABASE_URL=postgresql://bloommd:<password>@<host>:5432/bloommd?sslmode=require
BLOOMMD_AUTH_SECRET=<at-least-32-character-secret>
```

The sync process and the web process must use the same `BLOOMMD_SYNC_SECRET`. `NEXT_PUBLIC_SYNC_URL` is a browser URL and must use `wss://` in production.

## LLM Wiki

The public Wiki route is read-only. It exposes pages, the deterministic audit log, extracted safe references, and provenance hashes. Agent changes use the local MCP transport and the explicit `propose -> approve -> apply` boundary. Applying a proposal validates the page hash first, regenerates `index.md`, and appends an audit entry to `log.md`.

Enable the public read view with:

```env
BLOOMMD_WIKI_PUBLIC=1
BLOOMMD_WIKI_DIR=/srv/bloommd/wiki
```

For deterministic source drift checks, provide a server-side JSON register. The file is never sent directly to the browser:

```env
BLOOMMD_WIKI_SOURCE_HASHES=/srv/bloommd/wiki-source-hashes.json
```

Example register:

```json
{
  "docs:architecture": "sha256:...",
  "notes/research.md": "sha256:..."
}
```

Alternatively, let BloomMD read the current hashes from the source folder itself. Each cited local source (`sources[].resource`, a path relative to this folder) is hashed from its raw bytes; a source whose size and modification time did not change is not read again between requests. The folder wins when both variables are set:

```env
BLOOMMD_WIKI_SOURCES_DIR=/srv/bloommd/wiki-sources
```

`/api/wiki` and `/wiki` then show "Quelle geändert" / "Source has changed" and "Quelle fehlt" / "Source is missing" per page and citation; `status` adds `missingSourceFileCount` and `unmonitoredSourceCount`, and `sourceMode` is `live`. `http(s)` sources are not watched. A path that is not a folder is logged and treated as if the variable were unset. The same check is available as `bloommd-wiki status|lint|watch|mcp --sources <folder>`.

Without this register the UI explicitly reports that provenance is not verified. It must not claim that a page is fresh merely because the current source index is unavailable.

### Reviewing proposals in the app

The public `/api/wiki` stays read-only and never carries proposals. A signed-in person can review agent proposals on `/wiki` of `apps/app` (view "Vorschläge" / "Proposals") when the folder is configured:

```env
BLOOMMD_WIKI_PROPOSALS_DIR=/srv/bloommd/wiki-proposals
BLOOMMD_WIKI_DIR=/srv/bloommd/wiki
```

Without `BLOOMMD_WIKI_PROPOSALS_DIR` (and `BLOOMMD_WIKI_DIR`) the whole feature is off: the view is hidden and the routes answer 404. Each proposal is one file `<id>.json` — the `WikiProposal` written by the CLI or MCP tools, extended by `status` (`open` when absent, `applied`, `discarded`). A discarded proposal carries `discardReason`, `discardedBy` and `discardedAt` and is never deleted.

| Route | Purpose |
| --- | --- |
| `GET /api/wiki/proposals` | Open proposals with before/after per page, cited sources (hash status `unchanged`, `changed`, `no-hash`, `unverified` against `BLOOMMD_WIKI_SOURCE_HASHES`) and whether the page changed since creation. 401 without session. |
| `POST /api/wiki/proposals/<id>/approve` | `approveWikiProposal` for the session name (name, else email) directly followed by `applyWikiProposal`; the Wiki log names the reviewer. 409 `wiki-page-changed` when the page changed; the bundle stays untouched. |
| `POST /api/wiki/proposals/<id>/discard` | Body `{ "reason": "…" }`, mandatory. The bundle is not changed. |

Both POST routes need a signed-in session (401), a same-origin request (403) and never read the reviewer name from the request.

## Local verification

```bash
bun run typecheck
bun test packages/core/src/wiki.test.ts packages/core/src/wiki-agent.test.ts packages/sync/src
bun run --cwd apps/app build
bun run --cwd apps/app dev -- -p 3001
```

Then open `/demo`, `/app`, and `/wiki`. Real multi-user testing requires two browser sessions with authenticated users and a running sync service configured with the same secret.

## Single-writer verification runbook

Use two authenticated browser sessions, A and B, with the same cloud document open:

1. Edit the document in A and wait until the sync status is healthy. B must receive the Yjs update without a direct database write from the web app.
2. Disconnect A, make a local change, and reconnect A. The local Yjs change must remain present and be advertised during the next handshake; it must not be silently replaced by the older database snapshot.
3. While B is connected, invoke a REST snapshot, rename, or delete for the same document. The command must be rejected with `SYNC_ROOM_ACTIVE` and leave the active Yjs room unchanged.
4. After both clients disconnect and persistence completes, retry the command with the current version. It may proceed once the room is idle and healthy; a stale version must return `VERSION_CONFLICT`.
5. Force a persistence failure and verify `SYNC_ROOM_DEGRADED`/`SYNC_ROOM_PENDING` is visible to the caller. Recovery requires reconciliation or a successful retry, never an unconditional overwrite.

The deterministic test coverage mirrors this sequence for active rooms, competing REST/Yjs writes, stale versions, rename/delete races, reconnects with pending local changes, and persistence failures. The two-session production check is still required after deployment because it validates the actual ingress, database, and sync-service wiring together.
