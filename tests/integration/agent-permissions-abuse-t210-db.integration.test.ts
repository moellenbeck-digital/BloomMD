/**
 * Ticket #210 — Missbrauchsfälle der Agent-Berechtigungen gegen echte Routen, echte Token-Auflösung und echtes Postgres.
 * Ergänzt die Tests zu #111 (`agent-token-rights-db`, `agent-token-gate-routes-db`) um die Lücken der Anforderung und doppelt
 * deren Fälle nicht (Rechte je Bereich per längstem Präfix, Widerruf der Map-Routen, Eigentümer-Werkzeuge ohne Agent usw.).
 * Rechteprüfung, Token-Auflösung und Speicher sind nicht gemockt: Die Routen laufen als Handler auf echten `Request`-Objekten,
 * Schreibzugriffe gehen durch einen echten Sync-Server (in diesem Prozess) in die Datenbank.
 *
 * Warum kein Playwright-Spec: Access-Tokens liegen in Postgres, und der Playwright-Stack läuft mit `BLOOMMD_E2E_AUTH_BYPASS=1`
 * ohne Datenbank (und der Playwright-Job der CI hat keine). Dieser Test läuft dort, wo Postgres ist: im CI-Job `verify`
 * (`bun test tests/integration/*.test.ts` im Schritt „Run unit tests“, danach „DB tests ran without skips“). Er läuft nur mit
 * BLOOMMD_TEST_DATABASE_URL (Wegwerf-Datenbank, wird hier migriert), z. B. `docker run -d -e POSTGRES_PASSWORD=qa -p 55433:5432 postgres:17-alpine`.
 *
 * Kriterien (je im Testtitel):
 *  K6  Token mit Scope `read` ändert nichts (Anlegen, Ersetzen, Umbenennen, Löschen, Knoten, Sync-Ticket), Lesen geht (200).
 *  K7  Recht `propose`: Schreibversuch wird als Vorschlag abgelegt, die Datei bleibt unverändert, erst die Freigabe des Eigentümers wirkt;
 *      Bereich mit `read`: Vorschlag/Schreiben abgelehnt.
 *  K8  Das Bereichsrecht gilt vor dem Gesamtrecht (in beide Richtungen); Schreiben in einem fremden Workspace wird abgelehnt.
 *  K9  Unbekannter, widerrufener und abgelaufener Token → 401 auf jeder Route, auch wenn Anonymzugriff und Instanz-Schlüssel offen wären.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testDatabaseUrl } from "./db-test-url";

const url = testDatabaseUrl();
const SYNC_SECRET = "agent-abuse-t210-sync-secret-with-enough-entropy";
const BASE = "https://app.bloommd.test";

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;
type RouteModule = Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>;

interface Body {
  code?: string;
  mode?: string;
  proposalId?: string;
  applied?: string;
}

interface Reply {
  status: number;
  body: Body | null;
}

describe.skipIf(!url)("agent permissions abuse (Postgres, real sync server) @t210", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  let stopSync: () => Promise<void> = async () => undefined;
  const run = Date.now().toString(36);

  let routes: {
    mindmap: RouteModule;
    mindmaps: RouteModule;
    nodes: RouteModule;
    syncTicket: RouteModule;
    rights: RouteModule;
    proposals: RouteModule;
    proposal: RouteModule;
    log: RouteModule;
    selfRights: RouteModule;
    selfChanges: RouteModule;
    selfUndo: RouteModule;
    agents: RouteModule;
    tasks: RouteModule;
    events: RouteModule;
  };

  let aliceId: string;
  let bobId: string;
  let teamA: string;
  let teamB: string;
  let ownerToken: string; // Alice's own token (no agent name): the "browser" owner

  const call = async (
    handler: Handler,
    method: string,
    path: string,
    token: string,
    options: { body?: unknown; workspace?: string; params?: Record<string, string>; headers?: Record<string, string> } = {},
  ): Promise<Reply> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...options.headers };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.workspace) headers["X-BloomMD-Workspace-ID"] = options.workspace;
    const response = await handler(new Request(`${BASE}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }), { params: Promise.resolve(options.params ?? {}) as Promise<never> });
    return { status: response.status, body: (await response.json().catch(() => null)) as Reply["body"] };
  };

  const agent = async (name: string, options: { workspaceIds?: string[]; scope?: "read" | "write" } = {}) => {
    const created = await db.createAccessToken({ userId: aliceId, name: `${name} ${run}`, scope: options.scope ?? "write", agentName: name, workspaceIds: options.workspaceIds });
    return { id: created.id, token: created.token, name };
  };

  const area = (path: string) => `Learnings › ${path}`;
  const createMap = async (filename: string, workspaceId = teamA, userId = aliceId) => {
    await db.writeCloudDocument({ userId, workspaceId, filename, markdown: `# ${filename}\n\nStart.\n`, frontmatter: {} });
    return filename;
  };
  const markdownOf = async (filename: string, workspaceId = teamA, userId = aliceId) => (await db.readCloudDocument(userId, filename, workspaceId))?.markdown ?? null;
  const edit = (marker: string) => `# Karte\n\n## ${marker}\n\nvom Agenten\n`;
  const encoded = (file: string) => encodeURIComponent(file);

  const putMap = (filename: string, token: string, marker: string, workspace = teamA) =>
    call(routes.mindmap.PUT, "PUT", `/api/mindmaps/${encoded(filename)}`, token, { body: { markdown: edit(marker), overwrite: true, agentMeta: { tool: "test", reason: `Grund ${marker}`, source: "integration" } }, workspace, params: { filename } });

  const setRights = (tokenId: string, access: string, areas: Record<string, string> = {}) =>
    call(routes.rights.PUT, "PUT", `/api/workspaces/${teamA}/agent-rights`, ownerToken, { body: { tokenId, access, areas }, params: { workspaceId: teamA } });

  const count = async (table: string, where: string, ...values: string[]) => Number((await sql.unsafe(`select count(*)::int as n from ${table} where ${where}`, values))[0]!.n);
  const proposalsOf = (tokenId: string) => count("bloom_agent_token_proposals", "access_token_id = $1", tokenId);
  const changesOf = (tokenId: string) => count("bloom_agent_token_changes", "access_token_id = $1", tokenId);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.BLOOMMD_SYNC_SECRET = SYNC_SECRET;
    process.env.BLOOMMD_AUTH_SECRET = "agent-abuse-t210-auth-secret-with-enough-entropy";
    db = await import("../../apps/app/src/lib/db");
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 2 });
    await db.migrateMarketSchema();
    // The owner routes allow 120 changes per hour and source address; earlier runs on this database must not count.
    await sql`delete from bloom_rate_limits where action = 'agent-rights-manage'`;

    // A real sync server on the same database: the map writes of the routes go through it.
    const { createRoomManager } = await import("../../packages/sync/src/rooms");
    const { createSyncServer } = await import("../../packages/sync/src/server");
    const { createDatabasePersistence } = await import("../../packages/sync/src/persistence");
    const baseDir = mkdtempSync(join(tmpdir(), "bloom-agent-abuse-t210-"));
    const config = { baseDir, port: 0, persistDebounceMs: 20, destroyDelayMs: 20, syncSecret: SYNC_SECRET, databaseUrl: url };
    const roomManager = createRoomManager(config, createDatabasePersistence(url!));
    const { app, websocket } = createSyncServer(roomManager, config);
    const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
    process.env.BLOOMMD_SYNC_INTERNAL_URL = `http://127.0.0.1:${server.port}`;
    process.env.NEXT_PUBLIC_SYNC_URL = `http://127.0.0.1:${server.port}`;
    stopSync = async () => {
      await server.stop(true);
      rmSync(baseDir, { recursive: true, force: true });
    };

    const apiRoot = "../../apps/app/src/app/api";
    const workspace = `${apiRoot}/workspaces/[workspaceId]`;
    routes = {
      mindmap: (await import(`${apiRoot}/mindmaps/[filename]/route`)) as unknown as RouteModule,
      mindmaps: (await import(`${apiRoot}/mindmaps/route`)) as unknown as RouteModule,
      nodes: (await import(`${apiRoot}/mindmaps/[filename]/nodes/route`)) as unknown as RouteModule,
      syncTicket: (await import(`${apiRoot}/sync-ticket/route`)) as unknown as RouteModule,
      rights: (await import(`${workspace}/agent-rights/route`)) as unknown as RouteModule,
      proposals: (await import(`${workspace}/agent-token-proposals/route`)) as unknown as RouteModule,
      proposal: (await import(`${workspace}/agent-token-proposals/[proposalId]/route`)) as unknown as RouteModule,
      log: (await import(`${workspace}/agent-log/route`)) as unknown as RouteModule,
      selfRights: (await import(`${apiRoot}/mindmaps/agent-access/rights/route`)) as unknown as RouteModule,
      selfChanges: (await import(`${apiRoot}/mindmaps/agent-access/changes/route`)) as unknown as RouteModule,
      selfUndo: (await import(`${apiRoot}/mindmaps/agent-access/undo/route`)) as unknown as RouteModule,
      agents: (await import(`${workspace}/agents/route`)) as unknown as RouteModule,
      tasks: (await import(`${workspace}/agent-tasks/route`)) as unknown as RouteModule,
      events: (await import(`${workspace}/agent-events/route`)) as unknown as RouteModule,
    };

    aliceId = (await db.upsertMarketUser({ provider: "password", email: `alice-t210-${run}@bloommd.test`, name: "Alice Owner" }))!.id;
    bobId = (await db.upsertMarketUser({ provider: "password", email: `bob-t210-${run}@bloommd.test`, name: "Bob" }))!.id;
    teamA = (await db.createTeamWorkspace({ userId: aliceId, name: `T210 A ${run}` })).id;
    teamB = (await db.createTeamWorkspace({ userId: bobId, name: `T210 B ${run}` })).id;
    ownerToken = (await db.createAccessToken({ userId: aliceId, name: `Alice ${run}`, scope: "write" })).token;
  });

  afterAll(async () => {
    await stopSync();
    await sql?.end();
  });

  test("K6: a token with scope read changes nothing through any route (401, nothing stored) and still reads (200) @t210", async () => {
    const file = await createMap(area("dev-team – nur-lesen-scope.md"));
    const newName = area("dev-team – nur-lesen-scope neu.md");
    const renamed = area("dev-team – nur-lesen-scope umbenannt.md");
    const before = await markdownOf(file);

    const personal = await db.createAccessToken({ userId: aliceId, name: `Lesen persönlich ${run}`, scope: "read" });
    const bound = await agent("Lese-Agent", { scope: "read", workspaceIds: [teamA] });
    for (const reader of [{ label: "personal read token", id: personal.id, token: personal.token }, { label: "agent read token bound to the workspace", id: bound.id, token: bound.token }]) {
      // Reading works.
      const list = await call(routes.mindmaps.GET, "GET", "/api/mindmaps", reader.token, { workspace: teamA });
      expect({ reader: reader.label, status: list.status }).toEqual({ reader: reader.label, status: 200 });
      const read = await call(routes.mindmap.GET, "GET", `/api/mindmaps/${encoded(file)}`, reader.token, { workspace: teamA, params: { filename: file } });
      expect({ reader: reader.label, status: read.status }).toEqual({ reader: reader.label, status: 200 });

      // Every way of changing a map is refused before any right is looked at: the limited token is no identity for it.
      const attempts: Array<[string, Handler, string, string, unknown, Record<string, string>]> = [
        ["POST create", routes.mindmaps.POST, "POST", "/api/mindmaps", { filename: newName, markdown: edit("neu") }, {}],
        ["PUT replace", routes.mindmap.PUT, "PUT", `/api/mindmaps/${encoded(file)}`, { markdown: edit("ersetzt"), overwrite: true }, { filename: file }],
        ["PATCH rename", routes.mindmap.PATCH, "PATCH", `/api/mindmaps/${encoded(file)}`, { newFilename: renamed }, { filename: file }],
        ["DELETE", routes.mindmap.DELETE, "DELETE", `/api/mindmaps/${encoded(file)}`, undefined, { filename: file }],
        ["POST nodes", routes.nodes.POST, "POST", `/api/mindmaps/${encoded(file)}/nodes`, { nodes: [{ title: "Eingeschmuggelt" }] }, { filename: file }],
        ["POST sync ticket", routes.syncTicket.POST, "POST", "/api/sync-ticket", { filename: file, workspaceId: teamA }, {}],
      ];
      for (const [label, handler, method, path, body, params] of attempts) {
        const answer = await call(handler, method, path, reader.token, { body, params, workspace: teamA });
        expect({ reader: reader.label, label, status: answer.status }).toEqual({ reader: reader.label, label, status: 401 });
      }
      expect(await proposalsOf(reader.id)).toBe(0);
      expect(await changesOf(reader.id)).toBe(0);
    }
    expect(await markdownOf(file)).toBe(before);
    expect(await markdownOf(newName)).toBeNull();
    expect(await markdownOf(renamed)).toBeNull();
  });

  test("K7: with the right propose a write attempt becomes a proposal, the map stays, and only the owner's approval changes it @t210", async () => {
    const file = await createMap(area("dev-team – t210 vorschlag.md"));
    const second = await createMap(area("dev-team – t210 vorschlag zwei.md"));
    const bot = await agent("Vorschlag-t210");
    expect((await setRights(bot.id, "propose")).status).toBe(200);
    const before = { file: await markdownOf(file), second: await markdownOf(second) };

    const replace = await putMap(file, bot.token, "t210-vorschlag");
    expect(replace.status).toBe(202);
    expect(replace.body).toMatchObject({ mode: "proposed" });
    const proposalId = replace.body!.proposalId!;
    const nodes = await call(routes.nodes.POST, "POST", `/api/mindmaps/${encoded(second)}/nodes`, bot.token, { body: { nodes: [{ title: "Knotenvorschlag" }] }, workspace: teamA, params: { filename: second } });
    expect(nodes.status).toBe(202);
    const created = await call(routes.mindmaps.POST, "POST", "/api/mindmaps", bot.token, { body: { filename: area("dev-team – t210 neu per propose.md"), markdown: edit("neu") }, workspace: teamA });
    expect(created.status).toBe(202);

    // Nothing was written: the maps are as before, the new map does not exist, three proposals wait.
    expect(await markdownOf(file)).toBe(before.file);
    expect(await markdownOf(second)).toBe(before.second);
    expect(await markdownOf(area("dev-team – t210 neu per propose.md"))).toBeNull();
    expect(await proposalsOf(bot.id)).toBe(3);
    expect((await sql`select status from bloom_agent_token_proposals where id = ${proposalId}`)[0]).toMatchObject({ status: "pending" });
    // Rename and delete are not proposals: they need the right to write.
    for (const [method, handler] of [["PATCH", routes.mindmap.PATCH], ["DELETE", routes.mindmap.DELETE]] as const) {
      const refused = await call(handler, method, `/api/mindmaps/${encoded(file)}`, bot.token, { body: { newFilename: area("dev-team – t210 umbenannt.md") }, workspace: teamA, params: { filename: file } });
      expect({ method, status: refused.status }).toEqual({ method, status: 403 });
    }
    expect(await markdownOf(file)).toBe(before.file);
    expect(await proposalsOf(bot.id)).toBe(3);

    // The agent cannot approve its own proposal; the owner can, and only then the map changes.
    const selfApproval = await call(routes.proposal.POST, "POST", `/api/workspaces/${teamA}/agent-token-proposals/${proposalId}`, bot.token, { body: { action: "approve" }, params: { workspaceId: teamA, proposalId } });
    expect(selfApproval.status).toBe(401);
    expect(await markdownOf(file)).toBe(before.file);
    const approval = await call(routes.proposal.POST, "POST", `/api/workspaces/${teamA}/agent-token-proposals/${proposalId}`, ownerToken, { body: { action: "approve" }, params: { workspaceId: teamA, proposalId } });
    expect(approval.status).toBe(200);
    expect(await markdownOf(file)).toContain("t210-vorschlag");
    expect(await markdownOf(second)).toBe(before.second);
  });

  test("K7: an area with read refuses both writing and proposing, whatever the overall right is @t210", async () => {
    const guarded = await createMap(area("dev-team – t210 bereich-lesen.md"));
    const bot = await agent("Bereich-Lesen-t210");
    expect((await setRights(bot.id, "propose", { "Learnings/dev-team": "read" })).status).toBe(200);
    const before = await markdownOf(guarded);

    const answer = await putMap(guarded, bot.token, "t210-bereich-lesen");
    expect(answer.status).toBe(403);
    expect(answer.body).toMatchObject({ code: "AGENT_READ_ONLY" });
    const nodes = await call(routes.nodes.POST, "POST", `/api/mindmaps/${encoded(guarded)}/nodes`, bot.token, { body: { nodes: [{ title: "Nein" }] }, workspace: teamA, params: { filename: guarded } });
    expect(nodes.status).toBe(403);
    const created = await call(routes.mindmaps.POST, "POST", "/api/mindmaps", bot.token, { body: { filename: area("dev-team – t210 bereich-lesen neu.md"), markdown: edit("neu") }, workspace: teamA });
    expect(created.status).toBe(403);

    expect(await markdownOf(guarded)).toBe(before);
    expect(await markdownOf(area("dev-team – t210 bereich-lesen neu.md"))).toBeNull();
    expect(await proposalsOf(bot.id)).toBe(0);
    expect(await changesOf(bot.id)).toBe(0);
  });

  test("K8: the right of an area beats the overall right in both directions @t210", async () => {
    const inArea = async (name: string) => createMap(area(`dev-team – ${name}.md`));
    const outside = async (name: string) => createMap(`Projekte – ${name}.md`);

    // Overall write, area read: the area is read-only, everything else is writable.
    const strict = await agent("Gesamt-Schreiben-Bereich-Lesen");
    expect((await setRights(strict.id, "write", { "Learnings/dev-team": "read" })).status).toBe(200);
    const strictIn = await inArea("t210 strikt innen");
    const strictOut = await outside("t210 strikt aussen");
    const strictBefore = await markdownOf(strictIn);
    const refused = await putMap(strictIn, strict.token, "t210-strikt-innen");
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: "AGENT_READ_ONLY" });
    expect(await markdownOf(strictIn)).toBe(strictBefore);
    expect((await putMap(strictOut, strict.token, "t210-strikt-aussen")).status).toBe(200);
    expect(await markdownOf(strictOut)).toContain("t210-strikt-aussen");

    // Overall write, area propose: inside the area the write becomes a proposal.
    const mixed = await agent("Gesamt-Schreiben-Bereich-Vorschlag");
    expect((await setRights(mixed.id, "write", { "Learnings/dev-team": "propose" })).status).toBe(200);
    const mixedIn = await inArea("t210 gemischt innen");
    const mixedBefore = await markdownOf(mixedIn);
    const proposed = await putMap(mixedIn, mixed.token, "t210-gemischt-innen");
    expect(proposed.status).toBe(202);
    expect(await markdownOf(mixedIn)).toBe(mixedBefore);
    expect(await proposalsOf(mixed.id)).toBe(1);

    // Overall read, area write: writing only inside the area.
    const narrow = await agent("Gesamt-Lesen-Bereich-Schreiben");
    expect((await setRights(narrow.id, "read", { "Learnings/dev-team": "write" })).status).toBe(200);
    const narrowIn = await inArea("t210 eng innen");
    const narrowOut = await outside("t210 eng aussen");
    const narrowOutBefore = await markdownOf(narrowOut);
    expect((await putMap(narrowIn, narrow.token, "t210-eng-innen")).status).toBe(200);
    const outsideAnswer = await putMap(narrowOut, narrow.token, "t210-eng-aussen");
    expect(outsideAnswer.status).toBe(403);
    expect(outsideAnswer.body).toMatchObject({ code: "AGENT_READ_ONLY" });
    expect(await markdownOf(narrowOut)).toBe(narrowOutBefore);
  });

  test("K8: a write into a workspace the token does not belong to is refused and changes nothing @t210", async () => {
    const foreign = await createMap("Projekte – t210 fremd.md", teamB, bobId);
    const foreignBefore = await markdownOf(foreign, teamB, bobId);
    const own = await createMap("Projekte – t210 eigen.md");

    // Bound to workspace A with the right to write there; names workspace B in the header.
    const bound = await agent("Gebunden-t210", { workspaceIds: [teamA] });
    expect((await setRights(bound.id, "write")).status).toBe(200);
    // Not bound, but Alice is no member of workspace B.
    const free = await agent("Frei-t210");
    expect((await setRights(free.id, "write")).status).toBe(200);

    for (const bot of [bound, free]) {
      const answer = await putMap(foreign, bot.token, "t210-fremd", teamB);
      expect({ bot: bot.name, status: [400, 403, 404].includes(answer.status) }).toEqual({ bot: bot.name, status: true });
      const created = await call(routes.mindmaps.POST, "POST", "/api/mindmaps", bot.token, { body: { filename: "Projekte – t210 fremd neu.md", markdown: edit("neu") }, workspace: teamB });
      expect({ bot: bot.name, status: [400, 403, 404].includes(created.status) }).toEqual({ bot: bot.name, status: true });
    }
    expect(await markdownOf(foreign, teamB, bobId)).toBe(foreignBefore);
    expect(await markdownOf("Projekte – t210 fremd neu.md", teamB, bobId)).toBeNull();

    // A token bound to workspace A does not reach Alice's own personal workspace either.
    const personal = await db.getWorkspaceForUser(aliceId);
    const personalAnswer = await call(routes.mindmaps.GET, "GET", "/api/mindmaps", bound.token, { workspace: personal.id });
    expect([400, 403, 404]).toContain(personalAnswer.status);
    // Control: in its own workspace the same token writes.
    expect((await putMap(own, bound.token, "t210-eigen")).status).toBe(200);
  });

  test("K9: an unknown, revoked or expired token is a 401 on every route, never anonymous, session or instance-key access @t210", async () => {
    const file = await createMap(area("dev-team – t210 token.md"));
    const proposalsBefore = await count("bloom_agent_token_proposals", "workspace_id = $1", teamA);

    const revoked = await agent("Widerrufen-t210");
    expect((await setRights(revoked.id, "write")).status).toBe(200);
    expect((await putMap(file, revoked.token, "t210-vor-widerruf")).status).toBe(200);
    expect(await db.revokeAccessToken(aliceId, revoked.id)).toBe(true);
    const expired = await agent("Abgelaufen-t210");
    expect((await setRights(expired.id, "write")).status).toBe(200);
    await sql`update bloom_access_tokens set expires_at = now() - interval '1 minute' where id = ${expired.id}`;
    const tokens = {
      unknown: `bloom_pat_${"u".repeat(43)}`,
      malformed: "bloom_pat_nope",
      revoked: revoked.token,
      expired: expired.token,
    };

    const params = { workspaceId: teamA };
    const attempts: Array<[string, Handler, string, string, unknown, Record<string, string>]> = [
      ["GET mindmaps", routes.mindmaps.GET, "GET", "/api/mindmaps", undefined, {}],
      ["POST mindmaps", routes.mindmaps.POST, "POST", "/api/mindmaps", { filename: area("dev-team – t210 neu.md"), markdown: edit("neu") }, {}],
      ["GET mindmap", routes.mindmap.GET, "GET", `/api/mindmaps/${encoded(file)}`, undefined, { filename: file }],
      ["PUT mindmap", routes.mindmap.PUT, "PUT", `/api/mindmaps/${encoded(file)}`, { markdown: edit("t210-nachher"), overwrite: true }, { filename: file }],
      ["PATCH mindmap", routes.mindmap.PATCH, "PATCH", `/api/mindmaps/${encoded(file)}`, { newFilename: area("dev-team – t210 umbenannt.md") }, { filename: file }],
      ["DELETE mindmap", routes.mindmap.DELETE, "DELETE", `/api/mindmaps/${encoded(file)}`, undefined, { filename: file }],
      ["POST nodes", routes.nodes.POST, "POST", `/api/mindmaps/${encoded(file)}/nodes`, { nodes: [{ title: "Nachher" }] }, { filename: file }],
      ["POST sync ticket", routes.syncTicket.POST, "POST", "/api/sync-ticket", { filename: file, workspaceId: teamA }, {}],
      ["GET own rights", routes.selfRights.GET, "GET", "/api/mindmaps/agent-access/rights", undefined, {}],
      ["GET own changes", routes.selfChanges.GET, "GET", "/api/mindmaps/agent-access/changes", undefined, {}],
      ["POST own undo", routes.selfUndo.POST, "POST", "/api/mindmaps/agent-access/undo", { changeId: "00000000-0000-4000-8000-000000000000" }, {}],
      ["GET agent-rights", routes.rights.GET, "GET", `/api/workspaces/${teamA}/agent-rights`, undefined, params],
      ["PUT agent-rights", routes.rights.PUT, "PUT", `/api/workspaces/${teamA}/agent-rights`, { tokenId: revoked.id, access: "write", areas: {} }, params],
      ["GET agent-token-proposals", routes.proposals.GET, "GET", `/api/workspaces/${teamA}/agent-token-proposals?status=all`, undefined, params],
      ["GET agent-log", routes.log.GET, "GET", `/api/workspaces/${teamA}/agent-log`, undefined, params],
      ["GET agent-events", routes.events.GET, "GET", `/api/workspaces/${teamA}/agent-events`, undefined, params],
      ["GET agent-tasks", routes.tasks.GET, "GET", `/api/workspaces/${teamA}/agent-tasks`, undefined, params],
      ["GET agents", routes.agents.GET, "GET", `/api/workspaces/${teamA}/agents`, undefined, params],
    ];

    // Open every other door: anonymous access is allowed, and a valid instance key travels with the request. The token still decides.
    const saved = { requireAuth: process.env.BLOOMMD_REQUIRE_AUTH, apiKey: process.env.BLOOMMD_API_KEY };
    process.env.BLOOMMD_REQUIRE_AUTH = "0";
    process.env.BLOOMMD_API_KEY = `instance-key-${run}`;
    try {
      for (const [kind, token] of Object.entries(tokens)) {
        for (const [label, handler, method, path, body, routeParams] of attempts) {
          const answer = await call(handler, method, path, token, { body, params: routeParams, workspace: teamA, headers: { "X-API-Key": `instance-key-${run}` } });
          expect({ kind, label, status: answer.status }).toEqual({ kind, label, status: 401 });
        }
      }
    } finally {
      if (saved.requireAuth === undefined) delete process.env.BLOOMMD_REQUIRE_AUTH;
      else process.env.BLOOMMD_REQUIRE_AUTH = saved.requireAuth;
      if (saved.apiKey === undefined) delete process.env.BLOOMMD_API_KEY;
      else process.env.BLOOMMD_API_KEY = saved.apiKey;
    }

    // Nothing moved, and the 401 is not an artefact of the request shapes above: the owner's valid token gets through the same routes.
    expect(await markdownOf(file)).toContain("t210-vor-widerruf");
    expect(await markdownOf(file)).not.toContain("t210-nachher");
    expect(await markdownOf(area("dev-team – t210 neu.md"))).toBeNull();
    expect(await markdownOf(area("dev-team – t210 umbenannt.md"))).toBeNull();
    expect(await count("bloom_agent_token_proposals", "workspace_id = $1", teamA)).toBe(proposalsBefore);
    expect((await call(routes.mindmaps.GET, "GET", "/api/mindmaps", ownerToken, { workspace: teamA })).status).toBe(200);
    expect((await call(routes.mindmap.GET, "GET", `/api/mindmaps/${encoded(file)}`, ownerToken, { workspace: teamA, params: { filename: file } })).status).toBe(200);
    expect((await call(routes.rights.GET, "GET", `/api/workspaces/${teamA}/agent-rights`, ownerToken, { params })).status).toBe(200);
  });
});
