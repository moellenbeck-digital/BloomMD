import { hydrateDocument, PlatformError, type PlatformAdapter, type PlatformErrorCode } from "@bloommd/ui";
import type { BloomMDRPC } from "../shared/rpc-types";

type BunRequests = BloomMDRPC["bun"]["requests"];
type Answer<K extends keyof BunRequests> = Promise<BunRequests[K]["response"]>;

/** The subset of the webview's RPC client the adapter calls; the file system stays in the main process. */
export interface DesktopFileRpc {
  listMindmaps(): Answer<"listMindmaps">;
  openMindmap(filename: string): Answer<"openMindmap">;
  createMindmap(filename: string, markdown: string): Answer<"createMindmap">;
  saveMindmap(filePath: string, markdown: string, storage?: BunRequests["saveMindmap"]["params"]["storage"]): Answer<"saveMindmap">;
  deleteMindmap(filename: string): Answer<"deleteMindmap">;
  renameMindmap(oldFilename: string, newFilename: string): Answer<"renameMindmap">;
  fetchLinkPreview(url: string): Answer<"fetchLinkPreview">;
}

function codeForMessage(message: string | undefined): PlatformErrorCode {
  if (message === "VERSION_CONFLICT") return "conflict";
  if (message && /not found|ENOENT/i.test(message)) return "not-found";
  return "unavailable";
}

async function call<T>(operation: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    if (cause instanceof PlatformError) throw cause;
    throw new PlatformError("unavailable", cause instanceof Error ? cause.message : fallback, { cause });
  }
}

function failed(message: string | undefined, fallback: string): PlatformError {
  return new PlatformError(codeForMessage(message), message || fallback);
}

/**
 * Adapter for the desktop webview: every call is an RPC request to the Bun main process, which
 * owns the folder (or the connected remote). The webview itself never touches the file system.
 */
export function createDesktopPlatformAdapter(rpc: DesktopFileRpc): PlatformAdapter {
  return {
    files: {
      async list() {
        return (await call(() => rpc.listMindmaps(), "Maps could not be listed.")).files;
      },
      async read(filename) {
        return hydrateDocument(await call(() => rpc.openMindmap(filename), "Map could not be loaded."));
      },
      async create(filename, markdown) {
        await call(() => rpc.createMindmap(filename, markdown), "Map could not be created.");
      },
      async write(filename, markdown, options) {
        const saved = await call(() => rpc.saveMindmap(filename, markdown, options?.storage), "Save failed.");
        if (!saved.success) throw failed(saved.error, "Save failed.");
        return saved.storage ? { storage: saved.storage } : {};
      },
      async remove(filename) {
        const result = await call(() => rpc.deleteMindmap(filename), "Map could not be deleted.");
        if (!result.success) throw failed(undefined, "Map could not be deleted.");
      },
      async rename(filename, newFilename) {
        const result = await call(() => rpc.renameMindmap(filename, newFilename), "Map could not be renamed.");
        if (!result.success) throw failed(result.error, "Map could not be renamed.");
        return { filename: result.newFilename ?? newFilename, ...(result.version === undefined ? {} : { version: result.version }) };
      },
    },
    api: {
      async linkPreview(url) {
        const result = await call(() => rpc.fetchLinkPreview(url), "Link preview unavailable.");
        if ("error" in result) throw failed(result.error, "Link preview unavailable.");
        return result.preview;
      },
    },
  };
}
