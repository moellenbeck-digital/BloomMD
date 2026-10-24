/**
 * Browser-safe client for the narrow Workspace API surface required by a shared local document.
 *
 * It deliberately accepts only a cloud filename. A native client must keep its local path in its
 * own binding registry; sending it here would accidentally disclose a user's filesystem layout.
 */
export interface WorkspaceSyncClientConfig {
  baseUrl: string;
  accessToken: string;
  fetchImpl?: WorkspaceSyncFetch;
}

export type WorkspaceSyncFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface WorkspaceSyncWorkspace {
  id: string;
  name: string;
  slug: string;
  kind: "personal" | "team";
  role: "owner" | "editor" | "viewer";
}

export interface WorkspaceSyncContext {
  workspace: WorkspaceSyncWorkspace | null;
  workspaces: WorkspaceSyncWorkspace[];
}

export interface WorkspaceSyncCreatedDocument {
  documentId: string;
  cloudVersion: number;
}

/** A cloud document that can be explicitly bound to one local Markdown file. */
export interface WorkspaceSyncDocument {
  filename: string;
}

export interface WorkspaceSyncExistingDocument extends WorkspaceSyncDocument {
  documentId: string;
  cloudVersion: number;
}

export interface WorkspaceSyncTicket {
  websocketUrl: string;
  expiresAt: string;
  permission: "read" | "write";
  identity?: { name?: string | null; email?: string | null };
}

