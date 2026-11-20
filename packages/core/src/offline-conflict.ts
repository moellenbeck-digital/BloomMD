import * as Y from "yjs";
import { yDocToDocument } from "./yjs-bridge";
import { yAddNode, yDeleteNode, yRenameNode } from "./yjs-operations";
import { yUpdateContentDiff } from "./yjs-content-sync";
import type { MindMapDocument } from "./types";

/**
 * Conflict rule A for documents that were edited on a client while it was offline (#261).
 *
 * - The server room is the leading side, the client is a replica.
 * - A conflict exists when the same node (title or content) changed on both sides since the
 *   common state (`base`) and the two results differ. It is detected when the client reconnects.
 * - Within the node the state that reached the server last wins. The other state stays as a sibling
 *   node "Konflikt: …" that names the device and the time. Nothing is dropped silently.
 * - Changes that do not overlap are merged by the CRDT without any notice.
 * - The user resolves a conflict by adopting one version or by deleting the copy.
 *
 * Browser-safe: no Node imports.
 */

/** Label of the concept-map relation that links a conflict copy to the node it was made from. */
export const CONFLICT_RELATION_LABEL = "Konflikt";
export const CONFLICT_TITLE_PREFIX = "Konflikt: ";
export const UNKNOWN_DEVICE = "unbekanntes Gerät";

export interface ConflictAuthor {
  device: string;
  /** Epoch milliseconds at which the state reached the server. */
  at: number;
}

export interface NodeConflict {
  nodeId: string;
  /** The state the client brought (it arrived last and stays in the node). */
  local: { title: string; content: string };
  /** The state the server had before the merge (becomes the copy). */
  server: { title: string; content: string };
}

export interface ConflictCopyInfo {
  /** The copy node. */
  id: string;
  /** The node the copy was made from. */
  originalId: string;
  /** Title of the copied version without the "Konflikt: … (Gerät, Zeit)" frame. */
  title: string;
  content: string;
  device: string;
  time: string;
}

