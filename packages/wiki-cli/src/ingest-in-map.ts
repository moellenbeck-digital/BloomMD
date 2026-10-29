/**
 * Planning for `ingest` into an existing map: which section nodes already exist (matched by title,
 * never overwritten), where the new ones go, which relations can be set unambiguously and where the
 * original text is filed as one more source node. Pure: it reads the outline of the target map and
 * returns the nodes for `updateMap`; the service does the reading, rights and writing.
 */
import { KnowledgeInputError, outlineMarkdown, type KnowledgeNodeInput, type KnowledgeNodeView } from "@bloommd/core/knowledge";
import { KNOWLEDGE_TEMPLATES } from "@bloommd/core/knowledge-templates";

/** A title as compared for duplicates: case, punctuation and spacing do not matter. */
export const normalizeKnowledgeTitle = (title: string): string => title.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Ref of the source node an ingest adds; section nodes must not use it. */
export const INGEST_SOURCE_REF = "originaltext";
const SOURCES_TITLE = "Quellen";
const SOURCES_REF = "_ingest_quellen";
const AUTO_REF_PREFIX = "_ingest_n";
const SOURCE_TITLE_MAX = 80;
const WIKILINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;
const FENCE_RE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm;

/** The source was already filed in this map: a source node with the same citation exists. */
export class IngestSourceDuplicateError extends Error {
  constructor(readonly path: string, readonly citation: string, readonly nodeTitle: string) {
    super(`Die Quelle "${citation}" ist in ${path} schon als Knoten "${nodeTitle}" abgelegt. Nichts wurde geschrieben.`);
    this.name = "IngestSourceDuplicateError";
  }
}

export interface InMapPlanInput {
  path: string;
  markdown: string;
  sections: KnowledgeNodeInput[];
  /** `sourceRef, sourceDate` as written into the citation of the source node. */
  citation: string;
  sourceRef: string;
  sourceDate?: string;
}

export interface InMapPlan {
  /** Section nodes (and a "Quellen" node when the map has none) for `applyKnowledgeNodes`; the source node is added by the caller. */
  nodes: KnowledgeNodeInput[];
  /** Where the source node goes: an existing node id or the ref of a node in `nodes`. */
  sourceParent: string;
  sourceTitle: string;
  /** Section nodes that already existed under the same parent; their children hang below them. */
  matched: Array<{ titel: string; id: string }>;
  hinweise: string[];
}

type Target = { kind: "existing"; id: string } | { kind: "new"; ref: string };
const handleOf = (target: Target): string => (target.kind === "existing" ? target.id : target.ref);

/** Skeleton refs of the ingestable templates mapped to the titles their nodes carry (normalized). */
function skeletonTitles(ref: string): Set<string> {
  const titles = new Set<string>();
  for (const template of KNOWLEDGE_TEMPLATES) {
    if (template.id === "learning") continue;
    for (const node of template.skeleton) if (node.ref === ref && node.title) titles.add(normalizeKnowledgeTitle(node.title));
  }
  return titles;
}

