import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "@bloommd/core/frontmatter";
import type { MarketingLocale } from "./locale";

export type MarketingPostKind = "blog" | "news";

export interface MarketingPost {
  kind: MarketingPostKind;
  slug: string;
  locale: MarketingLocale;
  title: string;
  description: string;
  date: string;
  commitDate?: string;
  tags: string[];
  version?: string;
  sourceUrl?: string;
  content: string;
}

export interface MarketingPostParseInput {
  filename: string;
  raw: string;
  kind: MarketingPostKind;
  locale: MarketingLocale;
}

const CONTENT_ROOT = join(process.cwd(), "content");

function isEnglishFilename(filename: string): boolean {
  return /-en\.md$/i.test(filename);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T12:00:00.000Z`);
  return Number.isNaN(timestamp) ? null : value;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim());
  }
  if (typeof value === "string") {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function safeExternalUrl(value: unknown): string | undefined {
  const candidate = stringValue(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isDraft(value: unknown): boolean {
  return value === true || value === "true";
}

export function marketingPostSlug(filename: string): string {
  const base = filename.replace(/\.md$/i, "").replace(/-en$/i, "");
  return base === "index" ? "" : base;
}

function stripLeadingTitle(content: string, title: string): string {
  const lines = content.replace(/^\s*\n/, "").split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("# ") && first.slice(2).trim() === title.trim()) {
    return lines.slice(1).join("\n").replace(/^\s*\n/, "");
  }
  return content;
}

export function parseMarketingPost({ filename, raw, kind, locale }: MarketingPostParseInput): MarketingPost | null {
  if (!filename.toLowerCase().endsWith(".md") || marketingPostSlug(filename) === "") return null;
  if ((locale === "en") !== isEnglishFilename(filename)) return null;

  const { data, content } = parseFrontmatter(raw);
  if (isDraft(data.draft)) return null;

  const title = stringValue(data.title);
  const date = validDate(data.date);
  if (!title || !date) return null;

  const description = stringValue(data.description) ?? "";
  return {
    kind,
    slug: marketingPostSlug(filename),
    locale,
    title,
    description,
    date,
    ...(validDate(data.commitDate) ? { commitDate: validDate(data.commitDate)! } : {}),
    tags: parseTags(data.tags),
    ...(stringValue(data.version) ? { version: stringValue(data.version)! } : {}),
    ...(safeExternalUrl(data.sourceUrl) ? { sourceUrl: safeExternalUrl(data.sourceUrl) } : {}),
    content: stripLeadingTitle(content, title),
  };
}

export async function listMarketingPosts(kind: MarketingPostKind, locale: MarketingLocale = "de"): Promise<MarketingPost[]> {
  const directory = join(CONTENT_ROOT, kind);
  const entries = await readdir(directory).catch(() => [] as string[]);
  const posts: MarketingPost[] = [];

  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith(".md")) continue;
    const raw = await readFile(join(directory, entry), "utf8");
    const post = parseMarketingPost({ filename: entry, raw, kind, locale });
    if (post) posts.push(post);
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export async function getMarketingPost(kind: MarketingPostKind, slug: string, locale: MarketingLocale = "de"): Promise<MarketingPost | null> {
  const posts = await listMarketingPosts(kind, locale);
  return posts.find((post) => post.slug === slug) ?? null;
}

export function marketingPostPath(kind: MarketingPostKind, slug: string, locale: MarketingLocale): string {
  const prefix = locale === "en" ? "/en" : "";
  return `${prefix}/${kind}/${slug}`;
}
