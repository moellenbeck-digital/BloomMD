/**
 * Area hubs: one entry map per area (Schule, Arbeit, Projekte, Gespräche) that links to the maps of
 * the area. `ingest` keeps it up: it creates the hub when missing and adds one link under the node
 * "Maps" per ingested map. Pure planning here; the service reads, checks rights and writes, so the
 * hub follows the same rights, proposals, log and undo as the map itself.
 */
import { outlineMarkdown, type KnowledgeNodeInput } from "@bloommd/core/knowledge";
import { normalizeKnowledgeTitle } from "./ingest-in-map";

/** Frontmatter `type` that marks a hub; a map that only has the area's name is not one. */
export const HUB_TYPE = "hub";
/** The fixed node of a hub that holds the links. */
export const HUB_MAPS_REF = "maps";
export const HUB_MAPS_TITLE = "Maps";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const WIKILINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;

/** The hub is named after the last segment of its area (`Schule/Mathe` → `Mathe`). */
export function hubTitle(area: string): string {
  return area.split(/\/| › /).map((part) => part.trim()).filter(Boolean).pop() ?? "";
}

/**
 * A map whose title may be that of the hub of `area`: the area's name, with the number `freePath`
 * appends when a map of that name was there first ("Arbeit 2"). A vault lists maps by file name,
 * so this is all the listing tells; `isHubMarkdown` decides after reading.
 */
export function mayBeHub(title: string, area: string): boolean {
  const leaf = normalizeKnowledgeTitle(hubTitle(area));
  return leaf !== "" && normalizeKnowledgeTitle(title).replace(/ \d+$/, "") === leaf;
}

/** `type: hub` in the frontmatter. */
export function isHubMarkdown(markdown: string): boolean {
  const block = FRONTMATTER_RE.exec(markdown)?.[1];
  return block !== undefined && new RegExp(`^type:\\s*["']?${HUB_TYPE}["']?\\s*$`, "m").test(block);
}

export interface HubEntry {
  /** Title of the linked map. */
  title: string;
  /** What `[[…]]` names: the file name of a vault map, the title in a cloud workspace. */
  link: string;
}

/** Nodes of a new hub: the "Maps" node with the first link. */
export function newHubNodes(entry: HubEntry): KnowledgeNodeInput[] {
  return [
    { ref: HUB_MAPS_REF, title: HUB_MAPS_TITLE },
    { parent: HUB_MAPS_REF, title: entry.title, content: `[[${entry.link}]]` },
  ];
}

/**
 * Nodes to add to an existing hub: the link below "Maps" (the node is created when the hub lacks
 * it). Empty when the map is already linked there (same title, or a `[[link]]` to it), so a second
 * ingest into the same map changes nothing.
 */
export function hubEntryNodes(markdown: string, entry: HubEntry): KnowledgeNodeInput[] {
  const outline = outlineMarkdown(markdown);
  const maps = outline.nodes.find((node) => node.parentId === outline.rootId && normalizeKnowledgeTitle(node.title) === normalizeKnowledgeTitle(HUB_MAPS_TITLE));
  if (!maps) return newHubNodes(entry);
  const wanted = new Set([entry.title, entry.link].map(normalizeKnowledgeTitle));
  const linked = outline.nodes
    .filter((node) => node.parentId === maps.id)
    .some((node) => wanted.has(normalizeKnowledgeTitle(node.title)) || [...node.content.matchAll(WIKILINK_RE)].some((match) => wanted.has(normalizeKnowledgeTitle(match[1]!.split(/[|#]/)[0]!))));
  return linked ? [] : [{ parent: maps.id, title: entry.title, content: `[[${entry.link}]]` }];
}
