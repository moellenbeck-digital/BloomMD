/**
 * A live sync connection follows its access token (#111, "revocation takes effect at once"): when
 * the token is revoked or expired, or the owner lowers its right, the open WebSocket stops
 * writing from the next message on, and a ticket of such a token no longer opens a connection.
 * Real Postgres, a real sync server in this process, the real client (SyncProvider) and the real
 * routes. Runs only with BLOOMMD_TEST_DATABASE_URL (a throwaway database; it is migrated here),
 * e.g. `docker run -d -e POSTGRES_PASSWORD=qa -p 55433:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFile, serializeToMarkdown, yDocToDocument, yUpdateContentDiff } from "../../packages/core/src/index";
import { SyncProvider } from "../../packages/ui/src/sync/SyncProvider";

const url = process.env.BLOOMMD_TEST_DATABASE_URL;
const SYNC_SECRET = "agent-token-sync-secret-with-enough-entropy-1234";
const BASE = "https://app.bloommd.test";

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;
type RouteModule = Record<"GET" | "POST" | "PUT", Handler>;

describe.skipIf(!url)("sync connections follow their access token (Postgres, real sync server)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  let stopSync: () => void = () => undefined;
  let syncRooms: () => Array<{ yDoc: Parameters<typeof yDocToDocument>[0] }> = () => [];
  let rightsRoute: RouteModule;
  let ticketRoute: RouteModule;
  const providers: Array<{ destroy: () => void }> = [];
  const run = Date.now().toString(36);

  let aliceId: string;
  let teamId: string;
  let ownerToken: string;
  let counter = 0;

  const post = async (handler: Handler, method: string, path: string, token: string, body: unknown, params: Record<string, string> = {}) => {
    const response = await handler(new Request(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve(params) as Promise<never> });
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
  };
  const setRights = (tokenId: string, access: string, areas: Record<string, string> = {}) =>
    post(rightsRoute.PUT, "PUT", `/api/workspaces/${teamId}/agent-rights`, ownerToken, { tokenId, access, areas }, { workspaceId: teamId });
  const ticketFor = (token: string, filename: string) => post(ticketRoute.POST, "POST", "/api/sync-ticket", token, { filename, workspaceId: teamId });

  const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 4000) => {
    const deadline = Date.now() + timeoutMs;
    while (!(await predicate())) {
      if (Date.now() > deadline) return false;
      await Bun.sleep(20);
    }
    return true;
  };
  const stored = async (filename: string) => (await db.readCloudDocument(aliceId, filename, teamId))?.markdown ?? "";
  const inRoom = (marker: string) => syncRooms().some((room) => serializeToMarkdown(yDocToDocument(room.yDoc)).includes(marker));

  /** A map, an agent token (with the given right) and an open live connection of that token. */
  const openSession = async (options: { access?: string; personal?: boolean } = {}) => {
    const filename = `Learnings › dev-team – live ${++counter}.md`;
    await db.writeCloudDocument({ userId: aliceId, workspaceId: teamId, filename, markdown: "# Karte\n\nStart.\n", frontmatter: {} });
    const created = await db.createAccessToken({ userId: aliceId, name: `live ${counter} ${run}`, scope: "write", ...(options.personal ? {} : { agentName: `Live-${counter}` }) });
    if (!options.personal) expect((await setRights(created.id, options.access ?? "write")).status).toBe(200);
    const ticket = await ticketFor(created.token, filename);
    expect(ticket.status).toBe(200);

    // The client document starts empty and receives the map from the server, like a browser tab.
    const template = (await import("../../packages/core/src/index")).documentToYDoc(parseFile("leer.md", "# Leer\n"));
    const doc = new (template.constructor as new () => typeof template)();
    const state = { revoked: false };
    const provider = new SyncProvider({ url: ticket.body!.websocketUrl as string, doc, resyncIntervalMs: 150, connectionTimeoutMs: 10_000, maxReconnectAttempts: 0, onAccessRevoked: () => { state.revoked = true; } });
    providers.push({ destroy: () => provider.destroy() });
    provider.connect();
    expect(await waitFor(() => yDocToDocument(doc).nodes.size > 0)).toBe(true);
    const edit = (marker: string) => {
      const current = yDocToDocument(doc);
      yUpdateContentDiff(doc, current.rootId, current.nodes.get(current.rootId)?.content ?? "", `${current.nodes.get(current.rootId)?.content ?? ""} ${marker}`);
    };
    return { filename, tokenId: created.id, token: created.token, state, edit, ticketPermission: ticket.body!.permission };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.BLOOMMD_SYNC_SECRET = SYNC_SECRET;
    process.env.BLOOMMD_AUTH_SECRET = "agent-token-sync-auth-secret-with-enough-entropy";
    db = await import("../../apps/app/src/lib/db");
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 2 });
    await db.migrateMarketSchema();
    await sql`delete from bloom_rate_limits where action = 'agent-rights-manage'`;

    const { createRoomManager } = await import("../../packages/sync/src/rooms");
    const { createSyncServer } = await import("../../packages/sync/src/server");
    const { createDatabasePersistence } = await import("../../packages/sync/src/persistence");
    const baseDir = mkdtempSync(join(tmpdir(), "bloom-agent-sync-"));
    const config = { baseDir, port: 0, persistDebounceMs: 20, destroyDelayMs: 20, syncSecret: SYNC_SECRET, databaseUrl: url };
    const roomManager = createRoomManager(config, createDatabasePersistence(url!));
    const { app, websocket } = createSyncServer(roomManager, config);
    const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
    syncRooms = () => [...roomManager.getRooms().values()];
    process.env.BLOOMMD_SYNC_INTERNAL_URL = `http://127.0.0.1:${server.port}`;
    process.env.NEXT_PUBLIC_SYNC_URL = `http://127.0.0.1:${server.port}`;
    stopSync = () => {
      void server.stop(true); // closes the open connections; waiting for it can hang on a client that is still closing
      rmSync(baseDir, { recursive: true, force: true });
    };

    const apiRoot = "../../apps/app/src/app/api";
    rightsRoute = (await import(`${apiRoot}/workspaces/[workspaceId]/agent-rights/route`)) as unknown as RouteModule;
    ticketRoute = (await import(`${apiRoot}/sync-ticket/route`)) as unknown as RouteModule;
    aliceId = (await db.upsertMarketUser({ provider: "password", email: `sync-alice-${run}@bloommd.test`, name: "Alice Owner" }))!.id;
    teamId = (await db.createTeamWorkspace({ userId: aliceId, name: `Sync Team ${run}` })).id;
    ownerToken = (await db.createAccessToken({ userId: aliceId, name: `Sync Alice ${run}`, scope: "write" })).token;
  });

  afterAll(async () => {
    for (const provider of providers) provider.destroy();
    stopSync();
    await sql?.end();
  });

  test("control: while the token is valid, an edit on the open connection reaches the database", async () => {
    const session = await openSession();
    expect(session.ticketPermission).toBe("write");
    session.edit("KONTROLLE-LIVE");
    expect(await waitFor(async () => (await stored(session.filename)).includes("KONTROLLE-LIVE"))).toBe(true);
  });

  test("revoking the token ends the open connection: the next edit is not applied and the client is told", async () => {
    const session = await openSession();
    session.edit("VOR-WIDERRUF");
    expect(await waitFor(async () => (await stored(session.filename)).includes("VOR-WIDERRUF"))).toBe(true);

    expect(await db.revokeAccessToken(aliceId, session.tokenId)).toBe(true);
    session.edit("NACH-WIDERRUF");

    expect(await waitFor(() => session.state.revoked)).toBe(true);
    await Bun.sleep(300);
    expect(inRoom("NACH-WIDERRUF")).toBe(false);
    expect(await stored(session.filename)).not.toContain("NACH-WIDERRUF");
    expect(await stored(session.filename)).toContain("VOR-WIDERRUF");
  });

  test("a personal token (no agent name) is followed as well", async () => {
    const session = await openSession({ personal: true });
    session.edit("PERSOENLICH-VOR");
    expect(await waitFor(async () => (await stored(session.filename)).includes("PERSOENLICH-VOR"))).toBe(true);
    await db.revokeAccessToken(aliceId, session.tokenId);
    session.edit("PERSOENLICH-NACH");
    expect(await waitFor(() => session.state.revoked)).toBe(true);
    expect(await stored(session.filename)).not.toContain("PERSOENLICH-NACH");
  });

  test("an expired token ends the open connection", async () => {
    const session = await openSession();
    await sql`update bloom_access_tokens set expires_at = now() - interval '1 minute' where id = ${session.tokenId}`;
    session.edit("ABGELAUFEN");
    expect(await waitFor(() => session.state.revoked)).toBe(true);
    expect(await stored(session.filename)).not.toContain("ABGELAUFEN");
  });

  test("lowering the right takes effect on the next edit; the connection itself stays open to read", async () => {
    const session = await openSession();
    session.edit("RECHT-WRITE-1");
    expect(await waitFor(async () => (await stored(session.filename)).includes("RECHT-WRITE-1"))).toBe(true);

    for (const lowered of ["read", "propose"]) {
      expect((await setRights(session.tokenId, lowered)).status).toBe(200);
      session.edit(`RECHT-${lowered}`);
      await Bun.sleep(400);
      expect(inRoom(`RECHT-${lowered}`)).toBe(false);
      expect(await stored(session.filename)).not.toContain(`RECHT-${lowered}`);
    }
    expect(session.state.revoked).toBe(false);
  });

  test("the longest area decides on every edit: write below Learnings/dev-team stays, then a read there stops it", async () => {
    const session = await openSession();
    // Default read, but write in the sub-area of this map: the edit goes through.
    expect((await setRights(session.tokenId, "read", { Learnings: "read", "Learnings/dev-team": "write" })).status).toBe(200);
    session.edit("BEREICH-WRITE");
    expect(await waitFor(async () => (await stored(session.filename)).includes("BEREICH-WRITE"))).toBe(true);

    // Default write, but the sub-area of this map is read-only: the next edit is not applied.
    expect((await setRights(session.tokenId, "write", { "Learnings/dev-team": "read" })).status).toBe(200);
    session.edit("BEREICH-READ");
    await Bun.sleep(400);
    expect(inRoom("BEREICH-READ")).toBe(false);
    expect(await stored(session.filename)).not.toContain("BEREICH-READ");
    expect(session.state.revoked).toBe(false);
  });

  test("a ticket issued before the revocation or the downgrade no longer opens or writes", async () => {
    // Revoked after the ticket was issued: the connection is refused, nothing is sent to the client.
    const revoked = await openSession();
    const staleTicket = await ticketFor(revoked.token, revoked.filename);
    await db.revokeAccessToken(aliceId, revoked.tokenId);
    const frames: number[] = [];
    const closed = await new Promise<number>((resolve) => {
      const socket = new WebSocket(staleTicket.body!.websocketUrl as string);
      socket.binaryType = "arraybuffer";
      socket.onmessage = (event) => frames.push((event.data as ArrayBuffer).byteLength);
      socket.onclose = (event) => resolve(event.code);
      setTimeout(() => { socket.close(); resolve(-1); }, 4000);
    });
    expect(closed).not.toBe(-1);
    expect(frames).toEqual([]);

    // Downgraded after the ticket (permission "write") was issued: the connection opens, but only to read.
    const lowered = await openSession();
    const writeTicket = await ticketFor(lowered.token, lowered.filename);
    expect(writeTicket.body!.permission).toBe("write");
    await setRights(lowered.tokenId, "read");
    const template = (await import("../../packages/core/src/index")).documentToYDoc(parseFile("leer.md", "# Leer\n"));
    const doc = new (template.constructor as new () => typeof template)();
    const provider = new SyncProvider({ url: writeTicket.body!.websocketUrl as string, doc, resyncIntervalMs: 150, connectionTimeoutMs: 10_000, maxReconnectAttempts: 0 });
    providers.push({ destroy: () => provider.destroy() });
    provider.connect();
    expect(await waitFor(() => yDocToDocument(doc).nodes.size > 0)).toBe(true);
    const current = yDocToDocument(doc);
    yUpdateContentDiff(doc, current.rootId, current.nodes.get(current.rootId)?.content ?? "", "ALTES-TICKET");
    await Bun.sleep(400);
    expect(inRoom("ALTES-TICKET")).toBe(false);
    expect(await stored(lowered.filename)).not.toContain("ALTES-TICKET");
  });
});
