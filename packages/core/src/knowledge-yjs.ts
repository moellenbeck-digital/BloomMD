/**
 * The knowledge node operations of `knowledge.ts`, applied to a live collaborative document (Yjs)
 * instead of a Markdown string. Used by the sync server so an agent can add and update nodes while
 * people are editing the same map; Yjs merges both.
 */
import type * as Y from "yjs";
import { assertKnowledgeNodeInput, KNOWLEDGE_MAX_NODES_PER_CALL, KnowledgeInputError, knowledgeMetadata, type KnowledgeChange, type KnowledgeNodeInput } from "./knowledge";
import type { MarkdownNodeMetadata } from "./obsidian-markdown";
import { MAX_HEADING_LEVEL, type MindMapNodeMetadata } from "./types";
import { yUpdateContentDiff } from "./yjs-content-sync";
import { yAddNode, yRenameNode, yUpdateNodeMetadata } from "./yjs-operations";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates every input against the current document first (Yjs changes cannot be rolled back),
 * then applies all of them in one transaction. Returns the same shape as `applyKnowledgeNodes`,
 * without Markdown.
 */
export function applyKnowledgeNodesToYDoc(yDoc: Y.Doc, inputs: KnowledgeNodeInput[]): Omit<KnowledgeChange, "markdown"> {
  if (inputs.length > KNOWLEDGE_MAX_NODES_PER_CALL) throw new KnowledgeInputError(`At most ${KNOWLEDGE_MAX_NODES_PER_CALL} nodes per call.`);
  inputs.forEach(assertKnowledgeNodeInput);
  const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");
  const yContents = yDoc.getMap<Y.Text>("nodeContents");
  const rootId = [...yNodes.values()].find((node) => node.get("parentId") === null)?.get("id") as string | undefined;
  if (!rootId) throw new Error("The map has no root heading to add nodes to.");

  // Dry run: levels of existing nodes and of nodes the inputs will create.
  const levels = new Map<string, number>([...yNodes.entries()].map(([id, node]) => [id, node.get("level") as number]));
  const refs = new Set<string>();
  for (const input of inputs) {
    if (input.id && input.ref) throw new Error("A node input has either an id (update) or a ref (create), not both.");
    if (input.due && !DATE_RE.test(input.due)) throw new Error(`Due date must be YYYY-MM-DD, got "${input.due}".`);
    if (input.id) {
      if (!yNodes.has(input.id)) throw new Error(`Node "${input.id}" does not exist in this map.`);
      continue;
    }
    if (!input.title?.trim()) throw new Error("A new node needs a title.");
    const parent = input.parent ?? rootId;
    const parentLevel = levels.get(parent);
    if (parentLevel === undefined) throw new Error(`Unknown node "${parent}": use an existing id or a ref created earlier in this call.`);
    if (parentLevel >= MAX_HEADING_LEVEL) throw new Error("Markdown supports at most six heading levels.");
    if (input.ref) {
      if (refs.has(input.ref)) throw new Error(`The ref "${input.ref}" is used twice.`);
      refs.add(input.ref);
      levels.set(input.ref, parentLevel + 1);
    }
  }
  for (const input of inputs) {
    for (const relation of input.relations ?? []) {
      if (!yNodes.has(relation.target) && !refs.has(relation.target)) throw new Error(`Unknown node "${relation.target}": use an existing id or a ref created earlier in this call.`);
    }
  }

  const ids: Record<string, string> = {};
  const created: string[] = [];
  const updated: string[] = [];
  const inputIds: string[] = [];
  const resolve = (handle: string) => ids[handle] ?? handle;

  yDoc.transact(() => {
    for (const input of inputs) {
      let id: string;
      if (input.id) {
        id = input.id;
        const title = input.title?.trim();
        if (title) yRenameNode(yDoc, id, title);
        updated.push(id);
      } else {
        id = yAddNode(yDoc, resolve(input.parent ?? rootId), input.title!.trim());
        created.push(id);
        if (input.ref) ids[input.ref] = id;
      }
      if (input.id) ids[input.id] = id;
      inputIds.push(id);
      if (input.content !== undefined) {
        const current = (yContents.get(id)?.toString() ?? "").trim();
        const mode = input.contentMode ?? (input.id ? "append" : "replace");
        const next = mode === "append" && current ? `${current}\n\n${input.content.trim()}` : input.content.trim();
        yUpdateContentDiff(yDoc, id, yContents.get(id)?.toString() ?? "", next);
      }
    }
    inputs.forEach((input, index) => {
      const id = inputIds[index]!;
      const current = (yNodes.get(id)?.get("metadata") ?? undefined) as MarkdownNodeMetadata | undefined;
      const next = knowledgeMetadata(input, current ?? undefined, resolve);
      if (JSON.stringify(next ?? null) !== JSON.stringify(current ?? null)) yUpdateNodeMetadata(yDoc, id, next as MindMapNodeMetadata | undefined);
    });
  });
  return { ids, created, updated };
}
