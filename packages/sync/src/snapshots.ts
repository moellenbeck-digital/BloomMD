import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { parseFile } from "@bloommd/core";

/**
 * Markdown snapshots taken right before a client's offline changes are merged into a room (#261).
 * Each snapshot keeps both starting versions: the room as the server had it (`server.md`) and the
 * state the client brought (`client.md`). Restoring from a snapshot therefore yields both of them.
 *
 * Layout: `<dir>/<room>/<id>/{server.md,client.md,meta.json}`. Written synchronously, because the
 * merge must not start before the snapshot is on disk.
 */

export interface SnapshotMeta {
  id: string;
  roomKey: string;
  filename: string;
  /** Epoch milliseconds the snapshot was taken (arrival of the client's offline changes). */
  at: number;
  /** Device that brought the changes. */
  device: string;
  /** Nodes that were in conflict, empty for a merge without one. */
  conflictNodeIds: string[];
}

export interface SnapshotInput extends Omit<SnapshotMeta, "id"> {
  serverMarkdown: string;
  clientMarkdown: string;
}

export interface SnapshotContent {
  meta: SnapshotMeta;
  server: string;
  client: string;
}

export interface SnapshotStore {
  save(input: SnapshotInput): SnapshotMeta;
  list(roomKey: string): SnapshotMeta[];
  read(roomKey: string, id: string): SnapshotContent | null;
}

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

function roomDirName(roomKey: string): string {
  return encodeURIComponent(roomKey).replace(/%/g, "~");
}

function snapshotId(at: number, existing: Set<string>): string {
  const base = new Date(at).toISOString().replace(/[-:]/g, "").replace(".", "");
  let id = base;
  for (let suffix = 2; existing.has(id); suffix++) id = `${base}-${suffix}`;
  return id;
}

export function createFileSnapshotStore(directory: string): SnapshotStore {
  const root = resolve(directory);
  const roomDir = (roomKey: string) => join(root, roomDirName(roomKey));
  const readIds = (roomKey: string): string[] => {
    try {
      return readdirSync(roomDir(roomKey), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && SAFE_ID.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  };

  return {
    save(input) {
      const id = snapshotId(input.at, new Set(readIds(input.roomKey)));
      const dir = join(roomDir(input.roomKey), id);
      mkdirSync(dir, { recursive: true });
      const meta: SnapshotMeta = {
        id,
        roomKey: input.roomKey,
        filename: input.filename,
        at: input.at,
        device: input.device,
        conflictNodeIds: input.conflictNodeIds,
      };
      writeFileSync(join(dir, "server.md"), input.serverMarkdown);
      writeFileSync(join(dir, "client.md"), input.clientMarkdown);
      writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
      return meta;
    },
    list(roomKey) {
      const metas: SnapshotMeta[] = [];
      for (const id of readIds(roomKey)) {
        try {
          metas.push(JSON.parse(readFileSync(join(roomDir(roomKey), id, "meta.json"), "utf8")) as SnapshotMeta);
        } catch {
          // An incomplete snapshot directory is not listed.
        }
      }
      return metas;
    },
    read(roomKey, id) {
      if (!SAFE_ID.test(id)) return null;
      const dir = join(roomDir(roomKey), id);
      if (!resolve(dir).startsWith(root + sep)) return null;
      try {
        return {
          meta: JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as SnapshotMeta,
          server: readFileSync(join(dir, "server.md"), "utf8"),
          client: readFileSync(join(dir, "client.md"), "utf8"),
        };
      } catch {
        return null;
      }
    },
  };
}

/**
 * Writes both starting versions of a snapshot as ordinary Markdown files next to the original
 * ("Name (Snapshot <id> Server).md", "… Client).md"). Nothing is overwritten: the room and its file
 * stay as they are, the user compares and copies over what is needed.
 */
export function restoreSnapshot(
  store: SnapshotStore,
  roomKey: string,
  id: string,
  targetDir: string,
  baseName: string,
): { server: string; client: string } {
  const content = store.read(roomKey, id);
  if (!content) throw new Error(`Snapshot not found: ${id}`);
  const stem = baseName.replace(/\.(md|markdown)$/i, "");
  const files = {
    server: join(targetDir, `${stem} (Snapshot ${id} Server).md`),
    client: join(targetDir, `${stem} (Snapshot ${id} Client).md`),
  };
  for (const side of ["server", "client"] as const) {
    // Refuse a snapshot that no longer parses rather than writing a broken file.
    parseFile(files[side], content[side]);
    writeFileSync(files[side], content[side], { flag: "wx" });
  }
  return files;
}
