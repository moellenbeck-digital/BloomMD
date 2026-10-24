/**
 * Agent tokens, workspace limits, read-only share links and agent audit entries against a real
 * Postgres. Runs only with BLOOMMD_TEST_DATABASE_URL (a throwaway database; it is migrated here),
 * e.g. `docker run -d -e POSTGRES_PASSWORD=qa -p 55433:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const url = process.env.BLOOMMD_TEST_DATABASE_URL;

describe.skipIf(!url)("agent tokens and share links (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let auth: typeof import("../../apps/app/src/lib/auth");
  let storage: typeof import("../../apps/app/src/lib/mindmap-storage");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  let alice: string;
  let bob: string;
  let team: { id: string };
  let documentId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    auth = await import("../../apps/app/src/lib/auth");
    storage = await import("../../apps/app/src/lib/mindmap-storage");
    // The web app owns the Postgres client; load it from there.
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 1 });
    alice = (await db.upsertMarketUser({ provider: "password", email: `alice-${run}@bloommd.test`, name: "Alice" }))!.id;
    bob = (await db.upsertMarketUser({ provider: "password", email: `bob-${run}@bloommd.test`, name: "Bob" }))!.id;
    team = await db.createTeamWorkspace({ userId: alice, name: `Team ${run}` });
    const document = await db.writeCloudDocument({ userId: alice, workspaceId: team.id, filename: "plan.md", markdown: "# Plan\n\n## Ziel\n\nLaunch.\n", frontmatter: { title: "Plan" } });
    documentId = document.id;
  });

  afterAll(async () => {
    await sql?.end();
  });

  const request = (method: string, path: string, token: string, headers: Record<string, string> = {}) =>
    new Request(`https://app.bloommd.test${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers } });

  test("a read-only agent token bound to one workspace reaches only that workspace's documents", async () => {
    const created = await db.createAccessToken({ userId: alice, name: "OpenClaw (Mac)", scope: "read", workspaceIds: [team.id], agentName: "OpenClaw" });
    const resolved = await db.resolveAccessToken(created.token);
    expect(resolved).toMatchObject({ userId: alice, scope: "read", workspaceIds: [team.id], agentName: "OpenClaw" });

    expect(await auth.getApiRequestIdentity(request("GET", "/api/mindmaps", created.token))).toMatchObject({ tokenScope: "read", agentName: "OpenClaw" });
    expect(await auth.getApiRequestIdentity(request("PUT", "/api/mindmaps/plan.md", created.token))).toBeNull();
    expect(await auth.getApiRequestIdentity(request("GET", "/api/account/export", created.token))).toBeNull();

    const identity = (await auth.getApiRequestIdentity(request("GET", "/api/mindmaps", created.token)))!;
    const listed = await (await storage.getMindmapStorage(request("GET", "/api/mindmaps", created.token), identity)).list();
    expect(listed.map((entry) => entry.filename)).toContain("plan.md");
    const personal = await db.getWorkspaceForUser(alice);
    await expect(storage.getMindmapStorage(request("GET", "/api/mindmaps", created.token, { "X-BloomMD-Workspace-ID": personal.id }), identity)).rejects.toThrow("Workspace not found or access denied.");

    await expect(db.createAccessToken({ userId: bob, name: "x", scope: "write", workspaceIds: [team.id] })).rejects.toThrow("Workspace not found or access denied.");
    const listedTokens = await db.listAccessTokens(alice);
    expect(listedTokens.find((token) => token.id === created.id)).toMatchObject({ scope: "read", workspaceIds: [team.id], agentName: "OpenClaw", allowShare: false });

    // Sharing is opt-in per agent token and never granted to read-only tokens.
    const sharing = await db.createAccessToken({ userId: alice, name: "OpenClaw (teilen)", scope: "write", agentName: "OpenClaw", allowShare: true });
    expect(await db.resolveAccessToken(sharing.token)).toMatchObject({ allowShare: true });
    const readOnly = await db.createAccessToken({ userId: alice, name: "x", scope: "read", agentName: "OpenClaw", allowShare: true });
    expect(await db.resolveAccessToken(readOnly.token)).toMatchObject({ allowShare: false });
    const sharingIdentity = await auth.getApiRequestIdentity(request("GET", "/api/mindmaps", sharing.token));
    expect(sharingIdentity).toMatchObject({ tokenAllowShare: true, agentName: "OpenClaw" });
  });

  test("a share link shows the map until it is revoked or expires; outsiders cannot create one", async () => {
    const link = await db.createShareLink({ userId: alice, documentId, expiresInDays: 7 });
    expect(link.token).toStartWith("bloom_share_");
    const shared = await db.resolveShareLink(link.token);
    expect(shared).toMatchObject({ filename: "plan.md" });
    expect(shared!.markdown).toContain("## Ziel");
    expect(await db.resolveShareLink(`${link.token}x`)).toBeNull();

    const stored = await sql`select token_hash from bloom_share_links where id = ${link.id}`;
    expect(stored[0]!.token_hash).not.toBe(link.token);

    expect(await db.revokeShareLink(alice, documentId, link.id)).toBe(true);
    expect(await db.resolveShareLink(link.token)).toBeNull();

    const expiring = await db.createShareLink({ userId: alice, documentId, expiresInDays: 1 });
    await sql`update bloom_share_links set expires_at = now() - interval '1 minute' where id = ${expiring.id}`;
    expect(await db.resolveShareLink(expiring.token)).toBeNull();

    const byAgent = await db.createShareLink({ userId: alice, documentId, tokenId: "tok-share", agentName: "OpenClaw" });
    const audit = await sql`select details from bloom_audit_events where event_type = 'document.share_link.created' and target_id = ${byAgent.id}`;
    expect(audit[0]!.details).toMatchObject({ documentId, agent: "OpenClaw", tokenId: "tok-share" });

    // A link stops working when its creator loses edit rights in the workspace.
    const carol = (await db.upsertMarketUser({ provider: "password", email: `carol-${run}@bloommd.test`, name: "Carol" }))!.id;
    await sql`insert into bloom_workspace_members (workspace_id, user_id, role) values (${team.id}, ${carol}, 'editor')`;
    const carols = await db.createShareLink({ userId: carol, documentId });
    expect(await db.resolveShareLink(carols.token)).not.toBeNull();
    await sql`delete from bloom_workspace_members where workspace_id = ${team.id} and user_id = ${carol}`;
    expect(await db.resolveShareLink(carols.token)).toBeNull();

    await expect(db.createShareLink({ userId: bob, documentId })).rejects.toThrow("Shared document not found.");
    expect(await db.revokeShareLink(bob, documentId, expiring.id)).toBe(false);
    expect((await db.listShareLinks(alice, documentId)).length).toBeGreaterThanOrEqual(2);
  });

  test("agent writes are audited with the agent's name", async () => {
    expect(await db.recordAgentDocumentWrite({ userId: alice, documentId, tokenId: "tok-1", agentName: "OpenClaw", workspaceId: team.id })).toBe(true);
    const rows = await sql`select details from bloom_audit_events where event_type = 'document.agent_write' and target_id = ${documentId}`;
    expect(rows[0]!.details).toMatchObject({ agent: "OpenClaw", tokenId: "tok-1", workspaceId: team.id });
    const typed = await sql`select jsonb_typeof(details) as type from bloom_audit_events where event_type like 'document.%' and details is not null`;
    expect(typed.every((row) => row.type === "object")).toBe(true);
  });
});
