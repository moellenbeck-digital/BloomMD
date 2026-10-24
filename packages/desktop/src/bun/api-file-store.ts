import { parseFile, serializeToMarkdown } from "@bloommd/core";
import type { MindMapDocument, MindMapListEntry, MindMapNode } from "@bloommd/core";

export interface ApiFileStoreConfig {
  baseUrl: string;
  accessToken: string;
}

export interface ApiWorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  kind: "personal" | "team";
  role: "owner" | "editor" | "viewer";
}

export interface ApiWorkspaceContext {
  workspace: ApiWorkspaceInfo | null;
  workspaces: ApiWorkspaceInfo[];
}

export class ApiFileStore {
  private baseUrl: string;
  private accessToken: string;
  private activeWorkspace: ApiWorkspaceInfo | null = null;
  private availableWorkspaces: ApiWorkspaceInfo[] = [];

  constructor(config: ApiFileStoreConfig) {
    // Remove trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.accessToken = config.accessToken;
  }

  private headers(options: { includeWorkspace?: boolean } = {}): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`,
    };
    if (options.includeWorkspace && this.activeWorkspace) {
      headers["X-BloomMD-Workspace-ID"] = this.activeWorkspace.id;
    }
    return headers;
  }

  getWorkspaceContext(): ApiWorkspaceContext {
    return {
      workspace: this.activeWorkspace,
      workspaces: [...this.availableWorkspaces],
    };
  }

  async listWorkspaces(): Promise<ApiWorkspaceContext> {
    const params = this.activeWorkspace ? new URLSearchParams({ workspaceId: this.activeWorkspace.id }) : null;
    const endpoint = params ? `${this.baseUrl}/api/workspaces?${params.toString()}` : `${this.baseUrl}/api/workspaces`;
    const res = await fetch(endpoint, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`API workspaces failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      workspace?: ApiWorkspaceInfo | null;
      workspaces?: ApiWorkspaceInfo[];
    };
    const workspaces = data.workspaces ?? [];
    const workspace = data.workspace ?? workspaces.find((entry) => entry.kind === "personal") ?? workspaces[0] ?? null;
    this.availableWorkspaces = workspaces;
    this.activeWorkspace = workspace;
    return this.getWorkspaceContext();
  }

  async selectWorkspace(workspaceId: string): Promise<ApiWorkspaceContext> {
    const params = new URLSearchParams({ workspaceId });
    const res = await fetch(`${this.baseUrl}/api/workspaces?${params.toString()}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`API workspace selection failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      workspace?: ApiWorkspaceInfo | null;
      workspaces?: ApiWorkspaceInfo[];
    };
    if (!data.workspace) throw new Error("API workspace selection returned no workspace.");
    this.availableWorkspaces = data.workspaces ?? this.availableWorkspaces;
    this.activeWorkspace = data.workspace;
    return this.getWorkspaceContext();
  }

  async list(): Promise<MindMapListEntry[]> {
    const res = await fetch(`${this.baseUrl}/api/mindmaps`, {
      headers: this.headers({ includeWorkspace: true }),
    });

    if (!res.ok) {
      throw new Error(`API list failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { files: MindMapListEntry[]; workspace?: ApiWorkspaceInfo | null };
    if (data.workspace) {
      this.activeWorkspace = data.workspace;
      if (!this.availableWorkspaces.some((entry) => entry.id === data.workspace?.id)) {
        this.availableWorkspaces = [...this.availableWorkspaces, data.workspace];
      }
    }
    return data.files;
  }

  async read(filename: string): Promise<MindMapDocument> {
    const res = await fetch(
      `${this.baseUrl}/api/mindmaps/${encodeURIComponent(filename)}`,
      { headers: this.headers({ includeWorkspace: true }) },
    );

    if (!res.ok) {
      throw new Error(`API read failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      filePath: string;
      frontmatter: MindMapDocument["frontmatter"];
      nodes: Record<string, MindMapNode>;
      rootId: string;
      preamble?: string;
      storage?: MindMapDocument["storage"];
    };

    return {
      filePath: data.filePath,
      frontmatter: data.frontmatter,
      nodes: new Map(Object.entries(data.nodes)),
      rootId: data.rootId,
      preamble: data.preamble,
      storage: data.storage,
      rawMarkdown: "",
    };
  }

  async write(doc: MindMapDocument): Promise<void> {
    const markdown = serializeToMarkdown(doc);
    const filename = doc.filePath.split("/").pop() ?? "";

    const res = await fetch(
      `${this.baseUrl}/api/mindmaps/${encodeURIComponent(filename)}`,
      {
        method: "PUT",
        headers: this.headers({ includeWorkspace: true }),
        body: JSON.stringify({ markdown, expectedVersion: doc.storage?.version }),
      },
    );

    if (!res.ok) {
      const payload = await res.json().catch(() => ({})) as { code?: string; error?: string };
      if (payload.code === "SYNC_ROOM_ACTIVE" || payload.code === "SYNC_ROOM_PENDING" || payload.code === "SYNC_ROOM_DEGRADED") throw new Error(payload.code);
      if (payload.code === "SYNC_ROOM_SAVE_FAILED") throw new Error("SYNC_ROOM_SAVE_FAILED");
      if (payload.code === "SYNC_MUTATION_UNAVAILABLE") throw new Error("SYNC_MUTATION_UNAVAILABLE");
      throw new Error(payload.error || `API write failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { storage?: MindMapDocument["storage"] };
    if (data.storage) doc.storage = data.storage;
  }

  async delete(filename: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/mindmaps/${encodeURIComponent(filename)}`,
      {
        method: "DELETE",
        headers: this.headers({ includeWorkspace: true }),
      },
    );

    if (!res.ok) {
      const payload = await res.json().catch(() => null) as { code?: string; error?: string } | null;
      if (payload?.code) throw new Error(payload.code);
      throw new Error(payload?.error || `API delete failed: ${res.status} ${res.statusText}`);
    }
  }

  async rename(
    oldFilename: string,
    newFilename: string,
  ): Promise<{ success: boolean; newFilePath: string; newFilename?: string; version?: number }> {
    if (oldFilename === newFilename) {
      return { success: true, newFilePath: oldFilename, newFilename: oldFilename };
    }

    const res = await fetch(
      `${this.baseUrl}/api/mindmaps/${encodeURIComponent(oldFilename)}`,
      {
        method: "PATCH",
        headers: this.headers({ includeWorkspace: true }),
        body: JSON.stringify({ newFilename }),
      },
    );

    if (!res.ok) {
      let payload: { code?: string; error?: string } = {};
      try {
        payload = await res.json() as { code?: string; error?: string };
      } catch (error: unknown) {
        console.warn("[BloomMD] Rename error response was not JSON:", error);
      }
      if (payload.code === "DOCUMENT_NAME_CONFLICT" || payload.code === "DOCUMENT_FILENAME_CONFLICT") {
        throw new Error("DOCUMENT_NAME_CONFLICT");
      }
      throw new Error(payload.error || `API rename failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      success: boolean;
      newFilePath: string;
      newFilename: string;
      version?: number;
    };

    return { success: data.success, newFilePath: data.newFilePath, newFilename: data.newFilename, version: data.version };
  }

  async create(
    filename: string,
    markdown: string,
  ): Promise<MindMapDocument> {
    const res = await fetch(`${this.baseUrl}/api/mindmaps`, {
      method: "POST",
      headers: this.headers({ includeWorkspace: true }),
      body: JSON.stringify({ filename, markdown }),
    });

    if (!res.ok) {
      throw new Error(`API create failed: ${res.status} ${res.statusText}`);
    }

    const created = (await res.json()) as { filePath: string };
    const createdFilename = created.filePath.split("/").pop() || filename;
    return this.read(createdFilename);
  }

  async fetchSyncUrl(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/config`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`API config failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { syncUrl: string };
    return data.syncUrl;
  }

  async fetchSyncTicket(filename: string): Promise<{
    websocketUrl: string;
    expiresAt: string;
    permission: "read" | "write";
    identity?: { name?: string | null; email?: string | null };
  }> {
    const res = await fetch(`${this.baseUrl}/api/sync-ticket`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ filename, workspaceId: this.activeWorkspace?.id }),
    });
    if (!res.ok) throw new Error(`Sync ticket failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<{
      websocketUrl: string;
      expiresAt: string;
      permission: "read" | "write";
      identity?: { name?: string | null; email?: string | null };
    }>;
  }

  async recordSharedDocumentBinding(action: "bound" | "unbound", documentId: string): Promise<void> {
    if (!this.activeWorkspace) throw new Error("Workspace selection is required.");
    const res = await fetch(`${this.baseUrl}/api/shared-documents/audit`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ action, documentId, workspaceId: this.activeWorkspace.id }),
    });
    if (!res.ok) throw new Error(`Shared document audit failed: ${res.status} ${res.statusText}`);
  }
}
