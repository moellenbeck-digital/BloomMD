import { describe, expect, mock, test } from "bun:test";
import { parseFile } from "@bloommd/core";

let queryCount = 0;
let queryTexts: string[] = [];
let queryResults: unknown[][] = [];

mock.module("./sql-client", () => ({
  createSqlClient: () => async (strings: TemplateStringsArray) => {
    queryCount += 1;
    queryTexts.push(strings.join("?"));
    return queryResults.shift() ?? [];
  },
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
