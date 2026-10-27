import { parseFile, serializeToMarkdown } from "@bloommd/core/parser";
import { sanitizeMarkdownFilename } from "@bloommd/core/paths";
import type { MindMapNode } from "@bloommd/core/types";
import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../lib/auth";
import { auditAgentWrite } from "../../../../lib/agent-audit";
import { agentProposalResponse, logAgentChange } from "../../../../lib/agent-access";
import { agentGate, agentReadOnlyResponse, agentWriteRequiredResponse, readAgentMeta } from "../../../../lib/agent-gate";
import { getMindmapStorage } from "../../../../lib/mindmap-storage";
import { assertSameOriginForIdentity, readJsonBody, RequestSecurityError } from "../../../../lib/request-security";
import {
  deleteThroughSyncServer,
  renameThroughSyncServer,
  SyncMutationError,
  writeThroughSyncServer,
} from "../../../../lib/sync-room-status";
import { workspaceErrorResponse } from "../../../../lib/workspace-api";

function serializeNodes(nodes: Map<string, MindMapNode>) {
  return Object.fromEntries(nodes);
}

interface RouteParams {
  params: Promise<{ filename: string }>;
}

// GET /api/mindmaps/:filename → read mindmap as JSON tree
export async function GET(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { filename } = await params;

  let store: Awaited<ReturnType<typeof getMindmapStorage>>;
  try {
    store = await getMindmapStorage(request, identity);
  } catch (err) {
    console.error("[BloomMD] Mindmap workspace resolution failed:", err instanceof Error ? err.name : "unknown");
    return workspaceErrorResponse(err, "Mindmap not found.");
  }

  try {
    const doc = await store.read(filename);
    return NextResponse.json({
      filePath: doc.filePath,
      frontmatter: doc.frontmatter,
      nodes: serializeNodes(doc.nodes),
      rootId: doc.rootId,
      preamble: doc.preamble ?? "",
      storage: doc.storage,
    });
  } catch (err) {
    console.error("[BloomMD] Mindmap read failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Mindmap not found." }, { status: 404 });
  }
}

// PUT /api/mindmaps/:filename → overwrite mindmap with markdown body
export async function PUT(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    assertSameOriginForIdentity(request, identity);
    const { filename } = await params;
    const store = await getMindmapStorage(request, identity);
    const { markdown, expectedVersion, overwrite, agentMeta } = await readJsonBody<{ markdown?: string; expectedVersion?: number; overwrite?: boolean; agentMeta?: unknown }>(request, 11 * 1024 * 1024);
    if (!markdown) return NextResponse.json({ error: "markdown field is required" }, { status: 400 });
    const current = await store.read(filename);
    if (current.storage?.mode === "database") {
      if (!identity.userId) {
        return NextResponse.json({ error: "Cloud document sync requires an authenticated user.", code: "SYNC_MUTATION_UNAVAILABLE" }, { status: 503 });
      }
      // Agent tokens save only within their rights; the stored file name decides the area.
      const gate = await agentGate(identity, current.storage.workspaceId, current.filePath);
      const meta = readAgentMeta(agentMeta);
      if (gate?.access === "read") return agentReadOnlyResponse(gate);
      if (gate?.access === "propose") {
        return agentProposalResponse(gate, { markdown, baseVersion: overwrite ? current.storage.version : expectedVersion ?? current.storage.version, defaultSummary: "Map replaced", meta, defaultTool: "api:update" });
      }
      try {
        const saved = await writeThroughSyncServer(current.storage.documentId, {
          filename,
          markdown,
          workspaceId: current.storage.workspaceId,
          userId: identity.userId,
          expectedVersion: overwrite ? undefined : expectedVersion ?? current.storage.version,
        });
        await auditAgentWrite(identity, saved.storage);
        const changeId = gate ? await logAgentChange(gate, { event: "written", beforeMarkdown: serializeToMarkdown(current), afterVersion: saved.storage?.version, meta, defaultTool: "api:update", defaultSummary: "Map replaced" }).catch((error: unknown) => {
          console.error("[BloomMD] Agent change could not be logged:", error instanceof Error ? error.name : "unknown");
          return undefined;
        }) : undefined;
        return NextResponse.json({
          filePath: saved.filePath,
          frontmatter: saved.frontmatter,
          storage: saved.storage,
          ...(gate ? { mode: "written", changeId } : {}),
        });
      } catch (syncMutationError) {
        if (syncMutationError instanceof SyncMutationError && syncMutationError.code === "VERSION_CONFLICT") {
          throw new Error("VERSION_CONFLICT");
        }
        console.warn("[BloomMD] Sync-server document save failed:", syncMutationError instanceof Error ? syncMutationError.name : "unknown");
        const code = syncMutationError instanceof SyncMutationError ? syncMutationError.code : "SYNC_MUTATION_UNAVAILABLE";
        return NextResponse.json({ error: "Document could not be saved through the sync server.", code }, { status: 503 });
      }
    }
    const doc = parseFile(filename, markdown);
    doc.storage = current.storage;
    // `overwrite` is the "keep mine" branch of the conflict dialog: the user has seen the diff and
    // decided, so the save proceeds against the current version instead of the stale one.
    if (doc.storage && expectedVersion != null && !overwrite) {
      doc.storage = { ...doc.storage, version: expectedVersion };
    }
    const saved = await store.write(doc);

    return NextResponse.json({
      filePath: saved.filePath,
      frontmatter: saved.frontmatter,
      storage: saved.storage,
    });
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    const conflict = err instanceof Error && err.message === "VERSION_CONFLICT";
    if (!conflict) {
      console.error("[BloomMD] Mindmap save failed:", err instanceof Error ? err.name : "unknown");
      return NextResponse.json({ error: "Mindmap could not be saved." }, { status: 500 });
    }
    // A conflict without the other version is a dead end: the user cannot judge what to keep.
    // Returning the server's Markdown lets the client render a diff and offer a real choice.
    try {
      const { filename } = await params;
      const store = await getMindmapStorage(request, identity);
      const server = await store.read(filename);
      return NextResponse.json({
        error: "Document changed on the server.",
        conflict: {
          markdown: serializeToMarkdown(server),
          version: server.storage?.version ?? null,
        },
      }, { status: 409 });
    } catch {
      return NextResponse.json({ error: "Document changed on the server. Reload before saving again." }, { status: 409 });
    }
  }
}

