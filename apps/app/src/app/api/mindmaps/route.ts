import { parseFile } from "@bloommd/core/parser";
import { sanitizeMarkdownFilename } from "@bloommd/core/paths";
import type { MindMapDocument, MindMapNode } from "@bloommd/core/types";
import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../lib/auth";
import { auditAgentWrite } from "../../../lib/agent-audit";
import { getMindmapStorage } from "../../../lib/mindmap-storage";
import { assertSameOriginForIdentity, readJsonBody, RequestSecurityError } from "../../../lib/request-security";
import { createThroughSyncServer, SyncMutationError, type SyncRoomSaveResult } from "../../../lib/sync-room-status";
import { workspaceErrorResponse } from "../../../lib/workspace-api";

function serializeNodes(nodes: Map<string, MindMapNode>) {
  return Object.fromEntries(nodes);
}

// GET /api/mindmaps          → list all mindmaps
// GET /api/mindmaps?file=x   → read one mindmap as JSON tree
export async function GET(request: Request) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("file");

  let store: Awaited<ReturnType<typeof getMindmapStorage>>;
  try {
    // Workspace resolution performs the membership check and may reject a stale
    // workspace id before a storage object can be created. Keep that failure in
    // the API boundary so the browser receives a recoverable JSON response
    // instead of a framework-level 500 page.
    store = await getMindmapStorage(request, identity);
  } catch (err) {
    console.error("[BloomMD] Mindmap workspace resolution failed:", err instanceof Error ? err.name : "unknown");
    return workspaceErrorResponse(err, "Mindmaps could not be loaded.");
  }

  try {
    if (filename) {
      const doc = await store.read(filename);
      return NextResponse.json({
        filePath: doc.filePath,
        frontmatter: doc.frontmatter,
        nodes: serializeNodes(doc.nodes),
        rootId: doc.rootId,
        preamble: doc.preamble ?? "",
        storage: doc.storage,
      });
    }

    const files = await store.list();

    return NextResponse.json({
      files,
      storageMode: store.mode,
      workspace: store.workspace ?? null,
    });
  } catch (err) {
    console.error("[BloomMD] Mindmap listing failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json(
      { error: "Mindmaps could not be loaded." },
      { status: 404 },
    );
  }
}

// POST /api/mindmaps  → create new mindmap from markdown body
export async function POST(request: Request) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    assertSameOriginForIdentity(request, identity);
    const store = await getMindmapStorage(request, identity);
    const { filename, markdown } = await readJsonBody<{ filename?: string; markdown?: string }>(request, 11 * 1024 * 1024);
    if (!filename || !markdown) {
      return NextResponse.json({ error: "filename and markdown are required" }, { status: 400 });
    }
    let safeName = sanitizeMarkdownFilename(filename);
    const existing = await store.list();
    if (existing.some((entry) => entry.filename.toLowerCase() === safeName.toLowerCase())) {
      const extension = safeName.toLowerCase().endsWith(".markdown") ? ".markdown" : ".md";
      const stem = safeName.slice(0, -extension.length);
      safeName = `${stem}-${crypto.randomUUID().slice(0, 8)}${extension}`;
    }
    const doc = parseFile(safeName, markdown);
    let saved: MindMapDocument | SyncRoomSaveResult;
    if (store.mode === "database") {
      if (!identity.userId || !store.workspace) {
        return NextResponse.json({ error: "Cloud document sync requires an authenticated user.", code: "SYNC_MUTATION_UNAVAILABLE" }, { status: 503 });
      }
      try {
        saved = await createThroughSyncServer({
          filename: safeName,
          markdown,
          workspaceId: store.workspace.id,
          userId: identity.userId,
        });
      } catch (error) {
        const code = error instanceof SyncMutationError ? error.code : "SYNC_MUTATION_UNAVAILABLE";
        const status = error instanceof SyncMutationError && error.code === "DOCUMENT_FILENAME_CONFLICT" ? 409 : 503;
        return NextResponse.json({ error: "Mindmap could not be created through the sync server.", code }, { status });
      }
    } else {
      saved = await store.write(doc);
    }
    await auditAgentWrite(identity, saved.storage);

    return NextResponse.json(
      { filePath: saved.filePath, frontmatter: saved.frontmatter, storage: saved.storage },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[BloomMD] Mindmap creation failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json(
      { error: "Mindmap could not be created." },
      { status: 500 },
    );
  }
}
