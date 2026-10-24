/**
 * Minimal line diff for showing a save conflict.
 *
 * A conflict dialog has one job: let a person see what actually differs before they choose to keep
 * their version or take the other one. That needs real common lines, not a dump of "everything
 * removed, everything added" — the wiki proposal renderer does the latter and it is unreadable for
 * anything but a tiny change.
 *
 * Implemented as a longest common subsequence over lines. Files that BloomMD edits are Markdown
 * documents, so the quadratic table is bounded by a guard rather than by hope.
 */

export type DiffKind = "equal" | "added" | "removed";

export interface DiffLine {
  kind: DiffKind;
  /** 1-based line number in the original text, null for added lines. */
  beforeLine: number | null;
  /** 1-based line number in the changed text, null for removed lines. */
  afterLine: number | null;
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

/** Above this, the quadratic table gets too large to build for an interactive dialog. */
const MAX_DIFF_LINES = 4000;

/**
 * Splits into content lines.
 *
 * An empty document has no lines, and a trailing newline is a terminator rather than an empty last
 * line. Without both rules a conflict dialog reports a phantom changed line whenever one side ends
 * with a newline and the other does not.
 */
function splitLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, "\n");
  if (normalized === "") return [];
  return normalized.replace(/\n$/, "").split("\n");
}

/**
 * Falls back to a plain replacement block for inputs too large to diff.
 *
 * Being honest about that beats freezing the dialog: the user still sees both versions and can
 * still choose.
 */
function wholeFileReplacement(before: string[], after: string[]): DiffLine[] {
  return [
    ...before.map((text, index) => ({ kind: "removed" as const, beforeLine: index + 1, afterLine: null, text })),
    ...after.map((text, index) => ({ kind: "added" as const, beforeLine: null, afterLine: index + 1, text })),
  ];
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  if (a.length + b.length > MAX_DIFF_LINES) return wholeFileReplacement(a, b);

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ kind: "equal", beforeLine: i + 1, afterLine: j + 1, text: a[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      result.push({ kind: "removed", beforeLine: i + 1, afterLine: null, text: a[i]! });
      i += 1;
    } else {
      result.push({ kind: "added", beforeLine: null, afterLine: j + 1, text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) {
    result.push({ kind: "removed", beforeLine: i + 1, afterLine: null, text: a[i]! });
    i += 1;
  }
  while (j < b.length) {
    result.push({ kind: "added", beforeLine: null, afterLine: j + 1, text: b[j]! });
    j += 1;
  }
  return result;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  return lines.reduce<DiffStats>(
    (stats, line) => {
      if (line.kind === "added") stats.added += 1;
      else if (line.kind === "removed") stats.removed += 1;
      else stats.unchanged += 1;
      return stats;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );
}

/**
 * Drops long runs of unchanged lines so a dialog shows the changes rather than the whole document.
 * Keeps `context` lines around every change.
 */
export function collapseUnchanged(lines: DiffLine[], context = 3): Array<DiffLine | { kind: "skipped"; count: number }> {
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.kind === "equal") return;
    for (let offset = -context; offset <= context; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < lines.length) keep.add(target);
    }
  });

  const output: Array<DiffLine | { kind: "skipped"; count: number }> = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (keep.has(index)) {
      if (skipped > 0) {
        output.push({ kind: "skipped", count: skipped });
        skipped = 0;
      }
      output.push(line);
    } else {
      skipped += 1;
    }
  });
  if (skipped > 0) output.push({ kind: "skipped", count: skipped });
  return output;
}
