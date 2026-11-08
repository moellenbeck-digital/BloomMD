import { PlatformError, type PlatformAdapter } from "@bloommd/ui";
import type { MindMapDocument, MindMapListEntry } from "@bloommd/core/browser";
import type { MobileRemoteClient } from "./remote-client";
import type { MobileStore } from "./stores";

/** Read access to whatever the app currently has open: the signed-in cloud, or a local store. */
export interface MobileFileSource {
  list(): Promise<MindMapListEntry[]>;
  read(path: string): Promise<MindMapDocument>;
}

/**
 * Picks the source at call time, so switching the store or signing in is honoured without a new
 * adapter. Local files stay behind `MobileStore` (Capacitor filesystem or the folder plugin); the
 * shared UI never sees a path outside it.
 */
export function mobileFileSource(current: { remote: MobileRemoteClient | null; store: MobileStore }): MobileFileSource {
  const { remote, store } = current;
  if (remote) return { list: () => remote.list(), read: (path) => remote.read(path) };
  return {
    async list() {
      const { entries } = await store.list();
      // A file iCloud has not downloaded yet has no frontmatter to list.
      return entries.flatMap((entry) => (entry.frontmatter ? [{ filename: entry.path, frontmatter: entry.frontmatter }] : []));
    },
    async read(path) {
      return (await store.read(path)).document;
    },
  };
}

function unsupported(operation: string): PlatformError {
  return new PlatformError("unsupported", `${operation} is not available through the shared UI on mobile; the app saves through its own store.`);
}

/**
 * Adapter for the Capacitor shell. The shared components only read here (the link graph of the
 * node panel). Saving, creating, renaming and deleting belong to `NoteSaver` and the store, so
 * those calls fail with a clear `unsupported` error instead of reaching for a `/api` that is not
 * on this origin.
 */
export function createMobilePlatformAdapter(source: () => MobileFileSource): PlatformAdapter {
  return {
    files: {
      list: () => source().list(),
      read: (filename) => source().read(filename),
      create: () => Promise.reject(unsupported("Creating a map")),
      write: () => Promise.reject(unsupported("Saving a map")),
      remove: () => Promise.reject(unsupported("Deleting a map")),
      rename: () => Promise.reject(unsupported("Renaming a map")),
    },
    api: {
      linkPreview: () => Promise.reject(unsupported("The link preview")),
    },
  };
}
