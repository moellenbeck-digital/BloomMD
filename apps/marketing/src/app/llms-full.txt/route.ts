import { listDocs } from "@/lib/docs";
import { withMarketingLocale } from "@/lib/locale";

export async function GET() {
  const sections = ["# BloomMD documentation", "Published documentation in German and English. Source: https://bloommd.io/docs"];
  for (const locale of ["de", "en"] as const) {
    for (const page of await listDocs(locale)) {
      const path = withMarketingLocale(page.slug ? `/docs/${page.slug}` : "/docs", locale);
      sections.push(`## ${page.title} (${locale})\n\nSource: https://bloommd.io${path}\n\n${page.description}\n\n${page.content}`);
    }
  }
  return new Response(sections.join("\n\n---\n\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
