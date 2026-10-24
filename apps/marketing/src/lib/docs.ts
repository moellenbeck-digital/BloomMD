import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "@bloommd/core/frontmatter";
import type { MarketingLocale } from "./locale";

/**
 * Documentation source.
 *
 * Plain Markdown files in `content/docs`, read at request time. Deliberately **not** `fumadocs-mdx`:
 * that package wraps `next.config`, which already carries the Sentry wrapper, and stacking build
 * plugins is what broke the production build during the Next 15-to-16 move. Fumadocs' UI and its
 * Markdown renderer work without it.
 *
 * Keeping the content as `.md` rather than `.mdx` also keeps it reviewable in a pull request and
 * readable in any editor — the same argument BloomMD makes about its own documents.
 *
 * Frontmatter is parsed with `@bloommd/core`'s own parser rather than reaching for `gray-matter`,
 * which is only present transitively here and could vanish with an unrelated dependency bump.
 */

const DOCS_DIR = join(process.cwd(), "content", "docs");

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  order: number;
  content: string;
}

/**
 * Drops a leading H1 that repeats the frontmatter title.
 *
 * The page already renders the title, so keeping the heading would put two `h1` elements on one
 * page — duplicated for a reader, and ambiguous for a screen reader. The heading stays in the file
 * because the file should read correctly on its own; it is the rendering that has to choose one.
 */
function stripLeadingTitle(content: string, title: string): string {
  const lines = content.replace(/^\s*\n/, "").split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("# ") && first.slice(2).trim() === title.trim()) {
    return lines.slice(1).join("\n").replace(/^\s*\n/, "");
  }
  return content;
}

function slugFor(filename: string): string {
  const base = filename.replace(/\.md$/i, "").replace(/-en$/i, "");
  return base === "index" ? "" : base;
}

/**
 * Help for an unreleased feature is prepared as `draft: true`, like news and blog posts, so it only
 * goes live together with the release it describes.
 */
export function parseDocPage(entry: string, raw: string): DocPage | null {
  const { data, content } = parseFrontmatter(raw);
  if (data.draft === true || data.draft === "true") return null;
  const title = typeof data.title === "string" ? data.title : entry;
  return {
    slug: slugFor(entry),
    title,
    description: typeof data.description === "string" ? data.description : "",
    order: typeof data.order === "number" ? data.order : 999,
    content: stripLeadingTitle(content, title),
  };
}

export async function listDocs(locale: MarketingLocale = "de"): Promise<DocPage[]> {
  const entries = await readdir(DOCS_DIR).catch(() => [] as string[]);
  const pages: DocPage[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const isEnglish = /-en\.md$/i.test(entry);
    if ((locale === "en") !== isEnglish) continue;
    const page = parseDocPage(entry, await readFile(join(DOCS_DIR, entry), "utf8"));
    if (page) pages.push(page);
  }

  return pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export async function getDoc(slug: string, locale: MarketingLocale = "de"): Promise<DocPage | null> {
  const pages = await listDocs(locale);
  return pages.find((page) => page.slug === slug) ?? null;
}
