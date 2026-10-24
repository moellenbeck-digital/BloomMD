import type { MindMapDocument } from "@bloommd/core/browser";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

/** Compare persisted content without save timestamps, transport metadata or object key order. */
export function documentContentKey(doc: MindMapDocument): string {
  const { updated: _updated, ...frontmatter } = doc.frontmatter;
  return JSON.stringify(canonical({
    frontmatter,
    rootId: doc.rootId,
    preamble: doc.preamble ?? "",
    nodes: Object.fromEntries(doc.nodes),
  }));
}
