import * as Y from "yjs";
import type { MindMapDocument, MindMapFrontmatter, MindMapNode } from "./types";

/**
 * Convert a MindMapDocument into a Y.Doc.
 *
 * Schema:
 *   meta: Y.Map          – filePath, rootId, preamble, frontmatter (JSON-serialisable object)
 *   nodes: Y.Map<Y.Map>  – per-node scalar props + children Y.Array<string>
 *   nodeContents: Y.Map<Y.Text> – markdown body per node (separate for perf)
 */
export function documentToYDoc(
  doc: MindMapDocument,
  existingDoc?: Y.Doc,
  origin?: unknown,
): Y.Doc {
  const yDoc = existingDoc ?? new Y.Doc();

  const yMeta = yDoc.getMap("meta");
  const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");
  const yNodeContents = yDoc.getMap<Y.Text>("nodeContents");

  yDoc.transact(() => {
    yMeta.clear();
    yNodes.clear();
    yNodeContents.clear();

    // ── Meta ──
    yMeta.set("filePath", doc.filePath);
    yMeta.set("rootId", doc.rootId);
    yMeta.set("preamble", doc.preamble ?? "");
    yMeta.set("storage", doc.storage ? structuredClone(doc.storage) : null);
    yMeta.set("derived", doc.derived ? structuredClone(doc.derived) : null);
    yMeta.set("references", doc.references ? structuredClone(doc.references) : []);
    yMeta.set("frontmatter", structuredClone(doc.frontmatter));

    // ── Nodes ──
    for (const [id, node] of doc.nodes) {
      const yNode = new Y.Map<unknown>();
      yNode.set("id", node.id);
      yNode.set("parentId", node.parentId);
      yNode.set("level", node.level);
      yNode.set("title", node.title);
      yNode.set("metadata", node.metadata ? structuredClone(node.metadata) : null);

      const yChildren = new Y.Array<string>();
      yChildren.push(node.children);
      yNode.set("children", yChildren);

      yNodes.set(id, yNode);

      // ── Content (separate map) ──
      const yContent = new Y.Text();
      if (node.content) {
        yContent.insert(0, node.content);
      }
      yNodeContents.set(id, yContent);
    }
  }, origin);

  return yDoc;
}

/**
 * Reconstruct a MindMapDocument from a Y.Doc.
 */
export function yDocToDocument(yDoc: Y.Doc): MindMapDocument {
  const yMeta = yDoc.getMap("meta");
  const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");
  const yNodeContents = yDoc.getMap<Y.Text>("nodeContents");

  const filePath = (yMeta.get("filePath") as string) ?? "";
  const rootId = (yMeta.get("rootId") as string) ?? "";
  const preamble = (yMeta.get("preamble") as string) ?? "";
  const storage = yMeta.get("storage") as MindMapDocument["storage"] | null | undefined;
  const derived = yMeta.get("derived") as MindMapDocument["derived"] | null | undefined;
  const references = yMeta.get("references") as MindMapDocument["references"] | undefined;
  const frontmatter = (yMeta.get("frontmatter") as MindMapFrontmatter) ?? {
    title: "",
    id: "",
    created: "",
    updated: "",
  };

  const nodes = new Map<string, MindMapNode>();

  yNodes.forEach((yNode, id) => {
    const yChildren = yNode.get("children") as Y.Array<string> | undefined;
    const yContent = yNodeContents.get(id);

    nodes.set(id, {
      id: (yNode.get("id") as string) ?? id,
      parentId: (yNode.get("parentId") as string | null) ?? null,
      level: (yNode.get("level") as number) ?? 1,
      title: (yNode.get("title") as string) ?? "",
      content: yContent?.toString() ?? "",
      children: yChildren?.toArray() ?? [],
      ...((yNode.get("metadata") as MindMapNode["metadata"] | null | undefined)
        ? { metadata: structuredClone(yNode.get("metadata") as NonNullable<MindMapNode["metadata"]>) }
        : {}),
    });
  });

  return {
    filePath,
    frontmatter: structuredClone(frontmatter),
    nodes,
    rootId,
    ...(preamble ? { preamble } : {}),
    ...(storage ? { storage: structuredClone(storage) } : {}),
    ...(references && references.length > 0 ? { references: structuredClone(references) } : {}),
    ...(derived ? { derived: structuredClone(derived) } : {}),
    rawMarkdown: "",
  };
}
