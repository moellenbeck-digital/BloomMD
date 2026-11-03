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