export class WorkspaceSyncClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: WorkspaceSyncFetch;
  private activeWorkspace: WorkspaceSyncWorkspace | null = null;
  private availableWorkspaces: WorkspaceSyncWorkspace[] = [];

  constructor(config: WorkspaceSyncClientConfig) {
    this.baseUrl = requireBaseUrl(config.baseUrl);
    this.accessToken = requireText(config.accessToken, "accessToken");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  getWorkspaceContext(): WorkspaceSyncContext {
    return { workspace: this.activeWorkspace, workspaces: [...this.availableWorkspaces] };
  }

  async listWorkspaces(): Promise<WorkspaceSyncContext> {
    return this.loadWorkspaceContext();
  }

  async selectWorkspace(workspaceId: string): Promise<WorkspaceSyncContext> {
    return this.loadWorkspaceContext(requireText(workspaceId, "workspaceId"));
  }

  async createDocument(filename: string, markdown: string): Promise<WorkspaceSyncCreatedDocument> {
    const selectedWorkspace = this.activeWorkspace;
    if (!selectedWorkspace) throw new Error("WORKSPACE_NOT_SELECTED");
    if (selectedWorkspace.role === "viewer") throw new Error("WORKSPACE_READ_ONLY");
    const response = await this.fetchImpl(`${this.baseUrl}/api/mindmaps`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ filename: requireText(filename, "filename"), markdown }),
    });
    if (!response.ok) throw await apiError(response, "DOCUMENT_CREATE_FAILED");
    const created = await response.json() as { filePath?: unknown };
    const cloudFilename = typeof created.filePath === "string" ? created.filePath.split("/").pop() : null;
    if (!cloudFilename) throw new Error("CLOUD_DOCUMENT_FILENAME_MISSING");

    const document = await this.fetchDocument(cloudFilename);
    return {
      // `frontmatter.id` belongs to the Markdown document and is not constrained
      // to a UUID. Collaboration audits must use bloom_documents.id instead.
      documentId: requireText(document.storage?.documentId, "documentId"),
      cloudVersion: typeof document.storage?.version === "number" ? document.storage.version : 0,
    };
  }

  /**
   * Lists only cloud-side filenames in the selected workspace. Native clients keep their local
   * path separately and must never send it to this API.
   */
  async listDocuments(): Promise<WorkspaceSyncDocument[]> {
    if (!this.activeWorkspace) throw new Error("WORKSPACE_NOT_SELECTED");
    const response = await this.fetchImpl(`${this.baseUrl}/api/mindmaps`, {
      headers: this.headers(true),
    });
    if (!response.ok) throw await apiError(response, "DOCUMENT_LIST_FAILED");
    const payload = await response.json() as { files?: unknown };
    if (!Array.isArray(payload.files)) throw new Error("DOCUMENT_LIST_INVALID");
    return payload.files.flatMap((entry): WorkspaceSyncDocument[] => {
      if (!entry || typeof entry !== "object") return [];
      const filename = (entry as { filename?: unknown }).filename;
      return typeof filename === "string" && filename.trim() ? [{ filename: filename.trim() }] : [];
    });
  }

  /**
   * Resolves the server-authoritative identity/version before binding an existing cloud file.
   * This intentionally reads by cloud filename only; no native filesystem identity leaves the
   * client.
   */
  async getExistingDocument(filename: string): Promise<WorkspaceSyncExistingDocument> {
    if (!this.activeWorkspace) throw new Error("WORKSPACE_NOT_SELECTED");
    const cloudFilename = requireText(filename, "filename");
    const document = await this.fetchDocument(cloudFilename);
    return {
      filename: cloudFilename,
      documentId: requireText(document.storage?.documentId, "documentId"),
      cloudVersion: typeof document.storage?.version === "number" ? document.storage.version : 0,
    };
  }

  async fetchSyncTicket(filename: string): Promise<WorkspaceSyncTicket> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/sync-ticket`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ filename: requireText(filename, "filename"), workspaceId: this.activeWorkspace?.id }),
    });
    if (!response.ok) throw await apiError(response, "SYNC_TICKET_FAILED");
    const ticket = await response.json() as Partial<WorkspaceSyncTicket>;
    const permission = ticket.permission;
    if (permission !== "read" && permission !== "write") throw new Error("SYNC_TICKET_PERMISSION_INVALID");
    return {
      websocketUrl: requireText(ticket.websocketUrl, "websocketUrl"),
      expiresAt: requireText(ticket.expiresAt, "expiresAt"),
      permission,
      ...(ticket.identity ? { identity: ticket.identity } : {}),
    };
  }

  /**
   * Audit an explicit local binding decision. This intentionally transmits only cloud IDs and
   * never a local filesystem path or local Markdown.
   */
  async recordSharedDocumentBinding(action: "bound" | "unbound", documentId: string): Promise<void> {
    const selectedWorkspace = this.activeWorkspace;
    if (!selectedWorkspace) throw new Error("WORKSPACE_NOT_SELECTED");
    const response = await this.fetchImpl(`${this.baseUrl}/api/shared-documents/audit`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ action, documentId: requireText(documentId, "documentId"), workspaceId: selectedWorkspace.id }),
    });
    if (!response.ok) throw await apiError(response, "SHARED_DOCUMENT_AUDIT_FAILED");
  }

  private async loadWorkspaceContext(workspaceId?: string): Promise<WorkspaceSyncContext> {
    const query = workspaceId ? `?${new URLSearchParams({ workspaceId }).toString()}` : "";
    const response = await this.fetchImpl(`${this.baseUrl}/api/workspaces${query}`, { headers: this.headers() });
    if (!response.ok) throw await apiError(response, "WORKSPACE_LIST_FAILED");
    const payload = await response.json() as { workspace?: WorkspaceSyncWorkspace | null; workspaces?: WorkspaceSyncWorkspace[] };
    const workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
    const workspace = payload.workspace ?? workspaces.find((entry) => entry.kind === "personal") ?? workspaces[0] ?? null;
    this.availableWorkspaces = workspaces;
    this.activeWorkspace = workspace;
    return this.getWorkspaceContext();
  }

  private async fetchDocument(filename: string): Promise<{ storage?: { documentId?: unknown; version?: unknown } }> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/mindmaps/${encodeURIComponent(filename)}`, {
      headers: this.headers(true),
    });
    if (!response.ok) throw await apiError(response, "DOCUMENT_READ_FAILED");
    return response.json() as Promise<{ storage?: { documentId?: unknown; version?: unknown } }>;
  }

  private headers(includeWorkspace = false): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`,
    };
    if (includeWorkspace && this.activeWorkspace) headers["X-BloomMD-Workspace-ID"] = this.activeWorkspace.id;
    return headers;
  }
}

async function apiError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => null) as { code?: unknown; error?: unknown } | null;
  if (typeof payload?.code === "string") return new Error(payload.code);
  if (typeof payload?.error === "string") return new Error(payload.error);
  return new Error(`${fallback}:${response.status}`);
}

function requireBaseUrl(value: string): string {
  const normalized = requireText(value, "baseUrl").replace(/\/+$/u, "");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    throw new Error("baseUrl must be an HTTP(S) URL.");
  }
  return normalized;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value.trim();
}
