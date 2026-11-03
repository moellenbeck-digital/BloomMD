import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../lib/auth";
import { isAgentTokenIdentity } from "../../../../../lib/agent-gate";
import { getMindmapStorage } from "../../../../../lib/mindmap-storage";
import { assertSameOriginForIdentity, readJsonBody } from "../../../../../lib/request-security";
import { SyncMutationError, writeThroughSyncServer } from "../../../../../lib/sync-room-status";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ filename: string }>;
}

/** The history is a feature for people: agent tokens have their own rights and change log. */
const AGENT_REFUSED = { error: "Agent tokens cannot use the version history.", code: "AGENT_TOKEN_FORBIDDEN" };

// GET /api/mindmaps/:filename/history → the versions saves replaced, newest first (local folder or cloud)
export async function GET(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isAgentTokenIdentity(identity)) return NextResponse.json(AGENT_REFUSED, { status: 403 });
  const { filename } = await params;

  let store: Awaited<ReturnType<typeof getMindmapStorage>>;
  try {
    store = await getMindmapStorage(request, identity);
  } catch (err) {
    return workspaceErrorResponse(err, "Mindmap not found.");
  }

  try {
    const current = await store.read(filename);
    const revisions = await store.history(filename);
    return NextResponse.json({
      source: store.mode === "database" ? "cloud" : "local",
      // Readers see the history of what they may read; restoring is a write.
      canRestore: store.mode === "database" ? store.workspace?.role !== "viewer" : true,
      version: current.storage?.version ?? null,
      revisions,
    });
  } catch (err) {
    console.error("[BloomMD] Mindmap history failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Mindmap not found." }, { status: 404 });
  }
}

// POST /api/mindmaps/:filename/history { revisionId, expectedVersion? } → restore that version
export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isAgentTokenIdentity(identity)) return NextResponse.json(AGENT_REFUSED, { status: 403 });
  try {
    assertSameOriginForIdentity(request, identity);
    const { filename } = await params;
    const store = await getMindmapStorage(request, identity);
    const { revisionId, expectedVersion } = await readJsonBody<{ revisionId?: unknown; expectedVersion?: unknown }>(request, 16 * 1024);
    if (typeof revisionId !== "string" || !revisionId) return NextResponse.json({ error: "revisionId field is required" }, { status: 400 });
    if (expectedVersion !== undefined && !(Number.isInteger(expectedVersion) && (expectedVersion as number) >= 0)) {
      return NextResponse.json({ error: "expectedVersion must be a non-negative integer" }, { status: 400 });
    }
    const current = await store.read(filename);

    if (current.storage?.mode === "database") {
      if (!identity.userId) {
        return NextResponse.json({ error: "Cloud document sync requires an authenticated user.", code: "SYNC_MUTATION_UNAVAILABLE" }, { status: 503 });
      }
      if (store.workspace?.role === "viewer") {
        return NextResponse.json({ error: "This workspace is read-only.", code: "READ_ONLY" }, { status: 403 });
      }
      const markdown = await store.readRevision(filename, revisionId);
      if (markdown === null) return NextResponse.json({ error: "Version not found." }, { status: 404 });
      try {
        // The normal write path: the sync server checks the version, refuses an occupied room and
        // stores the version this replaces as a revision of its own.
        const saved = await writeThroughSyncServer(current.storage.documentId, {
          filename,
          markdown,
          workspaceId: current.storage.workspaceId,
          userId: identity.userId,
          expectedVersion: (expectedVersion as number | undefined) ?? current.storage.version,
        });
        return NextResponse.json({ filePath: saved.filePath, frontmatter: saved.frontmatter, storage: saved.storage });
      } catch (error) {
        if (error instanceof SyncMutationError && error.code === "VERSION_CONFLICT") {
          return NextResponse.json({ error: "Document changed on the server.", code: error.code }, { status: 409 });
        }
        console.warn("[BloomMD] Restoring a cloud version failed:", error instanceof Error ? error.name : "unknown");
        const code = error instanceof SyncMutationError ? error.code : "SYNC_MUTATION_UNAVAILABLE";
        return NextResponse.json({ error: "The version could not be restored through the sync server.", code }, { status: error instanceof SyncMutationError && error.status === 409 ? 409 : 503 });
      }
    }

    try {
      await store.restoreRevision(filename, revisionId);
    } catch (error) {
      if (error instanceof Error && error.message === "BACKUP_NOT_FOUND") return NextResponse.json({ error: "Version not found." }, { status: 404 });
      throw error;
    }
    const restored = await store.read(filename);
    return NextResponse.json({ filePath: restored.filePath, frontmatter: restored.frontmatter, storage: restored.storage });
  } catch (err) {
    return workspaceErrorResponse(err, "The version could not be restored.");
  }
}
