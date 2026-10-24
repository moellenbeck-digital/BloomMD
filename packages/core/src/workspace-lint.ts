/**
 * Findings about a workspace, as data rather than as a rendered report.
 *
 * One implementation feeds the CLI, the app panel and the agent tools. That is the point: a rule
 * that only exists in the GUI cannot run in CI, and a rule reimplemented per surface drifts until
 * the three disagree about whether a vault is healthy.
 *
 * Everything here is pure — paths and text in, findings out. No filesystem, so the same checks run
 * in the browser against an opened folder and on a server against a checked-out repository.
 */

import { diffLines } from "./diff";
import { parseFile, serializeToMarkdown } from "./parser";
import { buildWorkspaceGraph, type WorkspaceFileInput } from "./workspace-graph";

export type LintSeverity = "error" | "warning" | "info";

export type LintCode =
  /** A link points at a page that does not exist. */
  | "broken-link"
  /** A bare name matches several pages, so the target is undecidable. */
  | "ambiguous-link"
  /** Nothing links to this page and it links nowhere. */
  | "orphan-page"
  /** Two pages share a filename, which makes bare links to either of them ambiguous. */
  | "duplicate-name"
  /** Saving this file through BloomMD would change content it should have preserved. */
  | "roundtrip-unsafe"
  /** Saving would rewrite the file without changing what it says, e.g. Setext to ATX headings. */
  | "roundtrip-normalizes";

export interface LintFinding {
  code: LintCode;
  severity: LintSeverity;
  /** Workspace-relative path of the file the finding belongs to. */
  path: string;
  /** 1-based line, when the finding has one. */
  line: number | null;
  message: string;
  /** Extra context: candidate paths, a diff excerpt, the offending text. */
  detail: string | null;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  infos: number;
  filesChecked: number;
}

export interface LintResult {
  findings: LintFinding[];
  summary: LintSummary;
}

export interface LintOptions {
  /**
   * Include orphan pages. Off by default: a fresh vault is nothing but orphans, and a check that
   * shouts on day one gets ignored by day two.
   */
  reportOrphans?: boolean;
  /**
   * Run the round-trip check. It parses and re-serialises every file, so it costs more than the
   * link checks and is opt-in for that reason alone — its findings are the most serious ones here.
   */
  checkRoundtrip?: boolean;
}

/** Node id comments BloomMD adds on save. Their presence is expected and not a change. */
const ID_COMMENT = /\s*<!--\s*bloommd:(id|meta)=[^>]*-->/g;

/**
 * Compares a document against what saving it would produce.
 *
 * Three differences are expected and stripped before comparing: the `bloommd:id` comments, the
 * frontmatter block BloomMD maintains, and trailing whitespace. Everything else surviving is the
 * promise the product makes, so anything left over is an error rather than a note.
 */
