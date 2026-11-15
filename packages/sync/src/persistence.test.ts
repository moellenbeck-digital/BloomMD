import { describe, expect, mock, test } from "bun:test";
import { parseFile } from "@bloommd/core";

let queryCount = 0;
let queryTexts: string[] = [];
let queryParams: unknown[][] = [];
let queryResults: unknown[][] = [];

mock.module("./sql-client", () => ({
  createSqlClient: () => Object.assign(async (strings: TemplateStringsArray, ...params: unknown[]) => {
    queryCount += 1;
    queryTexts.push(strings.join("?"));
    queryParams.push(params);
    return queryResults.shift() ?? [];
  }, { json: (value: unknown) => value }),
}));

const { createDatabasePersistence, SyncDocumentVersionConflictError } = await import("./persistence");
const { ACCOUNT_QUOTA_BYTES, AccountQuotaExceededError } = await import("@bloommd/core/account-quota");

describe("database persistence conflict handling", () => {
  test("fails on a stale version without an unconditional fallback update", async () => {
    queryCount = 0;
    queryTexts = [];
    queryResults = [];
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd");

    await expect(persistence.save({
      key: "doc-1",
      filename: "test.md",
      documentId: "doc-1",
      workspaceId: "workspace-1",
      userId: "user-1",
    }, {
      ...parseFile("test.md", "# Local change"),
      storage: { mode: "database", documentId: "doc-1", workspaceId: "workspace-1", version: 4 },
    })).rejects.toBeInstanceOf(SyncDocumentVersionConflictError);

    expect(queryCount).toBe(1);
  });

  test("a save stores the version it replaces and keeps the newest 20, in the same statement (#3)", async () => {
    queryCount = 0;
    queryTexts = [];
    queryParams = [];
    queryResults = [[{ version: 5 }]];
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd");

    const saved = await persistence.save({
      key: "doc-1",
      filename: "test.md",
      documentId: "doc-1",
      workspaceId: "workspace-1",
      userId: "user-1",
    }, {
      ...parseFile("test.md", "# Local change"),
      storage: { mode: "database", documentId: "doc-1", workspaceId: "workspace-1", version: 4 },
    });

    expect(saved.storage?.version).toBe(5);
    // One statement: the revision exists exactly when the save went through.
    expect(queryCount).toBe(1);
    const statement = queryTexts[0]!.replace(/\s+/g, " ");
    expect(statement).toContain("for update of d");
    expect(statement).toContain("insert into bloom_document_revisions");
    expect(statement).toContain("delete from bloom_document_revisions");
    // Only writers of the workspace save, and the replaced row is the one the version check matched.
    expect(statement).toContain("m.role in ('owner', 'editor')");
    expect(statement).toContain("and d.version = ?");
    // 19 older revisions plus the one just made are 20; the pruning is skipped when the save did not happen.
    expect(statement).toContain("and exists (select 1 from prev)");
    expect(queryParams[0]).toContain(19);
  });

  test("confirms a named durable operation only at its next expected version", async () => {
    queryCount = 0;
    queryTexts = [];
    queryResults = [[{
      id: "doc-1",
      workspace_id: "workspace-1",
      filename: "test.md",
      markdown: "# Saved change",
      version: 5,
    }]];
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd");

    const confirmed = await persistence.confirmSave?.({
      key: "doc-1",
      filename: "test.md",
      documentId: "doc-1",
      workspaceId: "workspace-1",
      userId: "user-1",
    }, {
      id: "b4b8218a-b194-4e1e-94ed-afebcecf3f7d",
      revision: 9,
      expectedVersion: 4,
    });

    expect(confirmed?.storage).toEqual({
      mode: "database",
      documentId: "doc-1",
      workspaceId: "workspace-1",
      version: 5,
    });
    expect(queryCount).toBe(1);
    expect(queryTexts[0]).toContain("sync_persistence_operation_id");
    expect(queryTexts[0]).toContain("d.version =");
  });
});

