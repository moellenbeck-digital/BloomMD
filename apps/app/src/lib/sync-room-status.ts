export interface SyncRoomStatus {
  active: boolean;
  clients: number;
  isPersisting: boolean;
  hasPendingPersist: boolean;
  degraded: boolean;
  version: number | null;
}

export interface SyncRoomSaveResult {
  filePath: string;
  frontmatter: Record<string, unknown>;
  storage?: {
    mode: "database";
    documentId: string;
    workspaceId: string;
    version: number;
  };
  version: number | null;
}

export class SyncMutationError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "SyncMutationError";
  }
}

type SyncRoomStatusEnv = Record<string, string | undefined>;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function syncHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol === "wss:") url.protocol = "https:";
  if (url.protocol === "ws:") url.protocol = "http:";
  return url;
}

function buildSyncMutationUrl(syncUrl: string, path: string) {
  const url = syncHttpUrl(syncUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  url.search = "";
  return url.toString();
}

interface SyncMutationEnv extends SyncRoomStatusEnv {
  BLOOMMD_SYNC_SECRET?: string;
  /** Server-only override for container/private network access to Sync. */
  BLOOMMD_SYNC_INTERNAL_URL?: string;
}

function internalSyncUrl(env: SyncMutationEnv) {
  return env.BLOOMMD_SYNC_INTERNAL_URL ?? env.NEXT_PUBLIC_SYNC_URL;
}

interface SyncDocumentInput {
  filename: string;
  workspaceId: string;
  userId: string;
  markdown?: string;
  newFilename?: string;
  expectedVersion?: number;
}

interface SyncNodeContentInput extends SyncDocumentInput {
  nodeId: string;
  expectedNodeTitle: string;
  expectedNodeContent: string;
  nextNodeContent: string;
  childNodes?: Array<{
    title: string;
    content: string;
    kind: "task" | "decision";
  }>;
}

async function requestSyncMutation<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  input: SyncDocumentInput,
  env: SyncMutationEnv,
  fetcher: FetchLike,
): Promise<T> {
  const syncUrl = internalSyncUrl(env);
  const secret = env.BLOOMMD_SYNC_SECRET;
  if (!syncUrl || !secret) {
    throw new SyncMutationError("SYNC_MUTATION_UNAVAILABLE", 503, "Sync mutation service is not configured.");
  }
  const response = await fetcher(buildSyncMutationUrl(syncUrl, path), {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { code?: string; error?: string } | null;
    throw new SyncMutationError(
      payload?.code ?? "SYNC_MUTATION_UNAVAILABLE",
      response.status,
      payload?.error ?? `Sync mutation failed with ${response.status}.`,
    );
  }
  return response.json() as Promise<T>;
}

export function buildSyncRoomStatusUrl(syncUrl: string, roomId: string) {
  const url = syncHttpUrl(syncUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/internal/rooms/${encodeURIComponent(roomId)}`;
  url.search = "";
  return url.toString();
}

export async function fetchSyncRoomStatus(
  roomId: string,
  env: SyncRoomStatusEnv = process.env as SyncRoomStatusEnv,
  fetcher: FetchLike = fetch,
): Promise<SyncRoomStatus | null> {
  const syncUrl = internalSyncUrl(env);
  const secret = env.BLOOMMD_SYNC_SECRET;
  if (!syncUrl || !secret) return null;

  const response = await fetcher(buildSyncRoomStatusUrl(syncUrl, roomId), {
    cache: "no-store",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) throw new Error(`Sync room status failed with ${response.status}.`);
  return response.json() as Promise<SyncRoomStatus>;
}

export async function isSyncRoomActive(
  roomId: string,
  env: SyncRoomStatusEnv = process.env as SyncRoomStatusEnv,
  fetcher: FetchLike = fetch,
) {
  const status = await fetchSyncRoomStatus(roomId, env, fetcher);
  return status?.active === true;
}

export async function writeThroughSyncServer(
  documentId: string,
  input: SyncDocumentInput,
  env: SyncMutationEnv = process.env as SyncMutationEnv,
  fetcher: FetchLike = fetch,
): Promise<SyncRoomSaveResult> {
  return requestSyncMutation<SyncRoomSaveResult>(
    `/internal/documents/${encodeURIComponent(documentId)}/snapshot`,
    "PUT",
    input,
    env,
    fetcher,
  );
}

export async function applyNodeContentThroughSyncServer(
  documentId: string,
  input: SyncNodeContentInput,
  env: SyncMutationEnv = process.env as SyncMutationEnv,
  fetcher: FetchLike = fetch,
): Promise<SyncRoomSaveResult> {
  return requestSyncMutation<SyncRoomSaveResult>(
    `/internal/documents/${encodeURIComponent(documentId)}/node-content`,
    "POST",
    input,
    env,
    fetcher,
  );
}

export interface SyncKnowledgeNodesResult {
  filePath: string;
  storage?: SyncRoomSaveResult["storage"];
  version: number | null;
  ids: Record<string, string>;
  created: string[];
  updated: string[];
}

/** Agent node operations, merged into the live document even while it is being edited. */
export async function applyKnowledgeNodesThroughSyncServer(
  documentId: string,
  input: SyncDocumentInput & { nodes: unknown[] },
  env: SyncMutationEnv = process.env as SyncMutationEnv,
  fetcher: FetchLike = fetch,
): Promise<SyncKnowledgeNodesResult> {
  return requestSyncMutation<SyncKnowledgeNodesResult>(
    `/internal/documents/${encodeURIComponent(documentId)}/nodes`,
    "POST",
    input,
    env,
    fetcher,
  );
}

export async function createThroughSyncServer(
  input: SyncDocumentInput,
  env: SyncMutationEnv = process.env as SyncMutationEnv,
  fetcher: FetchLike = fetch,
): Promise<SyncRoomSaveResult> {
  return requestSyncMutation<SyncRoomSaveResult>("/internal/documents", "POST", input, env, fetcher);
}

export async function renameThroughSyncServer(
  documentId: string,
  input: SyncDocumentInput,
  env: SyncMutationEnv = process.env as SyncMutationEnv,
  fetcher: FetchLike = fetch,
): Promise<{ success: true; newFilePath: string; newFilename: string; version: number }> {
  return requestSyncMutation("/internal/documents/" + encodeURIComponent(documentId), "PATCH", input, env, fetcher);
}

export async function deleteThroughSyncServer(
  documentId: string,
  input: SyncDocumentInput,
  env: SyncMutationEnv = process.env as SyncMutationEnv,
  fetcher: FetchLike = fetch,
): Promise<{ deleted: string }> {
  return requestSyncMutation("/internal/documents/" + encodeURIComponent(documentId), "DELETE", input, env, fetcher);
}
