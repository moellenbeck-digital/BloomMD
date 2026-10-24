import { describe, expect, test } from "bun:test";
import { buildSyncRoomStatusUrl, createThroughSyncServer, deleteThroughSyncServer, fetchSyncRoomStatus, isSyncRoomActive, renameThroughSyncServer, writeThroughSyncServer } from "./sync-room-status";

describe("sync room status", () => {
  test("builds an internal HTTP status URL from the public websocket URL", () => {
    expect(buildSyncRoomStatusUrl("wss://sync.bloommd.app", "doc/1")).toBe("https://sync.bloommd.app/internal/rooms/doc%2F1");
    expect(buildSyncRoomStatusUrl("ws://localhost:4100/base", "doc-1")).toBe("http://localhost:4100/base/internal/rooms/doc-1");
  });

  test("uses the shared sync secret and reports active rooms", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = (async (input: string, init?: RequestInit) => {
      calls.push({ input, init });
      return Response.json({
        active: true,
        clients: 2,
        isPersisting: false,
        hasPendingPersist: true,
        degraded: false,
        version: 3,
      });
    }) as typeof fetch;

    await expect(isSyncRoomActive("doc-1", {
      NEXT_PUBLIC_SYNC_URL: "wss://sync.bloommd.app",
      BLOOMMD_SYNC_SECRET: "sync-secret-with-enough-variety-123",
    }, fetcher)).resolves.toBe(true);

    expect(calls[0]?.input).toBe("https://sync.bloommd.app/internal/rooms/doc-1");
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe("Bearer sync-secret-with-enough-variety-123");
  });

  test("prefers the server-only internal endpoint for mutations and room status", async () => {
    const calls: string[] = [];
    const fetcher = (async (input: string) => {
      calls.push(input);
      return Response.json({ active: true, clients: 0, isPersisting: false, hasPendingPersist: false, degraded: false, version: 1 });
    }) as typeof fetch;
    const env = {
      NEXT_PUBLIC_SYNC_URL: "ws://localhost:34100",
      BLOOMMD_SYNC_INTERNAL_URL: "ws://sync:4100",
      BLOOMMD_SYNC_SECRET: "sync-secret-with-enough-variety-123",
    };

    await fetchSyncRoomStatus("doc-1", env, fetcher);
    await createThroughSyncServer({ filename: "new.md", markdown: "# New", workspaceId: "workspace-1", userId: "user-1" }, env, fetcher);

    expect(calls).toEqual([
      "http://sync:4100/internal/rooms/doc-1",
      "http://sync:4100/internal/documents",
    ]);
  });

  test("does not query sync when sync is not configured", async () => {
    let called = false;
    const fetcher = async () => {
      called = true;
      return Response.json({ active: true });
    };

    await expect(fetchSyncRoomStatus("doc-1", {}, fetcher)).resolves.toBeNull();
    expect(called).toBe(false);
  });

  test("writes a snapshot through the sync mutation endpoint with its optimistic version", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = (async (input: string, init?: RequestInit) => {
      calls.push({ input, init });
      return Response.json({ filePath: "synced.md", frontmatter: {}, version: 8 });
    }) as typeof fetch;

    await writeThroughSyncServer("doc-1", {
      filename: "synced.md",
      markdown: "# Synced",
      workspaceId: "workspace-1",
      userId: "user-1",
      expectedVersion: 7,
    }, {
      NEXT_PUBLIC_SYNC_URL: "wss://sync.bloommd.app",
      BLOOMMD_SYNC_SECRET: "sync-secret-with-enough-variety-123",
    }, fetcher);

    expect(calls[0]?.input).toBe("https://sync.bloommd.app/internal/documents/doc-1/snapshot");
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({
      filename: "synced.md",
      markdown: "# Synced",
      workspaceId: "workspace-1",
      userId: "user-1",
      expectedVersion: 7,
    }));
  });

  test("fails closed when cloud mutation sync is not configured", async () => {
    await expect(createThroughSyncServer({
      filename: "new.md",
      markdown: "# New",
      workspaceId: "workspace-1",
      userId: "user-1",
    }, {}, fetch)).rejects.toMatchObject({ code: "SYNC_MUTATION_UNAVAILABLE", status: 503 });
  });

  test("uses document commands for rename and delete", async () => {
    const paths: string[] = [];
    const fetcher = (async (input: string, init?: RequestInit) => {
      paths.push(`${init?.method}:${input}`);
      return Response.json(init?.method === "PATCH"
        ? { success: true, newFilePath: "renamed.md", newFilename: "renamed.md", version: 8 }
        : { deleted: "renamed.md" });
    }) as typeof fetch;
    const env = {
      NEXT_PUBLIC_SYNC_URL: "wss://sync.bloommd.app",
      BLOOMMD_SYNC_SECRET: "sync-secret-with-enough-variety-123",
    };

    await renameThroughSyncServer("doc-1", { filename: "synced.md", newFilename: "renamed.md", workspaceId: "workspace-1", userId: "user-1", expectedVersion: 7 }, env, fetcher);
    await deleteThroughSyncServer("doc-1", { filename: "renamed.md", workspaceId: "workspace-1", userId: "user-1", expectedVersion: 8 }, env, fetcher);

    expect(paths).toEqual([
      "PATCH:https://sync.bloommd.app/internal/documents/doc-1",
      "DELETE:https://sync.bloommd.app/internal/documents/doc-1",
    ]);
  });
});