// PATCH /api/mindmaps/:filename → rename mindmap file
export async function PATCH(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    assertSameOriginForIdentity(request, identity);
    const { filename } = await params;
    const store = await getMindmapStorage(request, identity);
    const { newFilename } = await readJsonBody<{ newFilename?: string }>(request, 16 * 1024);
    if (!newFilename) return NextResponse.json({ error: "newFilename field is required" }, { status: 400 });
    const current = await store.read(filename);
    if (current.storage?.mode === "database") {
      if (!identity.userId) {
        return NextResponse.json({ error: "Cloud document sync requires an authenticated user.", code: "SYNC_MUTATION_UNAVAILABLE" }, { status: 503 });
      }
      // A rename can move a map between areas: an agent needs the right to write in both.
      const gate = await agentGate(identity, current.storage.workspaceId, current.filePath);
      const targetGate = gate ? await agentGate(identity, current.storage.workspaceId, sanitizeMarkdownFilename(newFilename)) : null;
      const blocked = [gate, targetGate].find((entry) => entry && entry.access !== "write");
      if (blocked) return agentWriteRequiredResponse(blocked, "renaming a map");
      try {
        const renamed = await renameThroughSyncServer(current.storage.documentId, {
          filename,
          newFilename: sanitizeMarkdownFilename(newFilename),
          workspaceId: current.storage.workspaceId,
          userId: identity.userId,
          expectedVersion: current.storage.version,
        });
        await auditAgentWrite(identity, current.storage, "rename");
        if (gate) {
          await logAgentChange(gate, { event: "renamed", afterVersion: renamed.version, meta: {}, defaultTool: "api:rename", defaultSummary: `Renamed to "${renamed.newFilename}"` }).catch((error: unknown) => {
            console.error("[BloomMD] Agent change could not be logged:", error instanceof Error ? error.name : "unknown");
          });
        }
        return NextResponse.json(renamed);
      } catch (error) {
        if (error instanceof SyncMutationError && error.code === "VERSION_CONFLICT") {
          return NextResponse.json({ error: "Document changed on the server.", code: error.code }, { status: 409 });
        }
        if (error instanceof SyncMutationError && error.code === "DOCUMENT_FILENAME_CONFLICT") {
          return NextResponse.json({ error: "A mindmap with this filename already exists.", code: error.code }, { status: 409 });
        }
        const code = error instanceof SyncMutationError ? error.code : "SYNC_MUTATION_UNAVAILABLE";
        return NextResponse.json({ error: "Mindmap could not be renamed through the sync server.", code }, { status: 503 });
      }
    }
    const renamed = await store.rename(filename, newFilename);
    return NextResponse.json({
      success: true,
      newFilePath: renamed.filename,
      newFilename: renamed.filename,
      ...(renamed.version == null ? {} : { version: renamed.version }),
    });
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof Error && err.message === "DOCUMENT_NAME_CONFLICT") {
      return NextResponse.json({ error: "A mindmap with this filename already exists.", code: "DOCUMENT_NAME_CONFLICT" }, { status: 409 });
    }
    console.error("[BloomMD] Mindmap rename failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Mindmap could not be renamed." }, { status: 500 });
  }
}

// DELETE /api/mindmaps/:filename → delete mindmap file
export async function DELETE(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    assertSameOriginForIdentity(request, identity);
    const { filename } = await params;
    const store = await getMindmapStorage(request, identity);
    const current = await store.read(filename);
    if (current.storage?.mode === "database") {
      if (!identity.userId) {
        return NextResponse.json({ error: "Cloud document sync requires an authenticated user.", code: "SYNC_MUTATION_UNAVAILABLE" }, { status: 503 });
      }
      const gate = await agentGate(identity, current.storage.workspaceId, current.filePath);
      if (gate && gate.access !== "write") return agentWriteRequiredResponse(gate, "deleting a map");
      try {
        await deleteThroughSyncServer(current.storage.documentId, {
          filename,
          workspaceId: current.storage.workspaceId,
          userId: identity.userId,
          expectedVersion: current.storage.version,
        });
        await auditAgentWrite(identity, current.storage, "delete");
        if (gate) {
          await logAgentChange(gate, { event: "deleted", meta: {}, defaultTool: "api:delete", defaultSummary: `Deleted "${current.filePath}"` }).catch((error: unknown) => {
            console.error("[BloomMD] Agent change could not be logged:", error instanceof Error ? error.name : "unknown");
          });
        }
        return NextResponse.json({ deleted: filename });
      } catch (error) {
        if (error instanceof SyncMutationError && error.code === "VERSION_CONFLICT") {
          return NextResponse.json({ error: "Document changed on the server.", code: error.code }, { status: 409 });
        }
        const code = error instanceof SyncMutationError ? error.code : "SYNC_MUTATION_UNAVAILABLE";
        return NextResponse.json({ error: "Mindmap could not be deleted through the sync server.", code }, { status: 503 });
      }
    }
    await store.delete(filename);
    return NextResponse.json({ deleted: filename });
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Mindmap not found." }, { status: 404 });
  }
}
