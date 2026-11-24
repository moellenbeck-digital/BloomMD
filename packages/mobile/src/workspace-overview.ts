import { buildWorkspaceMindMap, serializeToMarkdown, type MindMapDocument } from "@bloommd/core/browser";
import type { MobileStore } from "./stores";

/** Read only the chosen directory tree. Paths stay relative to the store for opening and creation. */
export async function readMobileOverview(store: MobileStore, folder: string) {
  if (store.kind === "file") throw new Error("A single file has no folder overview.");
  const listing = await store.list();
  const inside = (path: string) => !folder || path.startsWith(`${folder}/`);
  const entries = listing.entries.filter((entry) => inside(entry.path));
  const parsed = new Map<string, MindMapDocument>();
  const unreadable = [...listing.unreadable];
  let cursor = 0;
  // Bound parallel native reads; an unavailable iCloud note must not prevent browsing other files.
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++]!;
      try { parsed.set(entry.path, (await store.read(entry.path)).document); }
      catch (error) { console.error("[BloomMD] Overview could not read note:", entry.path, error); unreadable.push(entry.path); }
    }
  }));
  const document = buildWorkspaceMindMap([...parsed].map(([path, doc]) => ({ path, markdown: serializeToMarkdown(doc) })), {
    title: folder.split("/").at(-1) || store.name,
    source: `mobile-workspace:${store.kind}:${store.name}:${folder}`,
    parsedDocuments: parsed,
    folders: listing.folders.filter((path) => path === folder || inside(path)),
  });
  // The selected directory is the root; do not show it and its ancestors twice.
  if (folder) {
    const chosen = [...document.nodes.values()].find((node) => node.metadata?.kind === "folder" && node.metadata.file === folder);
    if (chosen) {
      const keep = new Set<string>([document.rootId]);
      const visit = (id: string) => { keep.add(id); document.nodes.get(id)?.children.forEach(visit); };
      chosen.children.forEach(visit);
      const root = document.nodes.get(document.rootId)!;
      root.children = [...chosen.children];
      root.metadata = { kind: "workspace", file: folder };
      root.children.forEach((id) => { document.nodes.get(id)!.parentId = root.id; });
      for (const id of document.nodes.keys()) if (!keep.has(id)) document.nodes.delete(id);
      document.references = document.references?.filter((edge) => keep.has(edge.sourceId) && keep.has(edge.targetId));
    }
  }
  return { document, listing, unreadable };
}