function normalizeForComparison(markdown: string): string {
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(ID_COMMENT, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Locates the first real change.
 *
 * Uses the LCS diff rather than comparing line N to line N: once a single line is inserted or
 * removed, a positional comparison reports every following line as different and points at the
 * wrong place. A checker that misidentifies the line is worse than one that only says "something
 * changed", because it sends the reader to look at innocent text.
 */
function firstDifference(before: string, after: string): { line: number; before: string; after: string } | null {
  const changes = diffLines(before, after).filter((line) => line.kind !== "equal");
  if (changes.length === 0) return null;

  const removed = changes.find((line) => line.kind === "removed");
  const added = changes.find((line) => line.kind === "added");
  return {
    line: removed?.beforeLine ?? added?.afterLine ?? 1,
    before: removed?.text ?? "(nichts)",
    after: added?.text ?? "(entfernt)",
  };
}

/**
 * Compares the meaning of two documents rather than their spelling.
 *
 * Two files say the same thing when their heading tree and the text under each heading match. That
 * is BloomMD's own model of a document, which makes it the honest yardstick: if the model is
 * identical, nothing was lost, whatever the bytes look like.
 */
function sameMeaning(before: string, after: string, path: string): boolean {
  try {
    const a = parseFile(path, before);
    const b = parseFile(path, after);
    if (a.nodes.size !== b.nodes.size) return false;

    const shape = (document: ReturnType<typeof parseFile>) =>
      [...document.nodes.values()]
        .map((node) => `${node.level}|${node.title.trim()}|${node.content.replace(/\s+/g, " ").trim()}`)
        .sort();

    const first = shape(a);
    const second = shape(b);
    return first.length === second.length && first.every((entry, index) => entry === second[index]);
  } catch {
    return false;
  }
}

/**
 * Checks that BloomMD would give the file back unchanged.
 *
 * Separates two very different outcomes. A file whose meaning survives but whose spelling changes —
 * a Setext heading written back as ATX, say — is a normalisation: worth knowing before a commit
 * shows an unexpected diff, but nothing is lost. A file whose meaning changes is the serious case,
 * and the one that would have caught the serializer escaping every wiki link and checkbox before it
 * reached a real vault.
 *
 * Reporting both as errors would make the check noisy on any vault using Setext headings, and a
 * noisy check is one people learn to skip.
 */
export function checkRoundtrip(file: WorkspaceFileInput): LintFinding | null {
  let serialized: string;
  try {
    serialized = serializeToMarkdown(parseFile(file.path, file.markdown));
  } catch (error) {
    return {
      code: "roundtrip-unsafe",
      severity: "error",
      path: file.path,
      line: null,
      message: "Datei kann nicht gelesen werden.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const before = normalizeForComparison(file.markdown);
  const after = normalizeForComparison(serialized);
  if (before === after) return null;

  const difference = firstDifference(before, after);
  const detail = difference ? `vorher:  ${difference.before}\nnachher: ${difference.after}` : null;
  const preserved = sameMeaning(file.markdown, serialized, file.path);

  return {
    code: preserved ? "roundtrip-normalizes" : "roundtrip-unsafe",
    severity: preserved ? "warning" : "error",
    path: file.path,
    line: difference?.line ?? null,
    message: preserved
      ? "Speichern schreibt die Datei um, ohne den Inhalt zu ändern."
      : "Speichern würde den Inhalt dieser Datei verändern.",
    detail,
  };
}

/**
 * Runs every enabled check over a workspace.
 *
 * Findings are sorted by severity and then by path, so the output is stable across runs — a report
 * that reshuffles itself is impossible to diff between two commits.
 */
export function lintWorkspace(files: WorkspaceFileInput[], options: LintOptions = {}): LintResult {
  const graph = buildWorkspaceGraph(files);
  const findings: LintFinding[] = [];

  const nameCounts = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.kind !== "file") continue;
    const key = node.label.toLowerCase();
    const bucket = nameCounts.get(key);
    if (bucket) bucket.push(node.path);
    else nameCounts.set(key, [node.path]);
  }

  const pathOf = new Map(graph.nodes.map((node) => [node.id, node.path]));
  const hasOutgoing = new Set<string>();
  const hasIncoming = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.kind !== "reference") continue;
    const path = pathOf.get(edge.source) ?? edge.source;

    if (edge.resolution === "resolved") {
      hasOutgoing.add(edge.source);
      if (edge.target) hasIncoming.add(edge.target);
      continue;
    }

    if (edge.resolution === "broken") {
      findings.push({
        code: "broken-link",
        severity: "error",
        path,
        line: edge.line,
        message: `Verweis ohne Ziel: ${edge.raw}`,
        detail: null,
      });
    } else {
      findings.push({
        code: "ambiguous-link",
        severity: "warning",
        path,
        line: edge.line,
        message: `Mehrdeutiger Verweis: ${edge.raw}`,
        detail: edge.candidates ? `Mögliche Ziele: ${edge.candidates.join(", ")}` : null,
      });
    }
  }

  for (const [name, paths] of nameCounts) {
    if (paths.length < 2) continue;
    findings.push({
      code: "duplicate-name",
      severity: "info",
      path: paths[0]!,
      line: null,
      message: `Der Name „${name}" kommt ${paths.length}× vor — kurze Verweise darauf sind mehrdeutig.`,
      detail: paths.join(", "),
    });
  }

  if (options.reportOrphans) {
    for (const node of graph.nodes) {
      if (node.kind !== "file") continue;
      if (hasIncoming.has(node.id) || hasOutgoing.has(node.id)) continue;
      findings.push({
        code: "orphan-page",
        severity: "info",
        path: node.path,
        line: null,
        message: "Keine Verweise hin oder weg.",
        detail: null,
      });
    }
  }

  if (options.checkRoundtrip) {
    for (const file of files) {
      const finding = checkRoundtrip(file);
      if (finding) findings.push(finding);
    }
  }

  const order: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort(
    (a, b) => order[a.severity] - order[b.severity] || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0),
  );

  return {
    findings,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      infos: findings.filter((finding) => finding.severity === "info").length,
      filesChecked: files.length,
    },
  };
}