/** Link names `[[Name]]`, `[[Name|alias]]`, `[[Name#heading]]` of a text, outside code fences. */
function wikilinks(content: string): string[] {
  const names: string[] = [];
  for (const match of content.replace(FENCE_RE, "").matchAll(WIKILINK_RE)) {
    const name = match[1]!.split(/[|#]/)[0]!.trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export function planIngestInMap(input: InMapPlanInput): InMapPlan {
  const outline = outlineMarkdown(input.markdown);
  if (!outline.rootId) throw new KnowledgeInputError(`Die Map ${input.path} hat keine Überschrift als Wurzel. Nichts wurde geschrieben.`);
  const rootId = outline.rootId;
  const existing = new Map<string, KnowledgeNodeView>(outline.nodes.map((node) => [node.id, node]));
  const childrenOf = (id: string) => outline.nodes.filter((node) => node.parentId === id);

  const sameSource = outline.nodes.find((node) => node.metadata?.kind === "source" && node.metadata.citation?.trim() === input.citation);
  if (sameSource) throw new IngestSourceDuplicateError(input.path, input.citation, sameSource.title);

  const hinweise: string[] = [];
  const nodes: KnowledgeNodeInput[] = [];
  const matched: InMapPlan["matched"] = [];
  const refs = new Map<string, Target>();
  const created: Array<{ index: number; ref: string; title: string }> = [];
  const nodeTitles = (id: string) => existing.get(id)?.title ?? id;

  let sources: Target | undefined;
  const ensureSources = (): Target => {
    if (sources) return sources;
    const found = childrenOf(rootId).filter((node) => normalizeKnowledgeTitle(node.title) === normalizeKnowledgeTitle(SOURCES_TITLE));
    if (found.length > 1) throw new KnowledgeInputError(`In ${input.path} gibt es ${found.length} Knoten „${SOURCES_TITLE}“ unter der Wurzel; die Quelle lässt sich nicht eindeutig zuordnen. Nichts wurde geschrieben.`);
    if (found.length === 1) return (sources = { kind: "existing", id: found[0]!.id });
    nodes.push({ ref: SOURCES_REF, title: SOURCES_TITLE, kind: "source" });
    return (sources = { kind: "new", ref: SOURCES_REF });
  };

  const resolveSkeleton = (handle: string): Target | undefined => {
    const titles = skeletonTitles(handle);
    if (titles.size === 0) return undefined;
    if (handle === "quellen") return ensureSources();
    const inMap = outline.nodes.filter((node) => titles.has(normalizeKnowledgeTitle(node.title)));
    const atRoot = inMap.filter((node) => node.parentId === rootId);
    const found = atRoot.length > 0 ? atRoot : inMap;
    if (found.length === 1) return { kind: "existing", id: found[0]!.id };
    if (found.length > 1) throw new KnowledgeInputError(`Der Skelett-Ref "${handle}" ist in ${input.path} nicht eindeutig (${found.length} Knoten „${found[0]!.title}“); nimm die Knoten-ID als parent. Nichts wurde geschrieben.`);
    return undefined;
  };

  const resolveParent = (handle: string | undefined, title: string): Target => {
    if (handle === undefined || handle === "") return { kind: "existing", id: rootId };
    const known = refs.get(handle);
    if (known) return known;
    if (existing.has(handle)) return { kind: "existing", id: handle };
    const skeleton = resolveSkeleton(handle);
    if (skeleton) return skeleton;
    throw new KnowledgeInputError(`parent "${handle}" von „${title}“ lässt sich in ${input.path} nicht auflösen: weder ein ref aus der Liste (vor dem Knoten), noch eine Knoten-ID der Map, noch ein Skelett-Knoten der Vorlage, der in der Map steht. Nichts wurde geschrieben.`);
  };

  const seenRefs = new Set<string>();
  input.sections.forEach((section, index) => {
    const title = section.title?.trim();
    if (section.id) throw new KnowledgeInputError(`Der Knoten ${index + 1} hat eine id (Änderung eines vorhandenen Knotens); beim Ergänzen einer Map werden vorhandene Knoten nicht verändert. Nichts wurde geschrieben.`);
    if (!title) throw new KnowledgeInputError(`Der Knoten ${index + 1} braucht einen Titel (A new node needs a title). Nichts wurde geschrieben.`);
    if (section.ref) {
      if (seenRefs.has(section.ref)) throw new KnowledgeInputError(`The ref "${section.ref}" is used twice. Nichts wurde geschrieben.`);
      seenRefs.add(section.ref);
    }
    const parent = resolveParent(section.parent, title);
    const same = parent.kind === "existing" ? childrenOf(parent.id).filter((node) => normalizeKnowledgeTitle(node.title) === normalizeKnowledgeTitle(title)) : [];
    if (same.length === 1) {
      const found = same[0]!;
      if (section.ref) refs.set(section.ref, { kind: "existing", id: found.id });
      matched.push({ titel: found.title, id: found.id });
      return;
    }
    if (same.length > 1) hinweise.push(`„${title}“ ist unter „${parent.kind === "existing" ? nodeTitles(parent.id) : "neuem Knoten"}“ mehrdeutig (${same.length} Knoten gleichen Titels): neu angelegt, nichts zugeordnet.`);
    const ref = section.ref ?? `${AUTO_REF_PREFIX}${index}`;
    refs.set(ref, { kind: "new", ref });
    created.push({ index: nodes.length, ref, title });
    nodes.push({ ...section, ref, parent: handleOf(parent) });
  });

  // Titles of the target map and of the new nodes, for relations and [[links]].
  const byTitle = new Map<string, Set<string>>();
  const addTitle = (title: string, handle: string) => {
    const key = normalizeKnowledgeTitle(title);
    byTitle.set(key, (byTitle.get(key) ?? new Set()).add(handle));
  };
  for (const node of outline.nodes) addTitle(node.title, node.id);
  for (const node of created) addTitle(node.title, node.ref);

  for (const { index, ref, title } of created) {
    const node = nodes[index]!;
    const relations: Array<{ target: string; label?: string }> = [];
    const add = (target: string, label?: string) => {
      if (target !== ref && !relations.some((relation) => relation.target === target)) relations.push({ target, ...(label ? { label } : {}) });
    };
    for (const relation of node.relations ?? []) {
      const target = relation.target;
      const direct = refs.get(target) ?? (existing.has(target) ? ({ kind: "existing", id: target } as Target) : undefined);
      if (direct) {
        add(handleOf(direct), relation.label);
        continue;
      }
      const hits = byTitle.get(normalizeKnowledgeTitle(target));
      if (hits?.size === 1) add([...hits][0]!, relation.label);
      else hinweise.push(`Relation von „${title}“ zu „${target}“: ${hits ? `mehrdeutig (${hits.size} Knoten)` : "kein Knoten gefunden"}, nicht verknüpft.`);
    }
    for (const name of wikilinks(node.content ?? "")) {
      const hits = byTitle.get(normalizeKnowledgeTitle(name));
      if (hits?.size === 1) add([...hits][0]!);
      else if (hits && hits.size > 1) hinweise.push(`[[${name}]] in „${title}“ ist mehrdeutig (${hits.size} Knoten gleichen Titels): keine Relation gesetzt.`);
    }
    if (relations.length > 0) node.relations = relations;
    else delete node.relations;
  }

  const sourceParent = ensureSources();
  const taken = new Set([
    ...(sourceParent.kind === "existing" ? childrenOf(sourceParent.id).map((node) => node.title) : []),
    ...nodes.filter((node) => node.parent === handleOf(sourceParent)).map((node) => node.title ?? ""),
  ].map(normalizeKnowledgeTitle));
  const label = input.sourceDate || (input.sourceRef.length > SOURCE_TITLE_MAX ? `${input.sourceRef.slice(0, SOURCE_TITLE_MAX - 1)}…` : input.sourceRef);
  const base = `Originaltext ${label}`;
  let sourceTitle = base;
  for (let suffix = 2; taken.has(normalizeKnowledgeTitle(sourceTitle)); suffix += 1) sourceTitle = `${base} (${suffix})`;

  return { nodes, sourceParent: handleOf(sourceParent), sourceTitle, matched, hinweise };
}
