/**
 * Links that point into a PDF: `[[paper.pdf#page=3]]` or `[[paper.pdf#page=3|Label]]`.
 *
 * Such a link is a source reference, not a link to a map or a heading. Treating it like one is what
 * made it fail before: `#page=3` was read as the id of a node inside `paper.pdf`. Everything here is
 * pure text handling, so the editor, the workspace checks and the CLI agree on what a PDF link is.
 */

import { maskCode } from "./code-mask";

export interface PdfLink {
  /** The target exactly as written between the brackets, without label. */
  raw: string;
  /** The PDF path as written, without the `#…` part. */
  file: string;
  /** 1-based page. 1 when the link carries no (valid) `page=` fragment. */
  page: number;
  /** Display text: the part after `|`, else the target. */
  label: string;
  /** 1-based line the link stands on. */
  line: number;
}

/** A PDF link together with the blockquote directly below it. */
export interface PdfCitation {
  link: PdfLink;
  /** Quote text without the `>` markers, lines joined with `\n`. Empty when there is no quote. */
  quote: string;
}

const PDF_EXTENSION_RE = /\.pdf$/i;
const PAGE_RE = /(?:^|[&;])page=(\d+)(?:$|[&;])/i;
const WIKI_LINK_RE = /\\?\[\\?\[([^\]|]+)(?:\|([^\]]+))?\\?\]\\?\]/g;
const QUOTE_LINE_RE = /^\s{0,3}>\s?/;

/** Parses the inside of a wiki link (`file.pdf#page=3`); null when it does not name a PDF. */
export function parsePdfLinkTarget(rawTarget: string, label?: string): Omit<PdfLink, "line"> | null {
  const raw = rawTarget.trim().replace(/\\+$/, "").trim();
  if (!raw) return null;
  const hash = raw.indexOf("#");
  const file = (hash === -1 ? raw : raw.slice(0, hash)).trim();
  if (!file || !PDF_EXTENSION_RE.test(file)) return null;
  const fragment = hash === -1 ? "" : raw.slice(hash + 1);
  const pageMatch = PAGE_RE.exec(fragment);
  const parsed = pageMatch ? Number.parseInt(pageMatch[1]!, 10) : 1;
  const page = Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
  return { raw, file, page, label: label?.trim() || raw };
}

/** Anchor text for a PDF page, the form the links are written in. */
export function formatPdfLink(file: string, page: number, label?: string): string {
  const safePage = Number.isSafeInteger(page) && page >= 1 ? page : 1;
  const target = `${file.trim()}#page=${safePage}`;
  return label?.trim() ? `[[${target}|${label.trim()}]]` : `[[${target}]]`;
}

/** Appends `#page=n` to a URL, replacing an existing fragment. Used for viewers that read it. */
export function pdfPageUrl(url: string, page: number): string {
  const safePage = Number.isSafeInteger(page) && page >= 1 ? page : 1;
  return `${url.split("#", 1)[0]}#page=${safePage}`;
}

/** Every PDF link in a text, in reading order. Links inside code are ignored. */
export function extractPdfLinks(markdown: string): PdfLink[] {
  const links: PdfLink[] = [];
  const lines = maskCode(markdown.replace(/\r\n/g, "\n").split("\n"));
  lines.forEach((line, index) => {
    for (const match of line.matchAll(WIKI_LINK_RE)) {
      const parsed = parsePdfLinkTarget(match[1] ?? "", match[2]);
      if (parsed) links.push({ ...parsed, line: index + 1 });
    }
  });
  return links;
}

/**
 * PDF links with the quote below them.
 *
 * A quote belongs to a link when the first non-blank line after the link's line starts a
 * blockquote; the quote then runs over the consecutive `>` lines. A link without a quote is still
 * returned (empty `quote`). Of several links on one line, only the last one owns the quote.
 */
export function extractPdfCitations(markdown: string): PdfCitation[] {
  const original = markdown.replace(/\r\n/g, "\n").split("\n");
  const links = extractPdfLinks(markdown);
  return links.map((link, position) => {
    const nextOnSameLine = links[position + 1]?.line === link.line;
    if (nextOnSameLine) return { link, quote: "" };
    let cursor = link.line; // 0-based index of the line below the link
    while (cursor < original.length && original[cursor]!.trim() === "") cursor += 1;
    const quoted: string[] = [];
    while (cursor < original.length && QUOTE_LINE_RE.test(original[cursor]!)) {
      quoted.push(original[cursor]!.replace(QUOTE_LINE_RE, ""));
      cursor += 1;
    }
    return { link, quote: quoted.join("\n").trim() };
  });
}

