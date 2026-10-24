/**
 * Search across a workspace of Markdown files.
 *
 * The Wiki has had search for a while; an ordinary folder had none, so the only way to find
 * something was to know which file it was in. This closes that gap with the same rules, so a vault
 * does not behave differently depending on whether it happens to carry OKF frontmatter.
 *
 * Pure, like the rest: files in, hits out. The same function serves the app, the CLI and the agent
 * tools rather than each growing its own idea of what "matching" means.
 */

import { buildWorkspaceGraph, fileNodeId, type WorkspaceFileInput } from "./workspace-graph";

export interface WorkspaceSearchQuery {
  /** Case-insensitive substring, matched against title, path and body. */
  text?: string;
  /** Restrict to files under this folder, e.g. `Buch/Teil-1`. */
  folder?: string;
  /** Only files that link to this path. */
  linksTo?: string;
  /** Only files linked from this path. */
  linkedFrom?: string;
  limit?: number;
}

export interface WorkspaceSearchHit {
  path: string;
  /** First heading, or the filename when the document has none. */
  title: string;
  /** Which fields matched, so a result can explain why it is in the list. */
  matchedOn: string[];
  score: number;
  /** The line the first body match sits on, for jumping straight there. */
  line: number | null;
  /** A short excerpt around that match. */
  excerpt: string | null;
}

const TITLE_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m;

function titleOf(file: WorkspaceFileInput): string {
  const match = TITLE_RE.exec(file.markdown);
  if (match?.[1]) return match[1].trim();
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
  return name.replace(/\.(md|markdown)$/i, "");
}

/** The first body line containing the needle, with a trimmed excerpt around it. */
function bodyMatch(markdown: string, needle: string): { line: number; excerpt: string } | null {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const position = line.toLowerCase().indexOf(needle);
    if (position === -1) continue;
    const start = Math.max(0, position - 30);
    const excerpt = `${start > 0 ? "…" : ""}${line.slice(start, position + needle.length + 40).trim()}${
      position + needle.length + 40 < line.length ? "…" : ""
    }`;
    return { line: index + 1, excerpt };
  }
  return null;
}

/**
 * Finds files matching a query.
 *
 * Ranking is intentionally obvious — title beats path beats body — for the same reason as in the
 * Wiki search: a score nobody can predict makes it impossible to tell whether something is missing
 * or merely ranked low.
 */
export function searchWorkspace(files: WorkspaceFileInput[], query: WorkspaceSearchQuery): WorkspaceSearchHit[] {
  const needle = query.text?.trim().toLowerCase() ?? "";
  const folder = query.folder?.replace(/\/$/, "");

  // The graph is only built when a link filter asks for it — it reads every file, which is wasted
  // work for a plain text search.
  const graph = query.linksTo || query.linkedFrom ? buildWorkspaceGraph(files) : null;

  let linkFiltered: Set<string> | null = null;
  if (graph) {
    linkFiltered = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.kind !== "reference" || edge.resolution !== "resolved" || !edge.target) continue;
      if (query.linksTo && edge.target === fileNodeId(query.linksTo)) linkFiltered.add(edge.source);
      if (query.linkedFrom && edge.source === fileNodeId(query.linkedFrom)) linkFiltered.add(edge.target);
    }
  }

  const hits: WorkspaceSearchHit[] = [];

  for (const file of files) {
    if (folder && !file.path.startsWith(`${folder}/`)) continue;
    if (linkFiltered && !linkFiltered.has(fileNodeId(file.path))) continue;

    const title = titleOf(file);
    const matchedOn: string[] = [];
    let score = 0;
    let line: number | null = null;
    let excerpt: string | null = null;

    if (needle) {
      if (title.toLowerCase().includes(needle)) {
        matchedOn.push("title");
        score += 100;
      }
      if (file.path.toLowerCase().includes(needle)) {
        matchedOn.push("path");
        score += 40;
      }
      const body = bodyMatch(file.markdown, needle);
      if (body) {
        matchedOn.push("content");
        score += 10;
        line = body.line;
        excerpt = body.excerpt;
      }
      if (matchedOn.length === 0) continue;
    } else {
      // No text: the link or folder filter is the query, and every survivor is a hit.
      matchedOn.push(linkFiltered ? "link" : "folder");
    }

    hits.push({ path: file.path, title, matchedOn, score, line, excerpt });
  }

  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return query.limit ? hits.slice(0, query.limit) : hits;
}

export interface BacklinkEntry {
  path: string;
  title: string;
  /** The line the link sits on. */
  line: number;
  /** The link exactly as written. */
  raw: string;
}

/**
 * Which files link to a given path.
 *
 * Separate from `searchWorkspace` because the answer is different in kind: a search returns files
 * that mention something, this returns the places that point at it — with the line, so the caller
 * can show the link rather than just the file.
 */
export function backlinksFor(files: WorkspaceFileInput[], targetPath: string): BacklinkEntry[] {
  const graph = buildWorkspaceGraph(files);
  const targetId = fileNodeId(targetPath);
  const titleByPath = new Map(files.map((file) => [file.path, titleOf(file)]));
  const pathById = new Map(graph.nodes.map((node) => [node.id, node.path]));

  const entries: BacklinkEntry[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== "reference" || edge.target !== targetId) continue;
    const path = pathById.get(edge.source);
    if (!path) continue;
    entries.push({ path, title: titleByPath.get(path) ?? path, line: edge.line, raw: edge.raw });
  }

  entries.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  return entries;
}
