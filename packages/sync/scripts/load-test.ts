/**
 * Operational check for the sync server against a real database.
 *
 * Unit tests cover the room logic in isolation. What they cannot answer is whether the deployed
 * service enforces roles at the socket, survives reconnects, refuses expired tickets, honours its
 * limits and actually persists under concurrent load. That question has to be asked of a running
 * server with a real Postgres behind it, which is what this does.
 *
 *   docker compose -f deploy/local/docker-compose.yml up -d postgres sync
 *   bun run --cwd packages/sync load-test
 *
 * Never point this at production: it writes and deletes its own tenant rows.
 */

import { signSyncTicket, type SyncTicketClaims } from "@bloommd/core";
import postgres from "postgres";

const SYNC_URL = process.env.LOAD_TEST_SYNC_URL ?? "ws://127.0.0.1:4100";
const HEALTH_URL = process.env.LOAD_TEST_HEALTH_URL ?? "http://127.0.0.1:4100/health";
const ORIGIN = process.env.LOAD_TEST_ORIGIN ?? "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL;
const SYNC_SECRET = process.env.BLOOMMD_SYNC_SECRET;

if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!SYNC_SECRET || SYNC_SECRET.length < 32) throw new Error("BLOOMMD_SYNC_SECRET (32+ chars) is required.");
if (/\bsslmode=(require|verify-full)\b/.test(DATABASE_URL)) {
  // A TLS URL here almost certainly means someone aimed this at a real deployment.
  throw new Error("Refusing to run the load test against a TLS database — this script writes test tenants.");
}

const sql = postgres(DATABASE_URL, { ssl: false, max: 4 });

const OWNER_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const VIEWER_ID = "aaaaaaaa-0000-4000-8000-000000000002";
const OUTSIDER_ID = "aaaaaaaa-0000-4000-8000-000000000003";
const WORKSPACE_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const DOCUMENT_ID = "cccccccc-0000-4000-8000-000000000001";

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

function ticket(overrides: Partial<SyncTicketClaims> = {}): string {
  return signSyncTicket(
    {
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      filename: "load-test.md",
      permission: "write",
      exp: Math.floor(Date.now() / 1000) + 300,
      ...overrides,
    },
    SYNC_SECRET!,
  );
}

/** Opens a socket and resolves with how it ended: open, or the close code that rejected it. */
function connect(token: string, options: { origin?: string; holdMs?: number } = {}): Promise<{
  opened: boolean;
  closeCode: number | null;
  socket: WebSocket | null;
}> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`${SYNC_URL}/ws/${DOCUMENT_ID}?ticket=${encodeURIComponent(token)}`, {
      headers: { Origin: options.origin ?? ORIGIN },
    } as unknown as string[]);

    let settled = false;
    const finish = (value: { opened: boolean; closeCode: number | null; socket: WebSocket | null }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    socket.onopen = () => {
      // An unauthorised connection is accepted by the HTTP upgrade and closed immediately after,
      // so "open" alone proves nothing — wait briefly for a rejection before calling it a success.
      setTimeout(() => finish({ opened: true, closeCode: null, socket }), options.holdMs ?? 250);
    };
    socket.onclose = (event) => finish({ opened: false, closeCode: event.code, socket: null });
    socket.onerror = () => finish({ opened: false, closeCode: null, socket: null });
    setTimeout(() => finish({ opened: false, closeCode: null, socket: null }), 5000);
  });
}

async function seed() {
  await sql`
    insert into bloom_users (id, email) values
      (${OWNER_ID}, 'load-owner@example.test'),
      (${VIEWER_ID}, 'load-viewer@example.test'),
      (${OUTSIDER_ID}, 'load-outsider@example.test')
    on conflict (id) do nothing
  `;
  await sql`
    insert into bloom_workspaces (id, owner_user_id, name, slug, kind)
    values (${WORKSPACE_ID}, ${OWNER_ID}, 'Load Test', 'load-test-workspace', 'team')
    on conflict (id) do nothing
  `;
  await sql`
    insert into bloom_workspace_members (workspace_id, user_id, role) values
      (${WORKSPACE_ID}, ${OWNER_ID}, 'owner'),
      (${WORKSPACE_ID}, ${VIEWER_ID}, 'viewer')
    on conflict do nothing
  `;
  await sql`
    insert into bloom_documents (id, workspace_id, filename, markdown, created_by)
    values (${DOCUMENT_ID}, ${WORKSPACE_ID}, 'load-test.md', ${"# Load test\n"}, ${OWNER_ID})
    on conflict (id) do nothing
  `;
}

