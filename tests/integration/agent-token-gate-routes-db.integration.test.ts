/**
 * Where the rights of an agent token (#111) must hold, per route, against a real Postgres: share
 * links and the rename into another area, the workspace-agent routes (an agent token reaches none
 * of them), and the fail-closed gate outside the cloud database (BLOOMMD_STORAGE_MODE=filesystem
 * with a configured database: the token still resolves, but there are no rights to check).
 * The routes run as handlers on real Request objects. Runs only with BLOOMMD_TEST_DATABASE_URL (a
 * throwaway database; it is migrated here), e.g. `docker run -d -e POSTGRES_PASSWORD=qa -p 55433:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.BLOOMMD_TEST_DATABASE_URL;
const BASE = "https://app.bloommd.test";

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;
type RouteModule = Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>;

interface Reply {
  status: number;
  body: { code?: string; id?: string; links?: Array<{ id: string }> } | null;
}

describe.skipIf(!url)("agent token rights per route (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  const dataDir = mkdtempSync(join(tmpdir(), "bloom-agent-gate-"));

  let routes: {
    mindmap: RouteModule;
    mindmaps: RouteModule;
    nodes: RouteModule;
    shareLinks: RouteModule;
    rights: RouteModule;
    agents: RouteModule;
    agent: RouteModule;
    tasks: RouteModule;
    events: RouteModule;
  };
  let aliceId: string;
  let teamA: string;
  let ownerToken: string;

  const call = async (handler: Handler, method: string, path: string, token: string, options: { body?: unknown; workspace?: string; params?: Record<string, string> } = {}): Promise<Reply> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.workspace) headers["X-BloomMD-Workspace-ID"] = options.workspace;
    const response = await handler(new Request(`${BASE}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }), { params: Promise.resolve(options.params ?? {}) as Promise<never> });
    return { status: response.status, body: (await response.json().catch(() => null)) as Reply["body"] };
  };

  const agent = async (name: string, options: { allowShare?: boolean } = {}) => {
    const created = await db.createAccessToken({ userId: aliceId, name: `${name} ${run}`, scope: "write", agentName: name, allowShare: options.allowShare });
    return { id: created.id, token: created.token, name };
  };
  const setRights = (tokenId: string, access: string, areas: Record<string, string> = {}) =>
    call(routes.rights.PUT, "PUT", `/api/workspaces/${teamA}/agent-rights`, ownerToken, { body: { tokenId, access, areas }, params: { workspaceId: teamA } });
  const createMap = async (filename: string) => {
    await db.writeCloudDocument({ userId: aliceId, workspaceId: teamA, filename, markdown: `# ${filename}\n\nStart.\n`, frontmatter: {} });
    return filename;
  };
  const documentOf = async (filename: string) => (await db.readCloudDocument(aliceId, filename, teamA))!;
  const count = async (table: string, where: string, ...values: string[]) => Number((await sql.unsafe(`select count(*)::int as n from ${table} where ${where}`, values))[0]!.n);
  const area = (path: string) => `Learnings › ${path}`;
  const encoded = (file: string) => encodeURIComponent(file);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.BLOOMMD_AUTH_SECRET = "agent-token-gate-auth-secret-with-enough-entropy";
    process.env.BLOOMMD_DIR = dataDir;
    db = await import("../../apps/app/src/lib/db");
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 2 });
    await db.migrateMarketSchema();
    // The owner routes allow 120 changes per hour and source address; earlier runs on this database must not count.
    await sql`delete from bloom_rate_limits where action in ('agent-rights-manage', 'share-link-create')`;

    const apiRoot = "../../apps/app/src/app/api";
    const workspace = `${apiRoot}/workspaces/[workspaceId]`;
    routes = {
      mindmap: (await import(`${apiRoot}/mindmaps/[filename]/route`)) as unknown as RouteModule,
      mindmaps: (await import(`${apiRoot}/mindmaps/route`)) as unknown as RouteModule,
      nodes: (await import(`${apiRoot}/mindmaps/[filename]/nodes/route`)) as unknown as RouteModule,
      shareLinks: (await import(`${apiRoot}/mindmaps/[filename]/share-links/route`)) as unknown as RouteModule,
      rights: (await import(`${workspace}/agent-rights/route`)) as unknown as RouteModule,
      agents: (await import(`${workspace}/agents/route`)) as unknown as RouteModule,
      agent: (await import(`${workspace}/agents/[agentId]/route`)) as unknown as RouteModule,
      tasks: (await import(`${workspace}/agent-tasks/route`)) as unknown as RouteModule,
      events: (await import(`${workspace}/agent-events/route`)) as unknown as RouteModule,
    };

    aliceId = (await db.upsertMarketUser({ provider: "password", email: `alice-gate-${run}@bloommd.test`, name: "Alice Owner" }))!.id;
    teamA = (await db.createTeamWorkspace({ userId: aliceId, name: `Gate ${run}` })).id;
    ownerToken = (await db.createAccessToken({ userId: aliceId, name: `Alice ${run}`, scope: "write" })).token;
  });

  afterAll(async () => {
    await sql?.end();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("share links need the right to write in the area: read and propose are refused for create and revoke, write may", async () => {
    const file = await createMap(area(`dev-team – link ${run}.md`));
    const { id: documentId } = await documentOf(file);
    const reader = await agent("Leser", { allowShare: true });
    const proposer = await agent("Vorschlaeger", { allowShare: true });
    const writer = await agent("Schreiber", { allowShare: true });
    await setRights(reader.id, "read");
    await setRights(proposer.id, "propose");
    await setRights(writer.id, "write");
    const existing = await db.createShareLink({ userId: aliceId, documentId, expiresInDays: 7 });
    const links = () => count("bloom_share_links", "document_id = $1 and revoked_at is null", documentId);
    expect(await links()).toBe(1);

    for (const bot of [reader, proposer]) {
      const created = await call(routes.shareLinks.POST, "POST", `/api/mindmaps/${encoded(file)}/share-links`, bot.token, { body: {}, workspace: teamA, params: { filename: file } });
      expect({ bot: bot.name, status: created.status, code: created.body?.code }).toEqual({ bot: bot.name, status: 403, code: "AGENT_WRITE_REQUIRED" });
      const revoked = await call(routes.shareLinks.DELETE, "DELETE", `/api/mindmaps/${encoded(file)}/share-links`, bot.token, { body: { id: existing.id }, workspace: teamA, params: { filename: file } });
      expect({ bot: bot.name, status: revoked.status, code: revoked.body?.code }).toEqual({ bot: bot.name, status: 403, code: "AGENT_WRITE_REQUIRED" });
    }
    expect(await links()).toBe(1);

    // Control: with the right to write the same request goes through.
    const created = await call(routes.shareLinks.POST, "POST", `/api/mindmaps/${encoded(file)}/share-links`, writer.token, { body: {}, workspace: teamA, params: { filename: file } });
    expect(created.status).toBe(201);
    expect(await links()).toBe(2);
  });

  test("a rename needs the right to write in the old and in the new area: read, propose and a foreign target area are refused", async () => {
    const file = await createMap(area(`dev-team – alt ${run}.md`));
    const reader = await agent("Umbenenner-Lesen");
    const proposer = await agent("Umbenenner-Vorschlag");
    const narrow = await agent("Umbenenner-Eng");
    await setRights(reader.id, "read");
    await setRights(proposer.id, "propose");
    await setRights(narrow.id, "read", { "Learnings/dev-team": "write" });
    const rename = (token: string, newFilename: string) => call(routes.mindmap.PATCH, "PATCH", `/api/mindmaps/${encoded(file)}`, token, { body: { newFilename }, workspace: teamA, params: { filename: file } });
    const inPlace = area(`dev-team – neu ${run}.md`);
    const elsewhere = `Archiv › ${run} – verschoben.md`;

    for (const [bot, target] of [[reader, inPlace], [proposer, inPlace], [narrow, elsewhere]] as const) {
      const answer = await rename(bot.token, target);
      expect({ bot: bot.name, status: answer.status, code: answer.body?.code }).toEqual({ bot: bot.name, status: 403, code: "AGENT_WRITE_REQUIRED" });
    }
    expect(await db.readCloudDocument(aliceId, file, teamA)).not.toBeNull();
    expect(await db.readCloudDocument(aliceId, inPlace, teamA)).toBeNull();
    expect(await db.readCloudDocument(aliceId, elsewhere, teamA)).toBeNull();
  });

  test("an agent token reaches none of the workspace-agent routes: every call is 401 and nothing changes", async () => {
    const created = await db.addWorkspaceAgent({ userId: aliceId, workspaceId: teamA, provider: "openclaw", displayName: `Workspace-Agent ${run}` });
    const workspaceAgentId = created.agent.id as string;
    const snapshot = async () => ({
      agents: await count("bloom_workspace_agents", "workspace_id = $1", teamA),
      active: await count("bloom_workspace_agents", "id = $1 and status = 'active'", workspaceAgentId),
      tasks: await count("bloom_agent_tasks", "workspace_id = $1", teamA),
    });
    const before = await snapshot();
    expect(before.active).toBe(1);

    const params = { workspaceId: teamA };
    for (const access of ["read", "propose", "write"]) {
      const bot = await agent(`Fremd-${access}`);
      await setRights(bot.id, access);
      const attempts: Array<[string, Handler, string, string, unknown, Record<string, string>]> = [
        ["GET agents", routes.agents.GET, "GET", `/api/workspaces/${teamA}/agents`, undefined, params],
        ["POST agents", routes.agents.POST, "POST", `/api/workspaces/${teamA}/agents`, { provider: "openclaw", displayName: "Eingeschmuggelt" }, params],
        ["DELETE agent", routes.agent.DELETE, "DELETE", `/api/workspaces/${teamA}/agents/${workspaceAgentId}`, undefined, { ...params, agentId: workspaceAgentId }],
        ["GET tasks", routes.tasks.GET, "GET", `/api/workspaces/${teamA}/agent-tasks`, undefined, params],
        ["POST tasks", routes.tasks.POST, "POST", `/api/workspaces/${teamA}/agent-tasks`, { agentId: workspaceAgentId, command: "write", filename: "x.md" }, params],
        ["GET events", routes.events.GET, "GET", `/api/workspaces/${teamA}/agent-events`, undefined, params],
      ];
      for (const [label, handler, method, path, body, routeParams] of attempts) {
        const answer = await call(handler, method, path, bot.token, { body, params: routeParams });
        expect({ access, label, status: answer.status }).toEqual({ access, label, status: 401 });
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  describe("outside the cloud database (BLOOMMD_STORAGE_MODE=filesystem) an agent token is refused, not unchecked", () => {
    const filesystemScope = () => join(dataDir, ".bloommd", "tenants", createHash("sha256").update(`user:${aliceId}`).digest("hex").slice(0, 24));
    const original = process.env.BLOOMMD_STORAGE_MODE;
    beforeAll(() => {
      process.env.BLOOMMD_STORAGE_MODE = "filesystem";
    });
    afterAll(() => {
      if (original === undefined) delete process.env.BLOOMMD_STORAGE_MODE;
      else process.env.BLOOMMD_STORAGE_MODE = original;
    });

    test("create, replace, rename, delete and node changes are each refused with 403, whatever the rights say", async () => {
      const scope = filesystemScope();
      mkdirSync(scope, { recursive: true });
      const content = "# Karte\n\nStart.\n";
      const writer = await agent("Dateimodus-Schreiber");
      await setRights(writer.id, "write");
      const reader = await agent("Dateimodus-Leser");
      await setRights(reader.id, "read");
      // Every attempt gets its own file, so one refused call cannot hide another that would have gone through.
      let n = 0;
      const fresh = () => {
        const file = `Karte-${run}-${++n}.md`;
        writeFileSync(join(scope, file), content);
        return file;
      };
      const attempts: Array<[string, (file: string) => [Handler, string, string, unknown, Record<string, string>]]> = [
        ["POST create", () => [routes.mindmaps.POST, "POST", "/api/mindmaps", { filename: `Neu-${run}-${n}.md`, markdown: "# Neu\n\nVom Agenten.\n" }, {}]],
        ["PUT replace", (file) => [routes.mindmap.PUT, "PUT", `/api/mindmaps/${encoded(file)}`, { markdown: "# Karte\n\n## Ueberschrieben\n", overwrite: true }, { filename: file }]],
        ["PATCH rename", (file) => [routes.mindmap.PATCH, "PATCH", `/api/mindmaps/${encoded(file)}`, { newFilename: `Umbenannt-${run}-${n}.md` }, { filename: file }]],
        ["POST nodes", (file) => [routes.nodes.POST, "POST", `/api/mindmaps/${encoded(file)}/nodes`, { nodes: [{ title: "Eingeschmuggelt" }] }, { filename: file }]],
        ["DELETE", (file) => [routes.mindmap.DELETE, "DELETE", `/api/mindmaps/${encoded(file)}`, undefined, { filename: file }]],
      ];
      for (const bot of [writer, reader]) {
        for (const [label, build] of attempts) {
          const file = fresh();
          const [handler, method, path, body, params] = build(file);
          const answer = await call(handler, method, path, bot.token, { body, params });
          expect({ bot: bot.name, label, status: answer.status }).toEqual({ bot: bot.name, label, status: 403 });
          expect({ bot: bot.name, label, content: readFileSync(join(scope, file), "utf8") }).toEqual({ bot: bot.name, label, content });
        }
      }
      for (const name of [`Neu-${run}-1.md`, `Neu-${run}-6.md`, `Umbenannt-${run}-3.md`, `Umbenannt-${run}-8.md`]) expect(existsSync(join(scope, name))).toBe(false);
    });

    test("control: a personal token (no agent name) keeps working in this mode", async () => {
      const created = await call(routes.mindmaps.POST, "POST", "/api/mindmaps", ownerToken, { body: { filename: `Persoenlich-${run}.md`, markdown: "# Persoenlich\n\nOwner.\n" } });
      expect(created.status).toBe(201);
      expect(existsSync(join(filesystemScope(), `Persoenlich-${run}.md`))).toBe(true);
    });
  });
});
