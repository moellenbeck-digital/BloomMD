/**
 * Literature list of a map, from `citekey` in the frontmatter.
 *
 * A map that stands for a source carries `citekey: <key>` (optional `author`, `year`, `title`). The
 * list of a map is its own entry plus the entries of the maps it links to, one hop and no further.
 * Pure text in, text out: the same function serves the app, the CLI and the agent tools.
 */

import { parseFrontmatter } from "./frontmatter";
import { normalizeMarkdownPath } from "./path-rules";
import { buildWorkspaceGraph, fileNodeId, type WorkspaceFileInput } from "./workspace-graph";

export interface BibliographyEntry {
  citekey: string;
  author?: string;
  year?: string;
  title?: string;
  /** Workspace-relative path of the map the entry comes from. */
  path: string;
}

export interface BibliographySkip {
  path: string;
  reason: string;
}

export interface Bibliography {
  /** Sorted by citekey, one entry per key. */
  entries: BibliographyEntry[];
  /** Maps that were looked at but gave no entry (invalid or doubled key, unreadable frontmatter). */
  skipped: BibliographySkip[];
  bibtex: string;
  markdown: string;
}

/** What BibTeX allows in a key: no whitespace and none of `, { } " # % ' ( ) = \ ~`. */
const CITEKEY_RE = /^[^\s,{}"#%'()=\\~]+$/;

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((entry) => text(entry)).filter((entry): entry is string => Boolean(entry));
    return parts.length > 0 ? parts.join(" and ") : undefined;
  }
  return undefined;
}

/** Reads the citation fields of a frontmatter. `citekey` is the only required one. */
export function readCitation(frontmatter: Record<string, unknown>): Omit<BibliographyEntry, "path"> | null {
  const citekey = text(frontmatter.citekey);
  if (!citekey) return null;
  const author = text(frontmatter.author);
  const year = text(frontmatter.year);
  const title = text(frontmatter.title);
  return {
    citekey,
    ...(author ? { author } : {}),
    ...(year ? { year } : {}),
    ...(title ? { title } : {}),
  };
}

const BIBTEX_ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "%": "\\%",
  "&": "\\&",
  "#": "\\#",
  $: "\\$",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

function bibtexValue(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[\\{}%&#$_~^]/g, (char) => BIBTEX_ESCAPES[char]!);
}

export function formatBibtex(entries: BibliographyEntry[]): string {
  return entries
    .map((entry) => {
      const fields = [
        entry.author ? `  author = {${bibtexValue(entry.author)}}` : null,
        entry.year ? `  year = {${bibtexValue(entry.year)}}` : null,
        entry.title ? `  title = {${bibtexValue(entry.title)}}` : null,
      ].filter((field): field is string => field !== null);
      return fields.length > 0 ? `@misc{${entry.citekey},\n${fields.join(",\n")}\n}` : `@misc{${entry.citekey}}`;
    })
    .join("\n\n")
    .concat(entries.length > 0 ? "\n" : "");
}

/** One line per entry: `- key: Author (Year). Title`; absent parts are left out. */
export function formatBibliographyMarkdown(entries: BibliographyEntry[]): string {
  return entries
    .map((entry) => {
      const who = [entry.author, entry.year ? `(${entry.year})` : null].filter(Boolean).join(" ");
      const detail = [who, entry.title].filter(Boolean).join(". ");
      return detail ? `- ${entry.citekey}: ${detail}` : `- ${entry.citekey}`;
    })
    .join("\n")
    .concat(entries.length > 0 ? "\n" : "");
}

export interface BibliographyOptions {
  /**
   * Frontmatter already parsed by the caller, by path. Used instead of reading it from the text, so
   * a caller that only has a list of maps with their frontmatter (the app) need not load every map.
   */
  frontmatter?: Record<string, Record<string, unknown>>;
}

/**
 * The literature list for the map at `rootPath`.
 *
 * `files` must contain the root and the maps it may link to. The root's own `citekey` comes first
 * in the search, then every map the root links to (resolved like any link in the workspace). The
 * result is sorted by key and holds each key once; when two maps share a key with different
 * contents, the first (by path) wins and the other is reported in `skipped`.
 */
export function buildBibliography(
  rootPath: string,
  files: WorkspaceFileInput[],
  options: BibliographyOptions = {},
): Bibliography {
  const root = normalizeMarkdownPath(rootPath);
  const inputs = files.map((file) => ({ path: normalizeMarkdownPath(file.path), markdown: file.markdown }));
  const byPath = new Map(inputs.map((file) => [file.path, file.markdown]));

  const paths = [root];
  const rootId = fileNodeId(root);
  const graph = buildWorkspaceGraph(inputs);
  const pathById = new Map(graph.nodes.map((node) => [node.id, node.path]));
  const linked = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "reference" || edge.source !== rootId || edge.resolution !== "resolved" || !edge.target) continue;
    const target = pathById.get(edge.target);
    if (target && target !== root) linked.add(target);
  }
  paths.push(...[...linked].sort());

  const entries = new Map<string, BibliographyEntry>();
  const skipped: BibliographySkip[] = [];
  for (const path of paths) {
    const markdown = byPath.get(path);
    if (markdown === undefined) continue;
    let data: Record<string, unknown>;
    try {
      data = options.frontmatter?.[path] ?? parseFrontmatter(markdown).data;
    } catch {
      skipped.push({ path, reason: "Frontmatter nicht lesbar" });
      continue;
    }
    const citation = readCitation(data);
    if (!citation) continue;
    if (!CITEKEY_RE.test(citation.citekey)) {
      skipped.push({ path, reason: `Ungültiger Zitierschlüssel „${citation.citekey}“` });
      continue;
    }
    const entry: BibliographyEntry = { ...citation, path };
    const existing = entries.get(citation.citekey);
    if (!existing) {
      entries.set(citation.citekey, entry);
      continue;
    }
    const same = existing.author === entry.author && existing.year === entry.year && existing.title === entry.title;
    if (!same) skipped.push({ path, reason: `Zitierschlüssel „${citation.citekey}“ kommt schon in ${existing.path} vor` });
  }

  const sorted = [...entries.values()].sort((a, b) => (a.citekey < b.citekey ? -1 : a.citekey > b.citekey ? 1 : 0));
  return {
    entries: sorted,
    skipped,
    bibtex: formatBibtex(sorted),
    markdown: formatBibliographyMarkdown(sorted),
  };
}