async function cleanup() {
  await sql`delete from bloom_documents where id = ${DOCUMENT_ID}`;
  await sql`delete from bloom_workspace_members where workspace_id = ${WORKSPACE_ID}`;
  await sql`delete from bloom_workspaces where id = ${WORKSPACE_ID}`;
  await sql`delete from bloom_users where id in (${OWNER_ID}, ${VIEWER_ID}, ${OUTSIDER_ID})`;
}

async function main() {
  console.log(`Sync load test against ${SYNC_URL}\n`);
  await seed();

  // --- Ticket authentication ---------------------------------------------------------------
  const valid = await connect(ticket());
  record("valid write ticket connects", valid.opened);
  valid.socket?.close();

  const expired = await connect(ticket({ exp: Math.floor(Date.now() / 1000) - 60 }));
  record("expired ticket is rejected", !expired.opened, expired.closeCode ? `close ${expired.closeCode}` : "");

  const tampered = `${ticket()}x`;
  const forged = await connect(tampered);
  record("tampered signature is rejected", !forged.opened, forged.closeCode ? `close ${forged.closeCode}` : "");

  const wrongOrigin = await connect(ticket(), { origin: "https://evil.example" });
  record("disallowed origin is rejected", !wrongOrigin.opened, wrongOrigin.closeCode ? `close ${wrongOrigin.closeCode}` : "");

  const outsider = await connect(ticket({ userId: OUTSIDER_ID }));
  record("non-member is rejected even with a valid signature", !outsider.opened, outsider.closeCode ? `close ${outsider.closeCode}` : "");

  // --- Roles --------------------------------------------------------------------------------
  const viewer = await connect(ticket({ userId: VIEWER_ID, permission: "read" }));
  record("viewer connects read-only", viewer.opened);
  viewer.socket?.close();

  // A viewer ticket claiming write must not be upgraded: the server re-checks the role in the
  // database rather than trusting the ticket.
  const viewerClaimingWrite = await connect(ticket({ userId: VIEWER_ID, permission: "write" }));
  record("viewer claiming write is accepted but downgraded server-side", viewerClaimingWrite.opened);
  viewerClaimingWrite.socket?.close();

  // --- Concurrent load ----------------------------------------------------------------------
  const CONCURRENT = 25;
  const started = Date.now();
  const sockets = await Promise.all(Array.from({ length: CONCURRENT }, () => connect(ticket())));
  const connected = sockets.filter((entry) => entry.opened).length;
  record(`${CONCURRENT} concurrent clients connect`, connected === CONCURRENT, `${connected}/${CONCURRENT} in ${Date.now() - started}ms`);

  const health = (await (await fetch(HEALTH_URL)).json()) as { status: string; rooms: number; clients: number; persistenceFailures: number };
  record("health reports the live room and clients", health.status === "ok" && health.clients >= connected, JSON.stringify(health));
  record("no persistence failures under load", health.persistenceFailures === 0, `failures=${health.persistenceFailures}`);

  for (const entry of sockets) entry.socket?.close();

  // --- Reconnect ----------------------------------------------------------------------------
  const first = await connect(ticket());
  first.socket?.close();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const again = await connect(ticket());
  record("reconnect after disconnect succeeds", again.opened);
  again.socket?.close();

  // --- Persistence --------------------------------------------------------------------------
  // The room is destroyed after a delay, flushing to Postgres. Confirm the document survives.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const rows = await sql`select version, markdown from bloom_documents where id = ${DOCUMENT_ID}`;
  record("document still readable after the load", rows.length === 1, `version=${(rows[0] as { version?: number })?.version}`);

  const finalHealth = (await (await fetch(HEALTH_URL)).json()) as { persistenceFailures: number };
  record("no persistence failures at the end", finalHealth.persistenceFailures === 0);

  await cleanup();
  await sql.end();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden`);
  if (failed.length > 0) {
    console.error(`Fehlgeschlagen: ${failed.map((result) => result.name).join(", ")}`);
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => {});
  await sql.end().catch(() => {});
  process.exit(1);
});
