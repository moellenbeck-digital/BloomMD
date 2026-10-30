import type { LintFinding, LintSeverity, WorkspaceIndex } from "@bloommd/core";

/** What the formatters need of a result; `LintResult` and the workspace index both fit. */
export interface FindingsReport {
  findings: Array<Pick<LintFinding, "severity" | "path" | "line" | "message" | "detail">>;
  summary: { errors: number; warnings: number; infos: number; filesChecked: number };
}

/**
 * Turns findings into something a person or a CI log can read.
 *
 * Colour is applied only when the output is a terminal. Escape codes in a CI log are noise, and a
 * report that is unreadable in the place it usually runs is not a report.
 */

const isTty = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

const COLOUR: Record<LintSeverity, string> = {
  error: "[31m",
  warning: "[33m",
  info: "[36m",
};
const RESET = "[0m";
const DIM = "[2m";

const LABEL: Record<LintSeverity, string> = {
  error: "Fehler",
  warning: "Warnung",
  info: "Hinweis",
};

/** German plurals, because "1 Warnungen" in the first line of output reads like a bug. */
export function plural(count: number, singular: string, plural_: string): string {
  return `${count} ${count === 1 ? singular : plural_}`;
}

function paint(text: string, code: string): string {
  return isTty ? `${code}${text}${RESET}` : text;
}

function location(finding: FindingsReport["findings"][number]): string {
  return finding.line === null ? finding.path : `${finding.path}:${finding.line}`;
}

export function formatFindings(result: FindingsReport): string {
  if (result.findings.length === 0) {
    return `${paint("✓", COLOUR.info)} ${plural(result.summary.filesChecked, "Datei", "Dateien")} geprüft, nichts gefunden.`;
  }

  const lines: string[] = [];
  let currentPath = "";

  for (const finding of result.findings) {
    if (finding.path !== currentPath) {
      currentPath = finding.path;
      lines.push("");
      lines.push(paint(currentPath, DIM));
    }
    const severity = paint(LABEL[finding.severity].padEnd(7), COLOUR[finding.severity]);
    const where = finding.line === null ? "" : paint(`:${finding.line}`, DIM);
    lines.push(`  ${severity} ${finding.message}${where}`);
    if (finding.detail) {
      for (const detailLine of finding.detail.split("\n")) {
        lines.push(paint(`          ${detailLine}`, DIM));
      }
    }
  }

  const { errors, warnings, infos, filesChecked } = result.summary;
  lines.push("");
  lines.push(
    [
      plural(filesChecked, "Datei", "Dateien"),
      paint(plural(errors, "Fehler", "Fehler"), COLOUR.error),
      paint(plural(warnings, "Warnung", "Warnungen"), COLOUR.warning),
      plural(infos, "Hinweis", "Hinweise"),
    ].join(" · "),
  );
  return lines.join("\n");
}

/** GitHub Actions annotations, so findings appear on the diff rather than only in the log. */
export function formatGithub(result: FindingsReport): string {
  return result.findings
    .map((finding) => {
      const level = finding.severity === "error" ? "error" : finding.severity === "warning" ? "warning" : "notice";
      const line = finding.line === null ? "" : `,line=${finding.line}`;
      const message = [finding.message, finding.detail].filter(Boolean).join(" — ").replace(/\n/g, "%0A");
      return `::${level} file=${finding.path}${line}::${message}`;
    })
    .join("\n");
}

export function formatJson(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

/** The index as a report shape, so the findings print like the lint's. */
export function indexReport(index: WorkspaceIndex): FindingsReport {
  const { errors, warnings, infos, documents } = index.summary;
  return { findings: index.findings, summary: { errors, warnings, infos, filesChecked: documents } };
}

function backlinkLines(entries: WorkspaceIndex["documents"][number]["backlinks"]["entries"], indent: string): string[] {
  return entries.map((entry) => {
    const under = entry.sourceHeadingTitle ? `  (unter „${entry.sourceHeadingTitle}")` : "";
    return `${indent}← ${entry.sourcePath}:${entry.line}  ${entry.raw}${under}`;
  });
}

/** Documents with their backlinks, headings only where something links to them, then the findings. */
export function formatIndex(index: WorkspaceIndex, options: { quiet?: boolean } = {}): string {
  const lines: string[] = [];
  if (!options.quiet) {
    for (const document of index.documents) {
      lines.push(`${document.path}  ${document.title}  (${plural(document.backlinks.count, "Rückverweis", "Rückverweise")})`);
      lines.push(...backlinkLines(document.backlinks.entries, "    "));
      for (const heading of index.headings) {
        if (heading.documentId !== document.id || heading.backlinks.count === 0) continue;
        lines.push(`  ${"#".repeat(heading.level)} ${heading.title}  (Zeile ${heading.line}, ${plural(heading.backlinks.count, "Rückverweis", "Rückverweise")})`);
        lines.push(...backlinkLines(heading.backlinks.entries, "      "));
      }
    }
    lines.push("");
  }
  lines.push(formatFindings(indexReport(index)));
  lines.push(`${plural(index.summary.headings, "Überschrift", "Überschriften")} · ${plural(index.summary.links, "aufgelöster Verweis", "aufgelöste Verweise")}`);
  return lines.join("\n");
}

export { location };
