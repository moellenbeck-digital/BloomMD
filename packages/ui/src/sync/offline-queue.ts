import * as Y from "yjs";

/**
 * Local queue for offline edits (#261).
 *
 * The queue is the document itself: every Yjs update of a shared document is persisted locally
 * (the full state, documents are small), together with `base` — the state both sides last agreed
 * on while connected. Whatever the local state has beyond `base` is the queue; it survives a reload
 * and is handed to the server at the next connect, which merges it (rule A, see
 * `@bloommd/core/offline-conflict`). Sending it again is harmless: the server recognises what it
 * already has.
 */

export interface OfflineRecord {
  /** Full Yjs state of the local document. */
  state: Uint8Array;
  /** Full Yjs state at the last point both sides agreed on; null before the first sync. */
  base: Uint8Array | null;
  savedAt: number;
}

export interface OfflineStorage {
  load(key: string): Promise<OfflineRecord | null>;
  save(key: string, record: OfflineRecord): Promise<void>;
  clear(key: string): Promise<void>;
}

function docFromState(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}

/** True when the local state contains edits the base does not — i.e. there is something to deliver. */
export function hasPendingChanges(state: Uint8Array, base: Uint8Array | null): boolean {
  if (!base) return false;
  return !Y.equalSnapshots(Y.snapshot(docFromState(state)), Y.snapshot(docFromState(base)));
}

/** A persisted record is worth restoring over a freshly loaded document only when it holds queued edits. */
export function hasQueuedEdits(record: OfflineRecord | null): record is OfflineRecord & { base: Uint8Array } {
  return Boolean(record && record.base && hasPendingChanges(record.state, record.base));
}

/** Rebuilds the local document from a record. The returned doc has a fresh client id. */
export function docFromRecord(record: OfflineRecord): Y.Doc {
  return docFromState(record.state);
}

export function createMemoryOfflineStorage(): OfflineStorage & { records: Map<string, OfflineRecord> } {
  const records = new Map<string, OfflineRecord>();
  return {
    records,
    async load(key) {
      return records.get(key) ?? null;
    },
    async save(key, record) {
      records.set(key, { ...record });
    },
    async clear(key) {
      records.delete(key);
    },
  };
}

const DB_NAME = "bloommd-offline";
const STORE_NAME = "documents";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB storage; null where the browser offers none (SSR, tests, some private modes). */
export function createIndexedDbOfflineStorage(factory: IDBFactory | undefined = globalThis.indexedDB): OfflineStorage | null {
  if (!factory) return null;
  let database: Promise<IDBDatabase> | null = null;
  const open = () => {
    database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const opening = factory.open(DB_NAME, 1);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore(STORE_NAME);
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => reject(new Error("OFFLINE_STORAGE_BLOCKED"));
    }).catch((error) => {
      database = null;
      throw error;
    });
    return database;
  };
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE_NAME, mode).objectStore(STORE_NAME);

  return {
    async load(key) {
      const value = (await request((await store("readonly")).get(key))) as OfflineRecord | undefined;
      if (!value?.state) return null;
      return { state: new Uint8Array(value.state), base: value.base ? new Uint8Array(value.base) : null, savedAt: value.savedAt };
    },
    async save(key, record) {
      await request((await store("readwrite")).put(record, key));
    },
    async clear(key) {
      await request((await store("readwrite")).delete(key));
    },
  };
}

const DEVICE_STORAGE_KEY = "bloommd-device-label";

/**
 * The label of this browser/device as shown in conflict copies. A person may set it with
 * `localStorage["bloommd-device-label"]`; otherwise a short stable one is generated.
 */
export function resolveDeviceLabel(storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage): string {
  try {
    const stored = storage?.getItem(DEVICE_STORAGE_KEY)?.trim();
    if (stored) return stored;
    const generated = `Gerät ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    storage?.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    return "Gerät";
  }
}

/** Key of a document's record: the same file in another workspace must not share a queue. */
export function offlineKey(parts: { workspaceId?: string | null; documentId?: string | null; filename: string }): string {
  return `${parts.workspaceId ?? "local"}:${parts.documentId ?? parts.filename}`;
}
