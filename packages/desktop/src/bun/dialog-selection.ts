export function firstSelectedPath(selection: unknown): string | null {
  if (!Array.isArray(selection)) return null;

  const [selected] = selection;
  if (typeof selected !== "string") return null;

  const trimmed = selected.trim();
  return trimmed ? trimmed : null;
}
