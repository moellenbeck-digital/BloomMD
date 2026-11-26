import { listDocs } from "@/lib/docs";
import { withMarketingLocale } from "@/lib/locale";

const siteUrl = "https://bloommd.io";

/** The file is read outside the site, so root-relative Markdown links must carry the origin. */
export function absolutizeMarkdownLinks(markdown: string): string {
  return markdown.replace(/\]\(\/(?!\/)/g, `](${siteUrl}/`);
}

/** Drafts are excluded by listDocs. */
export async function buildLlmsFull(): Promise<string> {
  const sections = ["# BloomMD documentation", `Published documentation in German and English. Source: ${siteUrl}/docs`];
  for (const locale of ["de", "en"] as const) {
    for (const page of await listDocs(locale)) {
      const path = withMarketingLocale(page.slug ? `/docs/${page.slug}` : "/docs", locale);
      sections.push(`## ${page.title} (${locale})\n\nSource: ${siteUrl}${path}\n\n${page.description}\n\n${absolutizeMarkdownLinks(page.content)}`);
    }
  }
  return sections.join("\n\n---\n\n") + "\n";
}
