const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Strips content that looks like a link but is not one.
 *
 * Fenced code blocks and inline code are the two places where `[[...]]` shows up as an example
 * rather than a reference — documentation about wiki links being the obvious case. Replacing with
 * spaces rather than deleting keeps every line number and column intact, which is what lets the
 * reported line actually point at the link.
 */
export function maskCode(lines: string[]): string[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      // A closing fence must be at least as long as the one that opened the block.
      if (fenceMatch && fenceMatch[1]!.startsWith(fence[0]!) && fenceMatch[1]!.length >= fence.length) {
        fence = null;
      }
      return " ".repeat(line.length);
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!;
      return " ".repeat(line.length);
    }
    // Inline code spans, masked in place.
    return line.replace(/`+[^`]*`+/g, (span) => " ".repeat(span.length));
  });
}
