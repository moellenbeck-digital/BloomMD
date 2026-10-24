import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { access, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { FileStore } from "@bloommd/core/file-store";
import { parseFile } from "@bloommd/core/parser";
import { normalizeMarkdownFilename, normalizeMarkdownPath, resolveMarkdownPath } from "@bloommd/core/paths";
import type { MindMapDocument, MindMapListEntry } from "@bloommd/core/types";
import { getApiRequestIdentity, type ApiRequestIdentity } from "./auth";
import { isE2EAuthBypassEnabled } from "./e2e-mode";
import { workspaceForIdentity } from "./token-workspace";
import {
  isDatabaseConfigured,
  listCloudDocuments,
  normalizeUuid,
  readCloudDocument,
  type WorkspaceRecord,
} from "./db";

export interface MindmapStorage {
  mode: "filesystem" | "database";
  workspace?: WorkspaceRecord;
  list(): Promise<MindMapListEntry[]>;
  read(filename: string): Promise<MindMapDocument>;
  write(doc: MindMapDocument): Promise<MindMapDocument>;
  rename(filename: string, newFilename: string): Promise<{ filename: string; version?: number }>;
  delete(filename: string): Promise<void>;
}

function workspaceIdFromRequest(request: Request) {
  const header = request.headers.get("X-BloomMD-Workspace-ID");
  if (header) return header;
  try {
    const queryWorkspace = new URL(request.url).searchParams.get("workspace");
    if (queryWorkspace) return queryWorkspace;
  } catch {
    // Fall through to the context cookie. Membership authorization still happens in the database.
  }
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("bloommd_workspace="));
  return cookie ? decodeURIComponent(cookie.slice("bloommd_workspace=".length)) : null;
}

function filesystemScope(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function createFilesystemStorage(scope?: string): Promise<MindmapStorage> {
  const root = resolve(/* turbopackIgnore: true */ process.cwd(), process.env.BLOOMMD_DIR || "./data");
  const baseDir = scope ? join(root, ".bloommd", "tenants", filesystemScope(scope)) : root;
  await mkdir(baseDir, { recursive: true });
  const store = new FileStore({ baseDir });

  return {
    mode: "filesystem",
    list: () => store.list(),
    read: (filename) => store.read(filename),
    async write(doc) {
      const safeName = normalizeMarkdownPath(doc.filePath || "mindmap.md");
      const scopedPath = resolveMarkdownPath(baseDir, safeName);
      await mkdir(dirname(scopedPath), { recursive: true });
      const scopedDoc = { ...doc, filePath: scopedPath };
      await store.write(scopedDoc);
      return store.read(safeName);
    },
    async rename(filename, newFilename) {
      const safeName = normalizeMarkdownPath(filename);
      const safeNewName = normalizeMarkdownPath(newFilename);
      const oldPath = resolveMarkdownPath(baseDir, safeName);
      const newPath = resolveMarkdownPath(baseDir, safeNewName);
      try {
        await access(newPath);
        throw new Error("DOCUMENT_NAME_CONFLICT");
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "DOCUMENT_NAME_CONFLICT") throw error;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await rename(oldPath, newPath);
      return { filename: safeNewName };
    },
    async delete(filename) {
      await store.delete(filename);
    },
  };
}

async function createDatabaseStorage(userId: string, workspaceId?: string | null): Promise<MindmapStorage> {
  const initial = await listCloudDocuments(userId, workspaceId);
  const workspace = initial.workspace;

  return {
    mode: "database",
    workspace,
    async list() {
      const result = await listCloudDocuments(userId, workspace.id);
      return result.documents.map((document) => ({
        filename: document.filename,
        frontmatter: document.frontmatter as unknown as MindMapListEntry["frontmatter"],
      }));
    },
    async read(filename) {
      const record = await readCloudDocument(userId, normalizeMarkdownFilename(filename), workspace.id);
      if (!record) throw new Error("Document not found.");
      const doc = parseFile(record.filename, record.markdown);
      return {
        ...doc,
        storage: {
          mode: "database",
          documentId: record.id,
          workspaceId: record.workspaceId,
          version: record.version,
          permission: workspace.role === "viewer" ? "read" : "write",
        },
      };
    },
    async write() {
      throw new Error("CLOUD_MUTATION_REQUIRES_SYNC_SERVER");
    },
    async rename() {
      throw new Error("CLOUD_MUTATION_REQUIRES_SYNC_SERVER");
    },
    async delete() {
      throw new Error("CLOUD_MUTATION_REQUIRES_SYNC_SERVER");
    },
  };
}

export async function getMindmapStorage(request: Request, resolvedIdentity?: ApiRequestIdentity): Promise<MindmapStorage> {
  const identity = resolvedIdentity ?? await getApiRequestIdentity(request);
  if (!identity) throw new Error("Unauthorized");
  const userId = identity.userId;
  const workspaceId = workspaceForIdentity(identity, workspaceIdFromRequest(request));
  const cloudDisabled = process.env.BLOOMMD_STORAGE_MODE === "filesystem";

  if (!cloudDisabled && isDatabaseConfigured() && normalizeUuid(userId)) {
    return createDatabaseStorage(userId!, workspaceId);
  }

  // E2E bypass intentionally uses the repository fixtures. Other local password
  // sessions without a database receive isolated filesystem scopes.
  const bypass = isE2EAuthBypassEnabled();
  const scope = userId && !bypass ? `user:${userId}` : identity.filesystemScope;
  return createFilesystemStorage(scope);
}