describe("database persistence account quota (#380)", () => {
  const descriptor = { key: "doc-1", filename: "test.md", documentId: "doc-1", workspaceId: "workspace-1", userId: "user-1" };
  const growing = () => ({
    ...parseFile("test.md", "# Local change that is longer than the stored one"),
    storage: { mode: "database" as const, documentId: "doc-1", workspaceId: "workspace-1", version: 4 },
  });
  const reset = (...results: unknown[][]) => {
    queryCount = 0;
    queryTexts = [];
    queryParams = [];
    queryResults = [...results];
  };

  test("with the switch off no extra query runs", async () => {
    reset([{ version: 5 }]);
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd");
    await persistence.save(descriptor, growing());
    expect(queryCount).toBe(1);
  });

  test("a growing save of an account at the limit is refused and nothing is written", async () => {
    reset([{ bytes: 10 }], [{ used: String(ACCOUNT_QUOTA_BYTES) }], [{ version: 5 }]);
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd", { quotaEnforced: true });
    const error = await persistence.save(descriptor, growing()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AccountQuotaExceededError);
    expect((error as InstanceType<typeof AccountQuotaExceededError>).usedBytes).toBe(ACCOUNT_QUOTA_BYTES);
    // Lookup of the old size and the aggregate; the save statement itself never ran.
    expect(queryCount).toBe(2);
    expect(queryTexts.some((text) => text.includes("update bloom_documents"))).toBe(false);
    const aggregate = queryTexts[1]!.replace(/\s+/g, " ");
    expect(aggregate).toContain("sum(octet_length(d.markdown))");
    expect(aggregate).toContain("d.deleted_at is null");
    expect(aggregate).toContain("w.owner_user_id = (select owner_user_id from bloom_workspaces where id = ?)");
  });

  test("a growing save below the limit goes through", async () => {
    reset([{ bytes: 10 }], [{ used: "1000" }], [{ version: 5 }]);
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd", { quotaEnforced: true });
    const saved = await persistence.save(descriptor, growing());
    expect(saved.storage?.version).toBe(5);
    expect(queryCount).toBe(3);
  });

  test("an account over the limit may still shrink a document: no aggregate, the save runs", async () => {
    reset([{ bytes: 100_000 }], [{ version: 5 }]);
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd", { quotaEnforced: true });
    const saved = await persistence.save(descriptor, growing());
    expect(saved.storage?.version).toBe(5);
    expect(queryCount).toBe(2);
    expect(queryTexts.some((text) => text.includes("sum(octet_length"))).toBe(false);
  });

  test("creating a document at the limit is refused before the insert", async () => {
    reset([{ used: String(ACCOUNT_QUOTA_BYTES) }], [{ id: "doc-2", workspace_id: "workspace-1", filename: "new.md", markdown: "# New", version: 1 }]);
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd", { quotaEnforced: true });
    await expect(persistence.create!({ key: "create:workspace-1:new.md", filename: "new.md", workspaceId: "workspace-1", userId: "user-1" }, parseFile("new.md", "# New")))
      .rejects.toBeInstanceOf(AccountQuotaExceededError);
    expect(queryCount).toBe(1);
  });

  test("creating a document below the limit goes through", async () => {
    reset([{ used: "10" }], [{ id: "doc-2", workspace_id: "workspace-1", filename: "new.md", markdown: "# New", version: 1 }]);
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd", { quotaEnforced: true });
    const created = await persistence.create!({ key: "create:workspace-1:new.md", filename: "new.md", workspaceId: "workspace-1", userId: "user-1" }, parseFile("new.md", "# New"));
    expect(created.storage?.documentId).toBe("doc-2");
  });

  test("rename and delete are never looked at by the quota", async () => {
    reset([{ id: "doc-1", filename: "b.md", version: 5 }], [{ id: "doc-1" }]);
    const persistence = createDatabasePersistence("postgres://test.invalid/bloommd", { quotaEnforced: true });
    await persistence.rename!(descriptor, "b.md", 4);
    await persistence.delete!(descriptor, 5);
    expect(queryCount).toBe(2);
  });
});