/** `2026-11-20 17:25`, always in Europe/Berlin local time. */
export function formatConflictTime(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

export function conflictCopyTitle(title: string, device: string, time: string): string {
  return `${CONFLICT_TITLE_PREFIX}${title} (${device}, ${time})`;
}

const COPY_TITLE = /^Konflikt: ([\s\S]*) \(([^()]*), (\d{4}-\d{2}-\d{2} \d{2}:\d{2})\)$/;

export function parseConflictCopyTitle(title: string): { title: string; device: string; time: string } | null {
  const match = COPY_TITLE.exec(title);
  return match ? { title: match[1]!, device: match[2]!, time: match[3]! } : null;
}

/** All conflict copies of a document, in document order of the nodes map. */
export function listConflictCopies(doc: MindMapDocument): ConflictCopyInfo[] {
  const copies: ConflictCopyInfo[] = [];
  for (const node of doc.nodes.values()) {
    const relation = node.metadata?.relations?.find((entry) => entry.label === CONFLICT_RELATION_LABEL);
    if (!relation) continue;
    const parsed = parseConflictCopyTitle(node.title);
    copies.push({
      id: node.id,
      originalId: relation.target,
      title: parsed?.title ?? node.title.replace(CONFLICT_TITLE_PREFIX, ""),
      content: node.content,
      device: parsed?.device ?? UNKNOWN_DEVICE,
      time: parsed?.time ?? "",
    });
  }
  return copies;
}

/** Adds the copy as the next sibling of the original; below the root for a conflict on the root. */
export function yCreateConflictCopy(
  yDoc: Y.Doc,
  conflict: Pick<NodeConflict, "nodeId" | "server">,
  author: ConflictAuthor,
  origin?: unknown,
): string {
  let copyId = "";
  yDoc.transact(() => {
    const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");
    const original = yNodes.get(conflict.nodeId);
    const parentId = (original?.get("parentId") as string | null | undefined) ?? conflict.nodeId;
    const parent = yNodes.get(parentId);
    const siblings = (parent?.get("children") as Y.Array<string> | undefined)?.toArray() ?? [];
    const position = original?.get("parentId") ? siblings.indexOf(conflict.nodeId) + 1 : undefined;
    copyId = yAddNode(
      yDoc,
      parentId,
      conflictCopyTitle(conflict.server.title, author.device, formatConflictTime(author.at)),
      conflict.server.content,
      position,
      { kind: "topic", relations: [{ target: conflict.nodeId, label: CONFLICT_RELATION_LABEL }] },
    );
  }, origin);
  return copyId;
}

/**
 * Resolves a conflict copy. `adopt` moves the copied version into the original node and removes
 * the copy; `discard` keeps the node as it is and removes the copy. Both leave no copy behind and
 * are the same CRDT operations on every client, so A and B end up with the same result.
 */
export function yResolveConflict(yDoc: Y.Doc, copyId: string, resolution: "adopt" | "discard"): boolean {
  const copy = listConflictCopies(yDocToDocument(yDoc)).find((entry) => entry.id === copyId);
  if (!copy) return false;
  yDoc.transact(() => {
    const original = yDoc.getMap<Y.Map<unknown>>("nodes").get(copy.originalId);
    if (resolution === "adopt" && original) {
      const currentContent = yDoc.getMap<Y.Text>("nodeContents").get(copy.originalId)?.toString() ?? "";
      yRenameNode(yDoc, copy.originalId, copy.title);
      yUpdateContentDiff(yDoc, copy.originalId, currentContent, copy.content);
    }
    yDeleteNode(yDoc, copyId);
  });
  return true;
}

export interface OfflineMergeInput {
  /** Full Yjs state both sides last agreed on; null when the client never synced before. */
  base: Uint8Array | null;
  /** Full Yjs state of the client (base plus the offline changes). */
  local: Uint8Array;
  device: string;
  /** Arrival time at the server, epoch milliseconds. */
  at: number;
  /** Who last changed which node on the server; updated by `commit`. */
  authors?: Map<string, ConflictAuthor>;
}

export interface OfflineMergePlan {
  /** False when the server already contains everything the client brought (repeated delivery). */
  changed: boolean;
  conflicts: NodeConflict[];
  /** Server state before the merge — what the pre-merge snapshot stores. */
  serverDocument: MindMapDocument;
  /** Client state as it arrived. */
  localDocument: MindMapDocument;
  /** Applies the merge to the server doc: CRDT merge, rule A in conflicting nodes, authorship. */
  commit(origin?: unknown): { conflictCopyIds: string[] };
}

function sameState(left: Y.Doc, right: Y.Doc): boolean {
  return Y.equalSnapshots(Y.snapshot(left), Y.snapshot(right));
}

function docFromUpdate(update: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc;
}

/**
 * Compares base, client and server per node and decides, without touching the server doc, whether
 * and what the client brings. Call `commit` to merge; take the snapshot in between.
 */
export function planOfflineMerge(server: Y.Doc, input: OfflineMergeInput): OfflineMergePlan {
  const localY = docFromUpdate(input.local);
  const baseY = input.base ? docFromUpdate(input.base) : null;

  const merged = docFromUpdate(Y.encodeStateAsUpdate(server));
  Y.applyUpdate(merged, input.local);
  const changed = !sameState(merged, server);

  const serverDocument = yDocToDocument(server);
  const localDocument = yDocToDocument(localY);
  const baseDocument = baseY ? yDocToDocument(baseY) : null;

  const localChanged = new Set<string>();
  const conflicts: NodeConflict[] = [];
  if (baseDocument) {
    for (const id of localDocument.nodes.keys()) if (!baseDocument.nodes.has(id)) localChanged.add(id);
    for (const [id, base] of baseDocument.nodes) {
      const local = localDocument.nodes.get(id);
      if (!local || (local.title === base.title && local.content === base.content)) continue;
      localChanged.add(id);
      const current = serverDocument.nodes.get(id);
      if (!current || (current.title === base.title && current.content === base.content)) continue;
      if (current.title === local.title && current.content === local.content) continue;
      conflicts.push({
        nodeId: id,
        local: { title: local.title, content: local.content },
        server: { title: current.title, content: current.content },
      });
    }
  }

  return {
    changed,
    conflicts,
    serverDocument,
    localDocument,
    commit(origin) {
      const conflictCopyIds: string[] = [];
      if (!changed) return { conflictCopyIds };
      const authorOf = (id: string): ConflictAuthor =>
        input.authors?.get(id) ?? { device: UNKNOWN_DEVICE, at: input.at };
      const previousAuthors = new Map(conflicts.map((conflict) => [conflict.nodeId, authorOf(conflict.nodeId)]));

      Y.applyUpdate(server, input.local, origin);
      for (const conflict of conflicts) {
        server.transact(() => {
          const current = yDocToDocument(server).nodes.get(conflict.nodeId);
          if (!current) return; // removed on the way: the delete wins, the copy is not needed
          if (current.title !== conflict.local.title) yRenameNode(server, conflict.nodeId, conflict.local.title);
          yUpdateContentDiff(server, conflict.nodeId, current.content, conflict.local.content);
          conflictCopyIds.push(
            yCreateConflictCopy(server, conflict, previousAuthors.get(conflict.nodeId)!),
          );
        }, origin);
      }
      for (const id of localChanged) input.authors?.set(id, { device: input.device, at: input.at });
      return { conflictCopyIds };
    },
  };
}
