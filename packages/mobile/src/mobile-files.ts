export function markdownFilename(title: string, id: string, existing: Iterable<string> = []) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "mindmap";
  const suffix = id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || Date.now().toString(36);
  const names = new Set(Array.from(existing, (name) => name.toLowerCase()));
  let candidate = `${slug}-${suffix}.md`;
  let counter = 2;
  while (names.has(candidate.toLowerCase())) candidate = `${slug}-${suffix}-${counter++}.md`;
  return candidate;
}

export function normalizeMobileMarkdownFilename(filename: string) {
  const value = filename.trim();
  if (!value || value === "." || value === ".." || value.startsWith("..") || /[\\/\0-\x1f]/.test(value)) {
    throw new Error("Invalid Markdown filename.");
  }
  return /\.(md|markdown)$/i.test(value) ? value : `${value}.md`;
}
