/**
 * The server side of agent rights for a BloomMD cloud workspace: rights, proposals and the change
 * log of an agent token live in the database and are enforced there. This is the client for both
 * sides: the agent asks for its own rights and log, the workspace owner (command line with a
 * personal token) sets rights, reviews proposals and undoes changes.
 */
import type { AgentAccessConfig } from "@bloommd/core/agent-ledger";

export interface CloudOptions {
  url: string;
  token: string;
  workspaceId?: string;
  fetch?: typeof fetch;
}

/** The server refused or failed; `message` already names what to do. */
export class CloudAgentError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "CloudAgentError";
  }
}

export async function cloudRequest(options: CloudOptions, path: string, init: RequestInit = {}): Promise<Response> {
  if (!options.token) throw new Error("BloomMD cloud needs an access token in BLOOMMD_TOKEN.");
  return (options.fetch ?? fetch)(new URL(path, options.url), {
    ...init,
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
      ...(options.workspaceId ? { "X-BloomMD-Workspace-ID": options.workspaceId } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/** The JSON body of a response; a refusal becomes a `CloudAgentError` with the server's message. */
export async function cloudJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) {
    const { error, code, ...details } = body as { error?: string; code?: string } & Record<string, unknown>;
    throw new CloudAgentError(error ?? `${fallback} (${response.status}).`, response.status, code, details);
  }
  return body;
}

export interface CloudAgentToken {
  tokenId: string;
  tokenName: string;
  agentName: string;
  userEmail: string;
  scope: "read" | "write";
  rights: AgentAccessConfig;
  /** Rights were set explicitly (browser or CLI); otherwise the agent only proposes. */
  configured: boolean;
}

export interface CloudProposal {
  id: string;
  tokenId: string;
  agentName: string;
  tool: string;
  filename: string;
  area: string;
  baseVersion: number | null;
  summary: string;
  reason: string | null;
  source: string | null;
  status: "pending" | "approved" | "rejected" | "stale";
  reviewerName: string | null;
  createdAt: string;
  /** The map changed since the proposal was made. */
  stale: boolean;
  changes: Array<{ mark: "+" | "-" | "~"; id: string; title: string; level: number }>;
}

export interface CloudChange {
  id: string;
  tokenId: string;
  agentName: string;
  event: string;
  origin: string;
  tool: string | null;
  filename: string | null;
  area: string;
  proposalId: string | null;
  summary: string | null;
  reason: string | null;
  source: string | null;
  reviewerName: string | null;
  undoable: boolean;
  undoneAt: string | null;
  createdAt: string;
}

/** What the server answers when a proposal is applied. */
export interface CloudApproved {
  applied: string;
  changeId: string;
  path: string;
  reviewer: string;
  overwrote?: number | null;
}

/** An undo restores the map, or (where the agent may only propose) becomes a proposal. */
export type CloudUndone = { undone: string; path: string } | { proposed: string; changeId: string; path: string };

export class CloudAgentApi {
  constructor(private readonly options: CloudOptions) {}

  private get workspace(): string {
    return encodeURIComponent(this.options.workspaceId ?? "personal");
  }

  private async call<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
    return cloudJson<T>(await cloudRequest(this.options, path, init), fallback);
  }

  /** What the calling token may do (the agent's view); `unrestricted` for a person's own token. */
  async selfRights(): Promise<{ agent: string | null; unrestricted: boolean; rights?: AgentAccessConfig }> {
    return this.call("/api/mindmaps/agent-access/rights", "BloomMD cloud could not read the agent rights");
  }

  async selfChanges(limit: number): Promise<CloudChange[]> {
    return (await this.call<{ changes: CloudChange[] }>(`/api/mindmaps/agent-access/changes?limit=${limit}`, "BloomMD cloud could not read the change log")).changes;
  }

  selfUndo(changeId: string): Promise<CloudUndone> {
    return this.call("/api/mindmaps/agent-access/undo", "BloomMD cloud could not undo the change", { method: "POST", body: JSON.stringify({ changeId }) });
  }

  // --- the workspace owner ---------------------------------------------------------------------

  async tokens(): Promise<CloudAgentToken[]> {
    return (await this.call<{ tokens: CloudAgentToken[] }>(`/api/workspaces/${this.workspace}/agent-rights`, "BloomMD cloud could not list the agent tokens")).tokens;
  }

  async setRights(tokenId: string, rights: AgentAccessConfig): Promise<AgentAccessConfig> {
    return (await this.call<{ rights: AgentAccessConfig }>(`/api/workspaces/${this.workspace}/agent-rights`, "BloomMD cloud could not save the rights", { method: "PUT", body: JSON.stringify({ tokenId, access: rights.access, areas: rights.areas ?? {} }) })).rights;
  }

  async proposals(status: "pending" | "all" = "pending"): Promise<CloudProposal[]> {
    return (await this.call<{ proposals: CloudProposal[] }>(`/api/workspaces/${this.workspace}/agent-token-proposals?status=${status}`, "BloomMD cloud could not list the proposals")).proposals;
  }

  approve(id: string, options: { overwrite?: boolean } = {}): Promise<CloudApproved> {
    return this.call(`/api/workspaces/${this.workspace}/agent-token-proposals/${encodeURIComponent(id)}`, "BloomMD cloud could not apply the proposal", { method: "POST", body: JSON.stringify({ action: "approve", overwrite: options.overwrite === true }) });
  }

  reject(id: string, reason?: string): Promise<{ rejected: string; reviewer: string; reason?: string }> {
    return this.call(`/api/workspaces/${this.workspace}/agent-token-proposals/${encodeURIComponent(id)}`, "BloomMD cloud could not reject the proposal", { method: "POST", body: JSON.stringify({ action: "reject", ...(reason ? { reason } : {}) }) });
  }

  async log(options: { tokenId?: string; limit?: number } = {}): Promise<CloudChange[]> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 20), ...(options.tokenId ? { tokenId: options.tokenId } : {}) });
    return (await this.call<{ changes: CloudChange[] }>(`/api/workspaces/${this.workspace}/agent-log?${query}`, "BloomMD cloud could not read the change log")).changes;
  }

  ownerUndo(changeId: string): Promise<CloudUndone> {
    return this.call(`/api/workspaces/${this.workspace}/agent-log/${encodeURIComponent(changeId)}`, "BloomMD cloud could not undo the change", { method: "POST", body: JSON.stringify({ action: "undo" }) });
  }
}