export interface PdfCitationInput {
  file: string;
  page: number | string;
  quote?: string;
}

export type PdfCitationNode =
  | { ok: true; title: string; content: string }
  | { ok: false; error: "file-missing" | "file-not-pdf" | "page-invalid" };

/**
 * Node text for a PDF citation: the link, a blank line, the quote as blockquote.
 *
 * The page must be a whole number ≥ 1 (an empty page field means page 1). The quote is stored as
 * Markdown exactly as typed, one `>` per line, so reading it back through `extractPdfCitations`
 * returns the same text.
 */
export function buildPdfCitationNode(input: PdfCitationInput): PdfCitationNode {
  const file = input.file.trim().replace(/^\.\//, "");
  if (!file) return { ok: false, error: "file-missing" };
  if (!PDF_EXTENSION_RE.test(file) || /[\]|#\n\r]/.test(file)) return { ok: false, error: "file-not-pdf" };
  const pageText = String(input.page).trim();
  if (pageText !== "" && !/^\d+$/.test(pageText)) return { ok: false, error: "page-invalid" };
  const page = pageText === "" ? 1 : Number.parseInt(pageText, 10);
  if (!Number.isSafeInteger(page) || page < 1) return { ok: false, error: "page-invalid" };

  const quote = (input.quote ?? "").replace(/\r\n/g, "\n").trim();
  const quoteBlock = quote
    ? quote.split("\n").map((line) => (line.trim() === "" ? ">" : `> ${line}`)).join("\n")
    : "";
  const name = file.slice(file.lastIndexOf("/") + 1);
  return {
    ok: true,
    title: `${name} · ${page}`,
    content: quoteBlock ? `${formatPdfLink(file, page)}\n\n${quoteBlock}` : formatPdfLink(file, page),
  };
}

/** A PDF link whose file is not (uniquely) in the workspace. */
export interface PdfLinkProblem {
  /** Workspace-relative path of the Markdown file the link is written in. */
  path: string;
  line: number;
  raw: string;
  file: string;
  page: number;
  kind: "missing" | "ambiguous";
  /** Paths of the matching files when `kind` is "ambiguous". */
  candidates: string[];
}

function normalizeSegments(path: string): string | null {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.length === 0 ? null : out.join("/");
}

/**
 * Finds the workspace file a PDF link names, or the reason it cannot.
 *
 * Same order as the app uses when it opens the file: relative to the linking file, then relative to
 * the workspace root, then by (partial) path anywhere in the workspace — which must be unique.
 */
export function resolvePdfResource(
  file: string,
  fromPath: string,
  resources: Iterable<string>,
): { status: "found"; path: string } | { status: "missing" } | { status: "ambiguous"; candidates: string[] } {
  const known = new Set(resources);
  const cleaned = file.trim().replace(/^\.\//, "");
  const folder = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const relative = normalizeSegments(folder ? `${folder}/${cleaned}` : cleaned);
  if (relative && known.has(relative)) return { status: "found", path: relative };
  const fromRoot = normalizeSegments(cleaned);
  if (fromRoot && known.has(fromRoot)) return { status: "found", path: fromRoot };
  if (!fromRoot) return { status: "missing" };
  const suffix = `/${fromRoot}`;
  const candidates = [...known].filter((entry) => entry.endsWith(suffix)).sort();
  if (candidates.length === 1) return { status: "found", path: candidates[0]! };
  return candidates.length > 1 ? { status: "ambiguous", candidates } : { status: "missing" };
}

/**
 * Checks every PDF link of the given Markdown files against the list of workspace files.
 *
 * Only the file is checked: a page number is never a problem here (a PDF's page count is not known
 * to a text-only check). Links to `http(s)` URLs are not workspace files and are skipped.
 */
export function checkPdfLinks(
  files: Array<{ path: string; markdown: string }>,
  resources: Iterable<string>,
): PdfLinkProblem[] {
  const known = [...resources];
  const problems: PdfLinkProblem[] = [];
  for (const source of files) {
    const seen = new Set<string>();
    for (const link of extractPdfLinks(source.markdown)) {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link.file) || link.file.startsWith("//")) continue;
      const key = `${link.line}|${link.file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const resolved = resolvePdfResource(link.file, source.path, known);
      if (resolved.status === "found") continue;
      problems.push({
        path: source.path,
        line: link.line,
        raw: `[[${link.raw}]]`,
        file: link.file,
        page: link.page,
        kind: resolved.status,
        candidates: resolved.status === "ambiguous" ? resolved.candidates : [],
      });
    }
  }
  return problems;
}
