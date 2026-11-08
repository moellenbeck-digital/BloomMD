import type { MindMapListEntry } from "@bloommd/core/browser";
import {
  hydrateDocument,
  PlatformError,
  type LinkPreview,
  type PlatformAdapter,
  type PlatformErrorCode,
  type SerializedMindMapDocument,
} from "./platform-adapter";

export interface WebPlatformAdapterOptions {
  /** Defaults to the global `fetch`, looked up at call time. */
  fetch?: typeof fetch;
  /**
   * Workspace to address explicitly (`?workspace=`). Without it the server falls back to the
   * workspace cookie the web app sets, which is what the shared components relied on before.
   * Read on every call so a workspace switch needs no new adapter.
   */
  workspaceId?: () => string | null | undefined;
}

function codeForStatus(status: number): PlatformErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  return "unavailable";
}

async function failure(response: Response, fallback: string): Promise<PlatformError> {
  let message = `${fallback} (HTTP ${response.status}).`;
  try {
    const parsed = (await response.json()) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error) message = parsed.error;
  } catch {
    // A non-JSON body (proxy error page) carries nothing worth showing; the status says enough.
  }
  return new PlatformError(codeForStatus(response.status), message, { status: response.status });
}

/**
 * Adapter for hosts that serve the BloomMD HTTP API on their own origin: the web app, and the
 * fallback for any host that mounts no `PlatformProvider`.
 */
export function createWebPlatformAdapter(options: WebPlatformAdapterOptions = {}): PlatformAdapter {
  const send = (input: string, init?: RequestInit): Promise<Response> => {
    const impl = options.fetch ?? globalThis.fetch;
    if (!impl) return Promise.reject(new PlatformError("unsupported", "No fetch implementation is available."));
    return impl(input, init).catch((cause: unknown) => {
      throw new PlatformError("unavailable", cause instanceof Error ? cause.message : "Network request failed.", { cause });
    });
  };
  const query = () => {
    const workspaceId = options.workspaceId?.();
    return workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : "";
  };
  const collection = () => `/api/mindmaps${query()}`;
  const item = (filename: string) => `/api/mindmaps/${encodeURIComponent(filename)}${query()}`;
  const json = (body: unknown): RequestInit["body"] => JSON.stringify(body);
  const jsonHeaders = { "Content-Type": "application/json" };

  return {
    files: {
      async list() {
        const response = await send(collection());
        if (!response.ok) throw await failure(response, "Maps could not be listed");
        const data = (await response.json()) as { files?: MindMapListEntry[] };
        return data.files ?? [];
      },
      async read(filename) {
        const response = await send(item(filename));
        if (!response.ok) throw await failure(response, "Map could not be loaded");
        return hydrateDocument((await response.json()) as SerializedMindMapDocument);
      },
      async create(filename, markdown) {
        const response = await send(collection(), { method: "POST", headers: jsonHeaders, body: json({ filename, markdown }) });
        if (!response.ok) throw await failure(response, "Map could not be created");
      },
      async write(filename, markdown, writeOptions) {
        const response = await send(item(filename), {
          method: "PUT",
          headers: jsonHeaders,
          body: json({ markdown, expectedVersion: writeOptions?.storage?.version }),
        });
        if (!response.ok) throw await failure(response, "Save failed");
        const saved = (await response.json()) as { storage?: SerializedMindMapDocument["storage"] };
        return saved.storage ? { storage: saved.storage } : {};
      },
      async remove(filename) {
        const response = await send(item(filename), { method: "DELETE" });
        if (!response.ok) throw await failure(response, "Map could not be deleted");
      },
      async rename(filename, newFilename) {
        const response = await send(item(filename), { method: "PATCH", headers: jsonHeaders, body: json({ newFilename }) });
        if (!response.ok) throw await failure(response, "Map could not be renamed");
        const renamed = (await response.json()) as { newFilename?: string; filename?: string; version?: number };
        return {
          filename: renamed.newFilename ?? renamed.filename ?? newFilename,
          ...(renamed.version === undefined ? {} : { version: renamed.version }),
        };
      },
    },
    api: {
      async linkPreview(url) {
        const response = await send(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw await failure(response, "Link preview unavailable");
        const data = (await response.json().catch(() => ({}))) as { preview?: LinkPreview; error?: string };
        if (!data.preview) throw new PlatformError("unavailable", data.error || "Link preview unavailable.", { status: response.status });
        return data.preview;
      },
    },
  };
}
