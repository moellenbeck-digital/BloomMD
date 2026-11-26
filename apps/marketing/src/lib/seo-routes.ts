/**
 * Static marketing URLs in the sitemap and the sources that determine their `lastmod`.
 *
 * `scripts/update-content-modified.ts` reads the newest Git commit of each source list and writes
 * `content-modified.json`. Paths are relative to `apps/marketing`. A route with `null` sources has
 * no provable modification date and is listed without `lastmod` on purpose.
 */
export const STATIC_ROUTE_SOURCES = {
  "/": ["src/app/page.tsx", "src/components/availability-overview.tsx", "src/components/agent-workflow-section.tsx", "src/components/knowledge-vision-section.tsx"],
  "/en": ["src/app/en/page.tsx", "src/app/en/english-landing-page.tsx"],
  "/demo": ["src/app/demo/page.tsx", "src/app/demo/demo-client.tsx"],
  "/templates": ["src/app/templates/page.tsx", "src/app/templates/template-gallery.tsx", "../../templates"],
  "/obsidian": ["src/app/obsidian/page.tsx"],
  "/download": ["src/app/download/page.tsx", "src/components/availability-overview.tsx"],
  // Roadmap items load live from GitHub issues; the page source date would not describe the content.
  "/roadmap": null,
  "/en/roadmap": null,
} as const satisfies Record<string, readonly string[] | null>;

export type StaticRoute = keyof typeof STATIC_ROUTE_SOURCES;

/** Listing pages take `lastmod` from their newest article, not from a source file. */
export const ARTICLE_LISTING_ROUTES = [
  { path: "/blog", kind: "blog", locale: "de" },
  { path: "/en/blog", kind: "blog", locale: "en" },
  { path: "/news", kind: "news", locale: "de" },
  { path: "/en/news", kind: "news", locale: "en" },
] as const;

/** Static routes that also exist as `?lang=en` variants of the same source. */
export const QUERY_LOCALIZED_ROUTES: readonly StaticRoute[] = ["/demo", "/templates", "/obsidian", "/download"];

/** Template detail pages take `lastmod` from their `templates/<slug>/` directory (Markdown + metadata). */
export function templateSource(slug: string): string {
  return `../../templates/${slug}`;
}
