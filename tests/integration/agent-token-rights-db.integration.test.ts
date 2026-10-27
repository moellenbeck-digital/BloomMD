/**
 * Server-side rights of agent tokens (#111) against a real Postgres: rights per area (longest
 * prefix wins), proposals, the change log, approval by the owner and revocation. The routes run
 * as handlers on real Request objects, the map writes go through a real sync server (in this
 * process) into the database. Runs only with BLOOMMD_TEST_DATABASE_URL (a throwaway database; it
 * is migrated here), e.g. `docker run -d -e POSTGRES_PASSWORD=qa -p 55433:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.BLOOMMD_TEST_DATABASE_URL;
const SYNC_SECRET = "agent-token-rights-sync-secret-with-enough-entropy";
const BASE = "https://app.bloommd.test";

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;
type RouteModule = Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>;

interface Body {
  code?: string;
  mode?: string;
  proposalId?: string;
  changeId?: string;
  changes?: Array<{ id: string; agentName: string; event: string; reviewerName: string | null }>;
  proposals?: Array<{ id: string }>;
  tokens?: Array<{ tokenId: string }>;
}

interface Reply {
  status: number;
  body: Body | null;
}

describe.skipIf(!url)("agent token rights (Postgres, real sync server)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  let stopSync: () => Promise<void> = async () => undefined;
  const run = Date.now().toString(36);

  // Route handlers, loaded after DATABASE_URL and the sync environment are set.
  let routes: {
    mindmap: RouteModule;
    mindmaps: RouteModule;
    nodes: RouteModule;
    syncTicket: RouteModule;
    rights: RouteModule;
    proposals: RouteModule;
    proposal: RouteModule;
    log: RouteModule;
    logChange: RouteModule;
    selfChanges: RouteModule;
    selfUndo: RouteModule;
    selfRights: RouteModule;
    legacyProposal: RouteModule;
  };

  let aliceId: string;
  let bobId: string;
  let carolId: string;
  let teamA: string;
  let teamB: string;
  let ownerToken: string; // Alice's own token (no agent name): the "browser" owner
  let bobToken: string;
  let carolToken: string;

  const call = async (handler: Handler, method: string, path: string, token: string, options: { body?: unknown; workspace?: string; params?: Record<string, string> } = {}): Promise<Reply> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.workspace) headers["X-BloomMD-Workspace-ID"] = options.workspace;
    const response = await handler(new Request(`${BASE}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }), { params: Promise.resolve(options.params ?? {}) as Promise<never> });
    return { status: response.status, body: (await response.json().catch(() => null)) as Reply["body"] };
  };

  const agent = async (userId: string, name: string, workspaceIds?: string[]) => {
    const created = await db.createAccessToken({ userId, name: `${name} ${run}`, scope: "write", agentName: name, workspaceIds });
    return { id: created.id, token: created.token, name };
  };

  const area = (path: string) => `Learnings › ${path}`;
  const createMap = async (filename: string, workspaceId = teamA, userId = aliceId) => {
    await db.writeCloudDocument({ userId, workspaceId, filename, markdown: `# ${filename}\n\nStart.\n`, frontmatter: {} });
    return filename;
  };
  const markdownOf = async (filename: string, workspaceId = teamA, userId = aliceId) => (await db.readCloudDocument(userId, filename, workspaceId))?.markdown ?? null;
  const edit = (marker: string) => `# Karte\n\n## ${marker}\n\nvom Agenten\n`;

  const putMap = (filename: string, token: string, marker: string, workspace = teamA) =>
    call(routes.mindmap.PUT, "PUT", `/api/mindmaps/${encodeURIComponent(filename)}`, token, { body: { markdown: edit(marker), overwrite: true, agentMeta: { tool: "test", reason: `Grund ${marker}`, source: "integration" } }, workspace, params: { filename } });

  const setRights = (token: string, tokenId: string, access: string, areas: Record<string, string> = {}, workspaceId = teamA) =>
    call(routes.rights.PUT, "PUT", `/api/workspaces/${workspaceId}/agent-rights`, token, { body: { tokenId, access, areas }, params: { workspaceId } });

  const count = async (table: string, where: string, ...values: string[]) => Number((await sql.unsafe(`select count(*)::int as n from ${table} where ${where}`, values))[0]!.n);
  const pendingProposals = (workspaceId = teamA) => count("bloom_agent_token_proposals", "workspace_id = $1 and status = 'pending'", workspaceId);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.BLOOMMD_SYNC_SECRET = SYNC_SECRET;
    process.env.BLOOMMD_AUTH_SECRET = "agent-token-rights-auth-secret-with-enough-entropy";
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
    const baseDir = mkdtempSync(join(tmpdir(), "bloom-agent-rights-"));
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
    routes = {
      mindmap: (await import(`${apiRoot}/mindmaps/[filename]/route`)) as unknown as RouteModule,
      mindmaps: (await import(`${apiRoot}/mindmaps/route`)) as unknown as RouteModule,
      nodes: (await import(`${apiRoot}/mindmaps/[filename]/nodes/route`)) as unknown as RouteModule,
      syncTicket: (await import(`${apiRoot}/sync-ticket/route`)) as unknown as RouteModule,
      rights: (await import(`${apiRoot}/workspaces/[workspaceId]/agent-rights/route`)) as unknown as RouteModule,
      proposals: (await import(`${apiRoot}/workspaces/[workspaceId]/agent-token-proposals/route`)) as unknown as RouteModule,
      proposal: (await import(`${apiRoot}/workspaces/[workspaceId]/agent-token-proposals/[proposalId]/route`)) as unknown as RouteModule,
      log: (await import(`${apiRoot}/workspaces/[workspaceId]/agent-log/route`)) as unknown as RouteModule,
      logChange: (await import(`${apiRoot}/workspaces/[workspaceId]/agent-log/[changeId]/route`)) as unknown as RouteModule,
      selfChanges: (await import(`${apiRoot}/mindmaps/agent-access/changes/route`)) as unknown as RouteModule,
      selfUndo: (await import(`${apiRoot}/mindmaps/agent-access/undo/route`)) as unknown as RouteModule,
      selfRights: (await import(`${apiRoot}/mindmaps/agent-access/rights/route`)) as unknown as RouteModule,
      legacyProposal: (await import(`${apiRoot}/workspaces/[workspaceId]/agent-proposals/[proposalId]/route`)) as unknown as RouteModule,
    };

    aliceId = (await db.upsertMarketUser({ provider: "password", email: `alice-${run}@bloommd.test`, name: "Alice Owner" }))!.id;
    bobId = (await db.upsertMarketUser({ provider: "password", email: `bob-${run}@bloommd.test`, name: "Bob" }))!.id;
    carolId = (await db.upsertMarketUser({ provider: "password", email: `carol-${run}@bloommd.test`, name: "Carol" }))!.id;
    teamA = (await db.createTeamWorkspace({ userId: aliceId, name: `Team A ${run}` })).id;
    teamB = (await db.createTeamWorkspace({ userId: bobId, name: `Team B ${run}` })).id;
    await sql`insert into bloom_workspace_members (workspace_id, user_id, role) values (${teamA}, ${carolId}, 'editor')`;
    ownerToken = (await db.createAccessToken({ userId: aliceId, name: `Alice ${run}`, scope: "write" })).token;
    bobToken = (await db.createAccessToken({ userId: bobId, name: `Bob ${run}`, scope: "write" })).token;
    carolToken = (await db.createAccessToken({ userId: carolId, name: `Carol ${run}`, scope: "write" })).token;
  });

  afterAll(async () => {
    await stopSync();
    await sql?.end();
  });

  test("the migration created the four tables, and a second run changes nothing", async () => {
    const tables = ["bloom_agent_token_rights", "bloom_agent_token_area_rights", "bloom_agent_token_proposals", "bloom_agent_token_changes"];
    for (const table of tables) expect(await count("information_schema.tables", "table_schema = 'public' and table_name = $1", table)).toBe(1);
    await db.migrateMarketSchema();
    for (const table of tables) expect(await count("information_schema.tables", "table_schema = 'public' and table_name = $1", table)).toBe(1);
  });

  test("without a row the token may only propose: the proposal is stored, the map does not change", async () => {
    const file = await createMap(area("dev-team – ohne Recht.md"));
    const bot = await agent(aliceId, "Ohne-Recht");
    expect(await db.getAgentTokenRights(bot.id, teamA)).toEqual({ access: "propose", areas: {} });
    const before = await markdownOf(file);

    const answer = await putMap(file, bot.token, "ohne-recht");
    expect(answer.status).toBe(202);
    expect(answer.body).toMatchObject({ mode: "proposed", filename: file, area: "Learnings/dev-team" });
    expect(await markdownOf(file)).toBe(before);
    const stored = await sql`select status, agent_name, proposed_markdown, access_token_id from bloom_agent_token_proposals where id = ${answer.body!.proposalId!}`;
    expect(stored[0]).toMatchObject({ status: "pending", agent_name: "Ohne-Recht", access_token_id: bot.id });
    expect(stored[0]!.proposed_markdown).toContain("ohne-recht");
    expect(await count("bloom_agent_token_changes", "access_token_id = $1 and event = 'proposed'", bot.id)).toBe(1);
  });

  test("read is refused with 403 AGENT_READ_ONLY on every way of changing a map; reading still works", async () => {
    const file = await createMap(area("dev-team – lesen.md"));
    const bot = await agent(aliceId, "Nur-Lesen");
    expect((await setRights(ownerToken, bot.id, "read")).status).toBe(200);
    const before = await markdownOf(file);
    const proposals = await pendingProposals();

    const put = await putMap(file, bot.token, "lesen");
    expect(put.status).toBe(403);
    expect(put.body).toMatchObject({ code: "AGENT_READ_ONLY", access: "read", area: "Learnings/dev-team" });
    const create = await call(routes.mindmaps.POST, "POST", "/api/mindmaps", bot.token, { body: { filename: area("dev-team – neu per read.md"), markdown: edit("neu") }, workspace: teamA });
    expect(create.status).toBe(403);
    expect(create.body).toMatchObject({ code: "AGENT_READ_ONLY" });
    const node = await call(routes.nodes.POST, "POST", `/api/mindmaps/${encodeURIComponent(file)}/nodes`, bot.token, { body: { nodes: [{ title: "Neu" }] }, workspace: teamA, params: { filename: file } });
    expect(node.status).toBe(403);
    expect(node.body).toMatchObject({ code: "AGENT_READ_ONLY" });
    for (const [method, handler] of [["PATCH", routes.mindmap.PATCH], ["DELETE", routes.mindmap.DELETE]] as const) {
      const answer = await call(handler, method, `/api/mindmaps/${encodeURIComponent(file)}`, bot.token, { body: { newFilename: area("dev-team – umbenannt.md") }, workspace: teamA, params: { filename: file } });
      expect(answer.status).toBe(403);
      expect(answer.body).toMatchObject({ code: "AGENT_WRITE_REQUIRED" });
    }

    expect(await markdownOf(file)).toBe(before);
    expect(await markdownOf(area("dev-team – neu per read.md"))).toBeNull();
    expect(await pendingProposals()).toBe(proposals);
    expect((await call(routes.mindmap.GET, "GET", `/api/mindmaps/${encodeURIComponent(file)}`, bot.token, { workspace: teamA, params: { filename: file } })).status).toBe(200);
  });

  test("propose stores a proposal and leaves the map alone; write changes the map and logs it with an id for undo", async () => {
    const file = await createMap(area("dev-team – wechsel.md"));
    const bot = await agent(aliceId, "Wechsler");
    const before = await markdownOf(file);

    await setRights(ownerToken, bot.id, "propose");
    const proposed = await putMap(file, bot.token, "vorschlag");
    expect(proposed.status).toBe(202);
    expect(await markdownOf(file)).toBe(before);
    const proposedNode = await call(routes.nodes.POST, "POST", `/api/mindmaps/${encodeURIComponent(file)}/nodes`, bot.token, { body: { nodes: [{ title: "Knotenvorschlag" }] }, workspace: teamA, params: { filename: file } });
    expect(proposedNode.status).toBe(202);
    expect(await markdownOf(file)).toBe(before);

    await setRights(ownerToken, bot.id, "write");
    const written = await putMap(file, bot.token, "direkt");
    expect(written.status).toBe(200);
    expect(written.body).toMatchObject({ mode: "written" });
    expect(await markdownOf(file)).toContain("direkt");
    const entry = await sql`select event, origin, agent_name, area, filename from bloom_agent_token_changes where id = ${written.body!.changeId!}`;
    expect(entry[0]).toMatchObject({ event: "written", origin: "agent", agent_name: "Wechsler", area: "Learnings/dev-team", filename: file });

    const node = await call(routes.nodes.POST, "POST", `/api/mindmaps/${encodeURIComponent(file)}/nodes`, bot.token, { body: { nodes: [{ title: "Knotenschreiben" }] }, workspace: teamA, params: { filename: file } });
    expect(node.status).toBe(200);
    expect(await markdownOf(file)).toContain("Knotenschreiben");

    // Rights are read on every call: lowering them takes effect with the next request.
    await setRights(ownerToken, bot.id, "read");
    const refused = await putMap(file, bot.token, "nach-entzug");
    expect(refused.status).toBe(403);
    expect(await markdownOf(file)).toContain("direkt");
    expect(await markdownOf(file)).not.toContain("nach-entzug");
  });

  test("the longest prefix wins: Learnings=read with Learnings/dev-team=write", async () => {
    const bot = await agent(aliceId, "Unterbereich");
    expect((await setRights(ownerToken, bot.id, "propose", { Learnings: "read", "Learnings/dev-team": "write" })).status).toBe(200);
    expect(await db.getAgentTokenRights(bot.id, teamA)).toEqual({ access: "propose", areas: { Learnings: "read", "Learnings/dev-team": "write" } });
    const inSub = await createMap(area("dev-team – im Unterbereich.md"));
    const inDeep = await createMap("Learnings › dev-team › tief – noch tiefer.md");
    const sibling = await createMap(area("anderes – Nachbar.md"));
    const parent = await createMap("Learnings – Oberbereich.md");
    const elsewhere = await createMap("Projekte – Plan.md");

    expect((await putMap(inSub, bot.token, "sub")).status).toBe(200);
    expect((await putMap(inDeep, bot.token, "tief")).status).toBe(200);
    for (const file of [sibling, parent]) {
      const answer = await putMap(file, bot.token, "nein");
      expect(answer.status).toBe(403);
      expect(answer.body).toMatchObject({ code: "AGENT_READ_ONLY", access: "read" });
      expect(await markdownOf(file)).not.toContain("nein");
    }
    // Outside of both areas the default right (propose) applies.
    expect((await putMap(elsewhere, bot.token, "standard")).status).toBe(202);
    expect(await markdownOf(elsewhere)).not.toContain("standard");
    // The sync ticket follows the same right: a live editing session only where the agent may write.
    const ticket = (file: string) => call(routes.syncTicket.POST, "POST", "/api/sync-ticket", bot.token, { body: { filename: file, workspaceId: teamA } });
    expect((await ticket(inSub)).body).toMatchObject({ permission: "write" });
    expect((await ticket(sibling)).body).toMatchObject({ permission: "read" });
    expect((await ticket(elsewhere)).body).toMatchObject({ permission: "read" });
  });

  test("two tokens in one workspace with different rights: a write outside the right is refused by the server", async () => {
    const learnings = await createMap(area("dev-team – geteilt.md"));
    const projects = await createMap("Projekte – geteilt.md");
    const writer = await agent(aliceId, "Schreiber");
    const reader = await agent(aliceId, "Leser");
    await setRights(ownerToken, writer.id, "read", { "Learnings/dev-team": "write" });
    await setRights(ownerToken, reader.id, "read", { "Projekte": "propose" });
    const before = { learnings: await markdownOf(learnings), projects: await markdownOf(projects) };

    // The writer writes in its area, but not outside of it.
    expect((await putMap(learnings, writer.token, "schreiber-ok")).status).toBe(200);
    const outside = await putMap(projects, writer.token, "schreiber-aussen");
    expect(outside.status).toBe(403);
    expect(outside.body).toMatchObject({ code: "AGENT_READ_ONLY", agent: "Schreiber" });
    // The other token cannot write where the first one can, and only proposes in its own area.
    const foreign = await putMap(learnings, reader.token, "leser-fremd");
    expect(foreign.status).toBe(403);
    expect((await putMap(projects, reader.token, "leser-vorschlag")).status).toBe(202);

    expect(await markdownOf(learnings)).toContain("schreiber-ok");
    expect(await markdownOf(learnings)).not.toContain("leser-fremd");
    expect(await markdownOf(projects)).toBe(before.projects);
    expect(await count("bloom_agent_token_proposals", "access_token_id = $1", writer.id)).toBe(0);
    expect(before.learnings).not.toBe(await markdownOf(learnings));
  });

  test("a revoked token is refused with 401 on the very next request, including a sync ticket", async () => {
    const file = await createMap(area("dev-team – widerruf.md"));
    const bot = await agent(aliceId, "Widerruf");
    await setRights(ownerToken, bot.id, "write");
    expect((await putMap(file, bot.token, "vorher")).status).toBe(200);
    expect((await call(routes.syncTicket.POST, "POST", "/api/sync-ticket", bot.token, { body: { filename: file, workspaceId: teamA } })).status).toBe(200);

    expect(await db.revokeAccessToken(aliceId, bot.id)).toBe(true);

    const after = await putMap(file, bot.token, "nachher");
    expect(after.status).toBe(401);
    expect((await call(routes.mindmap.GET, "GET", `/api/mindmaps/${encodeURIComponent(file)}`, bot.token, { workspace: teamA, params: { filename: file } })).status).toBe(401);
    expect((await call(routes.syncTicket.POST, "POST", "/api/sync-ticket", bot.token, { body: { filename: file, workspaceId: teamA } })).status).toBe(401);
    expect((await call(routes.selfRights.GET, "GET", "/api/mindmaps/agent-access/rights", bot.token, { workspace: teamA })).status).toBe(401);
    expect(await markdownOf(file)).toContain("vorher");
    expect(await markdownOf(file)).not.toContain("nachher");
  });

  test("the owner's approval applies the proposal and the log names who approved it; rejecting keeps the map", async () => {
    const file = await createMap(area("dev-team – freigabe.md"));
    const other = await createMap(area("dev-team – abgelehnt.md"));
    const bot = await agent(aliceId, "Vorschlaeger");
    const before = await markdownOf(other);
    const approved = (await putMap(file, bot.token, "freizugeben")).body!.proposalId as string;
    const rejected = (await putMap(other, bot.token, "abzulehnen")).body!.proposalId as string;
    expect(await markdownOf(file)).not.toContain("freizugeben");

    const listed = await call(routes.proposals.GET, "GET", `/api/workspaces/${teamA}/agent-token-proposals?status=pending`, ownerToken, { params: { workspaceId: teamA } });
    expect(listed.status).toBe(200);
    expect(listed.body!.proposals!.map((entry: { id: string }) => entry.id)).toEqual(expect.arrayContaining([approved, rejected]));

    const approval = await call(routes.proposal.POST, "POST", `/api/workspaces/${teamA}/agent-token-proposals/${approved}`, ownerToken, { body: { action: "approve" }, params: { workspaceId: teamA, proposalId: approved } });
    expect(approval.status).toBe(200);
    expect(approval.body).toMatchObject({ applied: approved, reviewer: "Alice Owner" });
    expect(await markdownOf(file)).toContain("freizugeben");
    const entry = await sql`select event, origin, reviewer_name, reviewer_user_id, agent_name, proposal_id from bloom_agent_token_changes where id = ${approval.body!.changeId!}`;
    expect(entry[0]).toMatchObject({ event: "approved", origin: "approved", reviewer_name: "Alice Owner", reviewer_user_id: aliceId, agent_name: "Vorschlaeger", proposal_id: approved });
    expect((await sql`select status, reviewer_name, reviewed_by from bloom_agent_token_proposals where id = ${approved}`)[0]).toMatchObject({ status: "approved", reviewer_name: "Alice Owner", reviewed_by: aliceId });
    const log = await call(routes.log.GET, "GET", `/api/workspaces/${teamA}/agent-log?tokenId=${bot.id}`, ownerToken, { params: { workspaceId: teamA } });
    expect(log.body!.changes!.find((change: { event: string }) => change.event === "approved")).toMatchObject({ reviewerName: "Alice Owner", agentName: "Vorschlaeger" });
    // A proposal is decided once.
    expect((await call(routes.proposal.POST, "POST", `/api/workspaces/${teamA}/agent-token-proposals/${approved}`, ownerToken, { body: { action: "approve" }, params: { workspaceId: teamA, proposalId: approved } })).status).toBe(404);

    const rejection = await call(routes.proposal.POST, "POST", `/api/workspaces/${teamA}/agent-token-proposals/${rejected}`, ownerToken, { body: { action: "reject", reason: "passt nicht" }, params: { workspaceId: teamA, proposalId: rejected } });
    expect(rejection.body).toMatchObject({ rejected, reviewer: "Alice Owner", reason: "passt nicht" });
    expect(await markdownOf(other)).toBe(before);
    expect((await sql`select reviewer_name from bloom_agent_token_changes where proposal_id = ${rejected} and event = 'rejected'`)[0]).toMatchObject({ reviewer_name: "Alice Owner" });
  });

  test("an agent token manages no rights, proposals or log in any workspace (also not its own proposal)", async () => {
    const file = await createMap(area("dev-team – eigener Vorschlag.md"));
    const bot = await agent(aliceId, "Selbstfreigeber");
    const proposalId = (await putMap(file, bot.token, "selbst")).body!.proposalId as string;
    const other = (await putMap(file, (await agent(aliceId, "Anderer")).token, "anders")).body!.proposalId as string;
    const changeId = (await sql`select id from bloom_agent_token_changes where proposal_id = ${proposalId}`)[0]!.id as string;
    const before = await markdownOf(file);
    const rightsBefore = await count("bloom_agent_token_rights", "workspace_id = $1", teamA);
    const attempts: Array<[string, Handler, string, string, Record<string, unknown> | undefined, Record<string, string>]> = [];
    for (const workspaceId of [teamA, teamB, "personal"]) {
      attempts.push(
        ["GET rights", routes.rights.GET, "GET", `/api/workspaces/${workspaceId}/agent-rights`, undefined, { workspaceId }],
        ["PUT rights", routes.rights.PUT, "PUT", `/api/workspaces/${workspaceId}/agent-rights`, { tokenId: bot.id, access: "write", areas: {} }, { workspaceId }],
        ["GET proposals", routes.proposals.GET, "GET", `/api/workspaces/${workspaceId}/agent-token-proposals?status=all`, undefined, { workspaceId }],
        ["approve own", routes.proposal.POST, "POST", `/api/workspaces/${workspaceId}/agent-token-proposals/${proposalId}`, { action: "approve" }, { workspaceId, proposalId }],
        ["approve other", routes.proposal.POST, "POST", `/api/workspaces/${workspaceId}/agent-token-proposals/${other}`, { action: "approve", overwrite: true }, { workspaceId, proposalId: other }],
        ["reject other", routes.proposal.POST, "POST", `/api/workspaces/${workspaceId}/agent-token-proposals/${other}`, { action: "reject" }, { workspaceId, proposalId: other }],
        ["GET log", routes.log.GET, "GET", `/api/workspaces/${workspaceId}/agent-log`, undefined, { workspaceId }],
        ["undo as owner", routes.logChange.POST, "POST", `/api/workspaces/${workspaceId}/agent-log/${changeId}`, { action: "undo" }, { workspaceId, changeId }],
        ["legacy approve", routes.legacyProposal.POST, "POST", `/api/workspaces/${workspaceId}/agent-proposals/${proposalId}`, { action: "apply" }, { workspaceId, proposalId }],
      );
    }
    for (const [label, handler, method, path, body, params] of attempts) {
      const answer = await call(handler, method, path, bot.token, { body, params });
      expect({ label, status: answer.status }).toEqual({ label, status: 401 });
    }
    expect(await markdownOf(file)).toBe(before);
    expect(await count("bloom_agent_token_rights", "workspace_id = $1", teamA)).toBe(rightsBefore);
    expect(await count("bloom_agent_token_proposals", "id = any($1::uuid[]) and status = 'pending'", `{${proposalId},${other}}`)).toBe(2);
    expect(await db.getAgentTokenRights(bot.id, teamA)).toEqual({ access: "propose", areas: {} });
  });

  test("an agent token sees and undoes only its own entries, in the workspace it belongs to", async () => {
    const mine = await createMap(area("dev-team – meine.md"));
    const theirs = await createMap(area("dev-team – deren.md"));
    const first = await agent(aliceId, "Eins");
    const second = await agent(aliceId, "Zwei");
    await setRights(ownerToken, first.id, "write");
    await setRights(ownerToken, second.id, "write");
    const ownChange = (await putMap(mine, first.token, "eins")).body!.changeId as string;
    const lateMap = await createMap(area("dev-team – spaeter.md"));
    const lateChange = (await putMap(lateMap, first.token, "spaeter")).body!.changeId as string;
    const foreignChange = (await putMap(theirs, second.token, "zwei")).body!.changeId as string;

    const listed = await call(routes.selfChanges.GET, "GET", "/api/mindmaps/agent-access/changes?limit=50", first.token, { workspace: teamA });
    expect(listed.status).toBe(200);
    expect(listed.body!.changes!.map((change: { id: string }) => change.id)).toContain(ownChange);
    expect(listed.body!.changes!.every((change: { agentName: string }) => change.agentName === "Eins")).toBe(true);
    expect(listed.body!.changes!.map((change: { id: string }) => change.id)).not.toContain(foreignChange);
    expect(await call(routes.selfRights.GET, "GET", "/api/mindmaps/agent-access/rights", first.token, { workspace: teamA })).toMatchObject({ body: { agent: "Eins", unrestricted: false, rights: { access: "write" } } });

    // Someone else's change, and one in a workspace the token has no part in, cannot be undone.
    const undo = (changeId: string, workspace: string, token = first.token) => call(routes.selfUndo.POST, "POST", "/api/mindmaps/agent-access/undo", token, { body: { changeId }, workspace });
    const stranger = await undo(foreignChange, teamA);
    expect(stranger.status).toBe(403);
    expect(stranger.body).toMatchObject({ code: "AGENT_UNDO_FORBIDDEN" });
    expect(await markdownOf(theirs)).toContain("zwei");
    expect((await undo(foreignChange, teamB)).status).toBe(404);
    expect((await call(routes.selfChanges.GET, "GET", "/api/mindmaps/agent-access/changes", first.token, { workspace: teamB })).status).toBe(404);
    // A token bound to team A reaches nothing in team B.
    const bound = await agent(aliceId, "Gebunden", [teamA]);
    expect((await call(routes.mindmaps.GET, "GET", "/api/mindmaps", bound.token, { workspace: teamB })).status).not.toBe(200);
    expect((await call(routes.selfRights.GET, "GET", "/api/mindmaps/agent-access/rights", bound.token, { workspace: teamB })).status).toBe(404);

    // A change the owner approved is no direct change of the agent: only the owner undoes it.
    const proposed = await agent(aliceId, "Eins-b");
    const proposalId = (await putMap(mine, proposed.token, "bestaetigt")).body!.proposalId as string;
    const approved = await call(routes.proposal.POST, "POST", `/api/workspaces/${teamA}/agent-token-proposals/${proposalId}`, ownerToken, { body: { action: "approve", overwrite: true }, params: { workspaceId: teamA, proposalId } });
    expect(approved.status).toBe(200);
    await setRights(ownerToken, proposed.id, "write");
    const refused = await undo(approved.body!.changeId!, teamA, proposed.token);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: "AGENT_UNDO_FORBIDDEN" });

    // Its own change it undoes while the right is still there; the owner's rights decide.
    const undone = await undo(foreignChange, teamA, second.token);
    expect(undone.status).toBe(200);
    expect(await markdownOf(theirs)).not.toContain("zwei");
    await setRights(ownerToken, first.id, "read");
    const blocked = await undo(lateChange, teamA);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ code: "AGENT_READ_ONLY" });
    expect(await markdownOf(lateMap)).toContain("spaeter");
    expect(ownChange).not.toBe(lateChange);
  });

  test("the owner tools reject other workspaces, other owners and non-owner members (IDOR over workspaceId, proposalId, changeId, tokenId)", async () => {
    const file = await createMap(area("dev-team – idor.md"));
    const bot = await agent(aliceId, "Idor");
    const proposalId = (await putMap(file, bot.token, "idor")).body!.proposalId as string;
    const changeId = (await sql`select id from bloom_agent_token_changes where proposal_id = ${proposalId}`)[0]!.id as string;
    const before = await markdownOf(file);
    const rightsRows = await count("bloom_agent_token_rights", "access_token_id = $1", bot.id);

    // Bob owns team B only: team A, its proposals, its log and its tokens are closed to him.
    const asBob = (handler: Handler, method: string, path: string, params: Record<string, string>, body?: Record<string, unknown>) => call(handler, method, path, bobToken, { body, params });
    expect((await asBob(routes.rights.GET, "GET", `/api/workspaces/${teamA}/agent-rights`, { workspaceId: teamA })).status).toBe(404);
    expect((await asBob(routes.rights.PUT, "PUT", `/api/workspaces/${teamA}/agent-rights`, { workspaceId: teamA }, { tokenId: bot.id, access: "write", areas: {} })).status).toBe(404);
    expect((await asBob(routes.proposals.GET, "GET", `/api/workspaces/${teamA}/agent-token-proposals`, { workspaceId: teamA })).status).toBe(404);
    expect((await asBob(routes.log.GET, "GET", `/api/workspaces/${teamA}/agent-log`, { workspaceId: teamA })).status).toBe(404);
    // His own workspace with ids from team A: proposal, change and token are not found there.
    expect((await asBob(routes.proposal.POST, "POST", `/api/workspaces/${teamB}/agent-token-proposals/${proposalId}`, { workspaceId: teamB, proposalId }, { action: "approve", overwrite: true })).status).toBe(404);
    expect((await asBob(routes.proposal.POST, "POST", `/api/workspaces/${teamB}/agent-token-proposals/${proposalId}`, { workspaceId: teamB, proposalId }, { action: "reject" })).status).toBe(404);
    expect((await asBob(routes.logChange.POST, "POST", `/api/workspaces/${teamB}/agent-log/${changeId}`, { workspaceId: teamB, changeId }, { action: "undo" })).status).toBe(404);
    expect((await asBob(routes.rights.PUT, "PUT", `/api/workspaces/${teamB}/agent-rights`, { workspaceId: teamB }, { tokenId: bot.id, access: "write", areas: {} })).status).toBe(404);
    const listedInB = await asBob(routes.log.GET, "GET", `/api/workspaces/${teamB}/agent-log`, { workspaceId: teamB });
    expect(listedInB.body!.changes).toEqual([]);
    expect((await asBob(routes.rights.GET, "GET", `/api/workspaces/${teamB}/agent-rights`, { workspaceId: teamB })).body!.tokens).toEqual([]);

    // Carol is an editor in team A, not an owner: no access to the owner tools.
    for (const [handler, method, path, params, body] of [
      [routes.rights.GET, "GET", `/api/workspaces/${teamA}/agent-rights`, { workspaceId: teamA }, undefined],
      [routes.rights.PUT, "PUT", `/api/workspaces/${teamA}/agent-rights`, { workspaceId: teamA }, { tokenId: bot.id, access: "write", areas: {} }],
      [routes.proposals.GET, "GET", `/api/workspaces/${teamA}/agent-token-proposals`, { workspaceId: teamA }, undefined],
      [routes.proposal.POST, "POST", `/api/workspaces/${teamA}/agent-token-proposals/${proposalId}`, { workspaceId: teamA, proposalId }, { action: "approve", overwrite: true }],
      [routes.log.GET, "GET", `/api/workspaces/${teamA}/agent-log`, { workspaceId: teamA }, undefined],
      [routes.logChange.POST, "POST", `/api/workspaces/${teamA}/agent-log/${changeId}`, { workspaceId: teamA, changeId }, { action: "undo" }],
    ] as const) {
      const answer = await call(handler, method, path, carolToken, { body, params });
      expect({ path, status: answer.status, code: answer.body?.code }).toEqual({ path, status: 403, code: "OWNER_REQUIRED" });
    }

    // Rights cannot be written for a token that does not belong to the workspace's members, or does not exist.
    const strangerBot = await agent(bobId, "Fremd");
    expect((await setRights(ownerToken, strangerBot.id, "write")).status).toBe(404);
    expect((await setRights(ownerToken, "00000000-0000-4000-8000-000000000000", "write")).status).toBe(404);
    expect((await setRights(ownerToken, "kein-uuid", "write")).status).toBe(404);
    expect(await count("bloom_agent_token_rights", "access_token_id = $1", strangerBot.id)).toBe(0);
    // The list of an owner shows the agent tokens of its workspace members only.
    const visible = (await call(routes.rights.GET, "GET", `/api/workspaces/${teamA}/agent-rights`, ownerToken, { params: { workspaceId: teamA } })).body!.tokens!.map((token: { tokenId: string }) => token.tokenId);
    expect(visible).toContain(bot.id);
    expect(visible).not.toContain(strangerBot.id);

    expect(await markdownOf(file)).toBe(before);
    expect(await count("bloom_agent_token_rights", "access_token_id = $1", bot.id)).toBe(rightsRows);
    expect(await pendingProposals()).toBeGreaterThan(0);
    expect((await sql`select status from bloom_agent_token_proposals where id = ${proposalId}`)[0]).toMatchObject({ status: "pending" });
  });

  test("deleting a token or a workspace removes its rights, proposals and log (on delete cascade)", async () => {
    const workspaceId = (await db.createTeamWorkspace({ userId: aliceId, name: `Kaskade ${run}` })).id;
    const file = await createMap(area("dev-team – kaskade.md"), workspaceId);
    const doomed = await agent(aliceId, "Kaskade-Token");
    const survivor = await agent(aliceId, "Kaskade-Bleibt");
    for (const bot of [doomed, survivor]) {
      expect((await setRights(ownerToken, bot.id, "propose", { Learnings: "write" }, workspaceId)).status).toBe(200);
      expect((await putMap(file, bot.token, `kaskade-${bot.name}`, workspaceId)).status).toBe(
        200,
      );
      await setRights(ownerToken, bot.id, "propose", { Learnings: "propose" }, workspaceId);
      expect((await putMap(file, bot.token, `vorschlag-${bot.name}`, workspaceId)).status).toBe(202);
    }
    const tables = ["bloom_agent_token_rights", "bloom_agent_token_area_rights", "bloom_agent_token_proposals", "bloom_agent_token_changes"];
    for (const table of tables) expect(await count(table, "access_token_id = $1", doomed.id)).toBeGreaterThan(0);

    await sql`delete from bloom_access_tokens where id = ${doomed.id}`;
    for (const table of tables) {
      expect(await count(table, "access_token_id = $1", doomed.id)).toBe(0);
      expect(await count(table, "access_token_id = $1", survivor.id)).toBeGreaterThan(0);
    }

    await sql`delete from bloom_workspaces where id = ${workspaceId}`;
    for (const table of tables) expect(await count(table, "workspace_id = $1", workspaceId)).toBe(0);
  });
});
