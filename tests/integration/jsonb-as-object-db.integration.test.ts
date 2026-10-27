/**
 * jsonb columns hold objects/arrays, not JSON strings (#31) — written through the real db functions
 * and the sync persistence, and read back from both the new and the legacy (string) format, against
 * a real Postgres. Runs only with BLOOMMD_TEST_DATABASE_URL (a throwaway database; it is migrated
 * here), e.g. `docker run -d -e POSTGRES_PASSWORD=qa -p 55433:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const url = process.env.BLOOMMD_TEST_DATABASE_URL;

describe.skipIf(!url)("jsonb columns are objects, legacy strings still read (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let persistence: import("../../packages/sync/src/persistence").DocumentPersistence;
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  let userId: string;
  let workspaceId: string;
  let documentId: string;

  const typeOf = async (table: string, column: string, id: string) => {
    const rows = await sql.unsafe(`select jsonb_typeof(${column}) as type from ${table} where id = $1`, [id]);
    return rows[0]!.type as string;
  };
  /** Reproduces the pre-#31 write: JSON text stored as a jsonb string. */
  const legacy = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    const { createDatabasePersistence } = await import("../../packages/sync/src/persistence");
    persistence = createDatabasePersistence(url!);
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 1 });
    userId = (await db.upsertMarketUser({ provider: "password", email: `jsonb-${run}@bloommd.test`, name: "Json" }))!.id;
    workspaceId = (await db.createTeamWorkspace({ userId, name: `Jsonb ${run}` })).id;
  });

  afterAll(async () => {
    await sql?.end();
  });

  test("documents written by the app API have an object frontmatter (insert and update)", async () => {
    const created = await db.writeCloudDocument({ userId, workspaceId, filename: "app.md", markdown: "# App\n", frontmatter: { title: "App Titel", tags: ["a"] } });
    documentId = created.id;
    expect(await typeOf("bloom_documents", "frontmatter", created.id)).toBe("object");
    const updated = await db.writeCloudDocument({ userId, workspaceId, filename: "app.md", markdown: "# App 2\n", frontmatter: { title: "Neu" }, expectedVersion: created.version });
    expect(updated.frontmatter).toEqual({ title: "Neu" });
    expect(await typeOf("bloom_documents", "frontmatter", created.id)).toBe("object");
    const rows = await sql`select frontmatter->>'title' as title from bloom_documents where id = ${created.id}`;
    expect(rows[0]!.title).toBe("Neu");
  });

  test("documents persisted from the sync room have an object frontmatter (create and save)", async () => {
    const { parseFile } = await import("../../packages/core/src/parser");
    const descriptor = { key: `sync-${run}`, filename: "sync.md", workspaceId, userId };
    const created = await persistence.create!(descriptor, parseFile("sync.md", "---\ntitle: Sync Titel\n---\n# Sync\n"));
    const id = created.storage!.documentId!;
    expect(await typeOf("bloom_documents", "frontmatter", id)).toBe("object");
    expect((await sql`select frontmatter->>'title' as title from bloom_documents where id = ${id}`)[0]!.title).toBe("Sync Titel");

    await persistence.save({ ...descriptor, documentId: id }, { ...parseFile("sync.md", "---\ntitle: Sync Zwei\n---\n# Sync\n"), storage: created.storage });
    expect(await typeOf("bloom_documents", "frontmatter", id)).toBe("object");
    expect((await sql`select frontmatter->>'title' as title from bloom_documents where id = ${id}`)[0]!.title).toBe("Sync Zwei");
  });

  test("saved views are objects and are restored unchanged", async () => {
    const view = { x: 10, y: 20, zoom: 1.5, collapsed: ["n1"] };
    const saved = await db.saveCloudDocumentView({ userId, workspaceId, documentId, name: "Ansicht", view });
    expect(await typeOf("bloom_document_views", "view", saved.id)).toBe("object");
    const listed = await db.listCloudDocumentViews(userId, documentId, workspaceId);
    expect(listed.find((entry) => entry.id === saved.id)!.view).toEqual(view);
  });

  test("Stripe events and billing records have an object payload / raw", async () => {
    const eventId = `evt_${run}`;
    expect(await db.recordStripeEvent({ id: eventId, type: "checkout.session.completed", payload: { id: eventId, data: { object: { a: 1 } } } })).toBe(true);
    expect((await sql`select jsonb_typeof(payload) as type from bloom_stripe_events where id = ${eventId}`)[0]!.type).toBe("object");

    await db.recordStripeSubscription({ userId, tier: "pro", status: "active", mode: "subscription", stripeSubscriptionId: `sub_${run}`, stripeCustomerId: `cus_${run}`, raw: { id: `sub_${run}` } });
    await db.recordStripeSubscription({ userId, tier: "pro", status: "active", mode: "payment", stripeCheckoutSessionId: `cs_${run}`, raw: { id: `cs_${run}` } });
    const rows = await sql`select jsonb_typeof(raw) as type from bloom_subscriptions where stripe_subscription_id = ${`sub_${run}`} or stripe_checkout_session_id = ${`cs_${run}`}`;
    expect(rows.map((row) => row.type)).toEqual(["object", "object"]);
  });

  test("agent proposals store an array of child nodes and keep showing them", async () => {
    const invitation = await db.addWorkspaceAgent({ userId, workspaceId, provider: "openclaw" });
    const { agent } = await db.pairWorkspaceAgent(invitation.pairingCode);
    const task = await db.createWorkspaceAgentTask({
      userId, workspaceId, agentId: agent.id, documentId, filename: "app.md", prompt: "Ideen",
      node: { id: "n1", title: "App", path: "App", content: "# App 2\n" },
    });
    const claimed = await db.claimWorkspaceAgentTask(agent);
    expect(claimed?.id).toBe(task.id);
    const childNodes = [{ title: "Erste Aufgabe", content: "Details", kind: "task" as const }, { title: "Entscheidung", content: "", kind: "decision" as const }];
    await db.completeWorkspaceAgentTaskByAgent({ agent, taskId: task.id, summary: "ok", proposal: { childNodes, rationale: "Weil" } });

    const stored = await sql`select id, jsonb_typeof(proposed_child_nodes) as type from bloom_agent_proposals where task_id = ${task.id}`;
    expect(stored[0]!.type).toBe("array");
    const proposals = (await db.listWorkspaceAgentTasks(userId, workspaceId)).find((entry) => entry.id === task.id)!.proposals;
    expect(proposals[0]!.proposedChildNodes).toEqual(childNodes);

    // Legacy row: the array stored as a jsonb string must still be shown, not dropped to [].
    await sql`update bloom_agent_proposals set proposed_child_nodes = ${legacy(childNodes)} where id = ${stored[0]!.id}`;
    expect((await sql`select jsonb_typeof(proposed_child_nodes) as type from bloom_agent_proposals where id = ${stored[0]!.id}`)[0]!.type).toBe("string");
    const legacyProposals = (await db.listWorkspaceAgentTasks(userId, workspaceId)).find((entry) => entry.id === task.id)!.proposals;
    expect(legacyProposals[0]!.proposedChildNodes).toEqual(childNodes);
    const forApply = await db.getWorkspaceAgentProposalForApply(userId, workspaceId, stored[0]!.id as string);
    expect(forApply.proposedChildNodes).toEqual(childNodes);
  });

  test("documents and views in the legacy string format are still read as objects", async () => {
    const frontmatter = { title: "Alt", tags: ["x"] };
    const view = { x: 1, y: 2, zoom: 3 };
    await sql`update bloom_documents set frontmatter = ${legacy(frontmatter)} where id = ${documentId}`;
    await sql`update bloom_document_views set view = ${legacy(view)} where document_id = ${documentId}`;
    expect((await sql`select jsonb_typeof(frontmatter) as type from bloom_documents where id = ${documentId}`)[0]!.type).toBe("string");
    expect((await sql`select jsonb_typeof(view) as type from bloom_document_views where document_id = ${documentId}`)[0]!.type).toBe("string");

    expect((await db.readCloudDocument(userId, "app.md", workspaceId))!.frontmatter).toEqual(frontmatter);
    expect((await db.listCloudDocuments(userId, workspaceId)).documents.find((entry) => entry.id === documentId)!.frontmatter).toEqual(frontmatter);
    expect((await db.listCloudDocumentViews(userId, documentId, workspaceId))[0]!.view).toEqual(view);
    const exported = await db.exportAccountData(userId);
    expect(exported.documents.find((entry) => (entry as { id: string }).id === documentId)).toMatchObject({ frontmatter });
    expect(exported.views.find((entry) => (entry as { document_id: string }).document_id === documentId)).toMatchObject({ view });
  });
});
