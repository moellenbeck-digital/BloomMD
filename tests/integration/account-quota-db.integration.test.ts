/**
 * Storage quota of an account (#380) against a real Postgres: the usage query (documents of all
 * workspaces the account owns, deleted ones excluded, UTF-8 bytes), the ops listing, and the
 * enforcement in the sync persistence (save, create) and in `writeCloudDocument`. Runs only with
 * BLOOMMD_TEST_DATABASE_URL (a throwaway database), like the other *-db.integration tests.
 * The limit is made small per test (`quotaLimitBytes`) instead of writing 100 MB.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { testDatabaseUrl } from "./db-test-url";

const url = testDatabaseUrl();

describe.skipIf(!url)("account storage quota (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  let parseFile: typeof import("../../packages/core/src/parser").parseFile;
  let createDatabasePersistence: typeof import("../../packages/sync/src/persistence").createDatabasePersistence;
  const run = Date.now().toString(36);
  let userId: string;
  let otherUserId: string;
  let emptyUserId: string;
  let teamId: string;
  let otherTeamId: string;

  const isQuotaError = (error: unknown) => error instanceof Error && (error as { code?: string }).code === "QUOTA_EXCEEDED";
  const bytesOf = async (id: string) => Number((await sql`select octet_length(markdown) as bytes from bloom_documents where id = ${id}`)[0]!.bytes);
  const body = (length: number) => `# Q\n\n${"x".repeat(length)}\n`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    ({ parseFile } = await import("../../packages/core/src/parser"));
    ({ createDatabasePersistence } = await import("../../packages/sync/src/persistence"));
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 1 });
    userId = (await db.upsertMarketUser({ provider: "password", email: `quota-a-${run}@bloommd.test`, name: "Quota A" }))!.id;
    otherUserId = (await db.upsertMarketUser({ provider: "password", email: `quota-b-${run}@bloommd.test`, name: "Quota B" }))!.id;
    emptyUserId = (await db.upsertMarketUser({ provider: "password", email: `quota-c-${run}@bloommd.test`, name: "Quota C" }))!.id;
    teamId = (await db.createTeamWorkspace({ userId, name: `Quota ${run}` })).id;
    otherTeamId = (await db.createTeamWorkspace({ userId: otherUserId, name: `Quota other ${run}` })).id;
  });

  afterEach(() => {
    delete process.env.BLOOMMD_ACCOUNT_QUOTA;
  });

  afterAll(async () => {
    await sql?.end();
  });

  test("usage = UTF-8 bytes of the Markdown of all not deleted documents in the workspaces the account owns", async () => {
    const personal = await db.getWorkspaceForUser(userId);
    const umlauts = await db.writeCloudDocument({ userId, workspaceId: personal.id, filename: "umlaut.md", markdown: "# Ärger über Öl €\n", frontmatter: { title: "zählt nicht mit" } });
    const team = await db.writeCloudDocument({ userId, workspaceId: teamId, filename: "team.md", markdown: body(100), frontmatter: {} });
    const gone = await db.writeCloudDocument({ userId, workspaceId: teamId, filename: "gone.md", markdown: body(5000), frontmatter: {} });
    await db.deleteCloudDocument(userId, "gone.md", teamId);
    await db.writeCloudDocument({ userId: otherUserId, workspaceId: otherTeamId, filename: "other.md", markdown: body(777), frontmatter: {} });

    const expected = Buffer.byteLength("# Ärger über Öl €\n", "utf8") + Buffer.byteLength(body(100), "utf8");
    expect(await db.getAccountStorageUsage(userId)).toBe(expected);
    expect(await bytesOf(umlauts.id)).toBe(Buffer.byteLength("# Ärger über Öl €\n", "utf8"));
    expect(gone.id).toBeTruthy();
    expect(team.id).toBeTruthy();
  });

  test("an account without documents uses 0; the ops listing holds every account with its bytes and no address", async () => {
    expect(await db.getAccountStorageUsage(emptyUserId)).toBe(0);
    const listing = await db.listAccountStorageUsage();
    const byId = new Map(listing.map((row) => [row.accountId, row.usedBytes]));
    expect(byId.get(emptyUserId)).toBe(0);
    expect(byId.get(userId)).toBe(await db.getAccountStorageUsage(userId));
    expect(byId.get(otherUserId)).toBe(Buffer.byteLength(body(777), "utf8"));
    expect(JSON.stringify(listing)).not.toContain("@bloommd.test");
  });

  test("the sync persistence refuses a save that grows beyond the limit, allows shrinking, and keeps the stored document", async () => {
    const setup = createDatabasePersistence(url!);
    const descriptor = { key: `q-${run}`, filename: "q.md", workspaceId: teamId, userId };
    const created = await setup.create!(descriptor, parseFile("q.md", body(100)));
    const documentId = created.storage!.documentId!;
    const at = (markdown: string, version: number) => ({ ...parseFile("q.md", markdown), storage: { mode: "database" as const, documentId, workspaceId: teamId, version } });
    const saveDescriptor = { ...descriptor, key: documentId, documentId };

    const used = await db.getAccountStorageUsage(userId);
    const enforced = createDatabasePersistence(url!, { quotaEnforced: true, quotaLimitBytes: used + 150 });

    const grown = await enforced.save(saveDescriptor, at(body(200), created.storage!.version));
    const storedBytes = await bytesOf(documentId);

    const refused = await enforced.save(saveDescriptor, at(body(300), grown.storage!.version)).catch((error: unknown) => error);
    expect(isQuotaError(refused)).toBe(true);
    expect(await bytesOf(documentId)).toBe(storedBytes);
    expect((await sql`select version from bloom_documents where id = ${documentId}`)[0]!.version).toBe(String(grown.storage!.version));

    const shrunk = await enforced.save(saveDescriptor, at(body(150), grown.storage!.version));
    expect(shrunk.storage!.version).toBe(grown.storage!.version + 1);
    expect(await bytesOf(documentId)).toBeLessThan(storedBytes);

    const refusedCreate = await enforced.create!({ key: `big-${run}`, filename: "big.md", workspaceId: teamId, userId }, parseFile("big.md", body(1000))).catch((error: unknown) => error);
    expect(isQuotaError(refusedCreate)).toBe(true);
    expect((await sql`select 1 from bloom_documents where workspace_id = ${teamId} and filename = 'big.md'`).length).toBe(0);

    // The workspace's owner pays, whoever writes: another account's documents do not count.
    const usedAfter = await db.getAccountStorageUsage(userId);
    const overLimit = createDatabasePersistence(url!, { quotaEnforced: true, quotaLimitBytes: usedAfter - 1 });
    const stillRefused = await overLimit.save(saveDescriptor, at(body(400), shrunk.storage!.version)).catch((error: unknown) => error);
    expect(isQuotaError(stillRefused)).toBe(true);
    const shrinkOverLimit = await overLimit.save(saveDescriptor, at(body(120), shrunk.storage!.version));
    expect(shrinkOverLimit.storage!.version).toBe(shrunk.storage!.version + 1);
    await overLimit.delete!({ ...saveDescriptor }, shrinkOverLimit.storage!.version);
    expect((await sql`select deleted_at from bloom_documents where id = ${documentId}`)[0]!.deleted_at).not.toBeNull();
  });

  test("writeCloudDocument checks the quota only with the switch on", async () => {
    await db.writeCloudDocument({ userId: otherUserId, workspaceId: otherTeamId, filename: "w.md", markdown: body(100), frontmatter: {} });
    const used = await db.getAccountStorageUsage(otherUserId);
    const limit = used + 150;

    // Off (default): no limit applies, however small.
    await db.writeCloudDocument({ userId: otherUserId, workspaceId: otherTeamId, filename: "w.md", markdown: body(400), frontmatter: {}, quotaLimitBytes: 1 });

    process.env.BLOOMMD_ACCOUNT_QUOTA = "1";
    const current = await db.getAccountStorageUsage(otherUserId);
    const refused = await db.writeCloudDocument({ userId: otherUserId, workspaceId: otherTeamId, filename: "w.md", markdown: body(900), frontmatter: {}, quotaLimitBytes: current + 100 }).catch((error: unknown) => error);
    expect(isQuotaError(refused)).toBe(true);
    const shrunk = await db.writeCloudDocument({ userId: otherUserId, workspaceId: otherTeamId, filename: "w.md", markdown: body(200), frontmatter: {}, quotaLimitBytes: 1 });
    expect(shrunk.markdown).toBe(body(200));
    expect(limit).toBeGreaterThan(used);
  });
});
