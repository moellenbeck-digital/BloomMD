import { dump, load, JSON_SCHEMA } from "js-yaml";
import type { MindMapFrontmatter } from "./types";

const FRONTMATTER_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { data: {}, content: raw.replace(/^\uFEFF/, "") };

  const parsed = load(match[1] ?? "", { schema: JSON_SCHEMA });
  const data = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};

  return { data, content: raw.slice(match[0].length) };
}

export function stringifyFrontmatter(content: string, data: Record<string, unknown>): string {
  const yaml = dump(data, {
    schema: JSON_SCHEMA,
    noRefs: true,
    lineWidth: -1,
  }).trimEnd();

  return `---\n${yaml}\n---\n${content}`;
}

export function normalizeFrontmatter(data: Record<string, unknown>, filePath: string): MindMapFrontmatter {
  const { title, id, created, updated, tags, layout, ...custom } = data;
  const now = new Date().toISOString();
  const fallbackTitle = filePath.split(/[\\/]/).pop()?.replace(/\.(?:md|markdown)$/i, "").trim() || "Untitled";
  const normalizedLayout = layout && typeof layout === "object" && !Array.isArray(layout)
    ? layout as Record<string, unknown>
    : null;
  const direction = normalizedLayout?.direction === "TB" ? "TB" : normalizedLayout?.direction === "LR" ? "LR" : undefined;
  const collapsed = Array.isArray(normalizedLayout?.collapsed)
    ? normalizedLayout.collapsed.filter((value): value is string => typeof value === "string")
    : undefined;

  return {
    ...custom,
    title: typeof title === "string" && title.trim() ? title : fallbackTitle,
    id: typeof id === "string" && id.trim() ? id : crypto.randomUUID().slice(0, 8),
    created: typeof created === "string" && created ? created : now,
    updated: typeof updated === "string" && updated ? updated : now,
    ...(Array.isArray(tags) ? { tags: tags.filter((value): value is string => typeof value === "string") } : {}),
    ...(normalizedLayout ? {
      layout: {
        ...(direction ? { direction } : {}),
        ...(collapsed ? { collapsed } : {}),
      },
    } : {}),
  };
}
