import { parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import type { MindMapDocument, MindMapListEntry } from "@bloommd/core/browser";

export interface RemoteClientConfig {
  baseUrl: string;
  accessToken: string;
}

export interface SyncTicket {
  websocketUrl: string;
  expiresAt: string;
  permission: "read" | "write";
  identity?: { name?: string | null; email?: string | null };
}

/** A failed request to the BloomMD server; `status` 401 means the sign-in is no longer valid. */
export class RemoteRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RemoteRequestError";
  }
}

export class MobileRemoteClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(config: RemoteClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.accessToken = config.accessToken;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  async list(): Promise<MindMapListEntry[]> {
    const response = await fetch(`${this.baseUrl}/api/mindmaps`, { headers: this.headers() });
    if (!response.ok) throw new RemoteRequestError(`Remote list failed (${response.status}).`, response.status);
    return (await response.json() as { files: MindMapListEntry[] }).files;
  }

  async read(filename: string): Promise<MindMapDocument> {
    const response = await fetch(`${this.baseUrl}/api/mindmaps/${encodeURIComponent(filename)}`, { headers: this.headers() });
    if (!response.ok) throw new RemoteRequestError(`Remote read failed (${response.status}).`, response.status);
    const data = await response.json() as {
      filePath: string;
      frontmatter: MindMapDocument["frontmatter"];
      nodes: Record<string, MindMapDocument["nodes"] extends Map<string, infer T> ? T : never>;
      rootId: string;
      preamble?: string;
      storage?: MindMapDocument["storage"];
    };
    return { ...data, nodes: new Map(Object.entries(data.nodes)), rawMarkdown: "" } as MindMapDocument;
  }

  async write(document: MindMapDocument): Promise<MindMapDocument["storage"] | undefined> {
    const filename = document.filePath.split("/").pop() ?? "mindmap.md";
    const response = await fetch(`${this.baseUrl}/api/mindmaps/${encodeURIComponent(filename)}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ markdown: serializeToMarkdown(document), expectedVersion: document.storage?.version }),
    });
    if (!response.ok) throw new Error(response.status === 409 ? "Remote document changed. Reload it before saving." : `Remote save failed (${response.status}).`);
    return (await response.json() as { storage?: MindMapDocument["storage"] }).storage;
  }

  async ticket(filename: string): Promise<SyncTicket> {
    const response = await fetch(`${this.baseUrl}/api/sync-ticket`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ filename }),
    });
    if (!response.ok) throw new RemoteRequestError(`Sync connection failed (${response.status}).`, response.status);
    return response.json() as Promise<SyncTicket>;
  }
}
