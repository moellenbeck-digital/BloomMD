import type { MetadataRoute } from "next";
import { listMarketingPosts, marketingPostPath } from "@/lib/posts";
import { listDocs } from "@/lib/docs";
import { withMarketingLocale } from "@/lib/locale";

import modified from "@/lib/content-modified.json";
import { listTemplates } from "@/lib/templates";

const siteUrl = "https://bloommd.io";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = [
    "/",
    "/en",
    "/blog",
    "/en/blog",
    "/news",
    "/en/news",
    "/demo",
    "/demo?lang=en",
    "/templates",
    "/templates?lang=en",
    "/roadmap",
    "/en/roadmap",
    "/obsidian",
    "/obsidian?lang=en",
    "/download",
    "/download?lang=en",
  ];
  const staticEntries = staticPaths.map((path) => ({ url: `${siteUrl}${path}`, lastModified: modified[("src/app" + (path.split("?")[0] === "/" ? "" : path.split("?")[0]) + "/page.tsx") as keyof typeof modified] }));
  const [blogPosts, englishBlogPosts, newsPosts, englishNewsPosts] = await Promise.all([
    listMarketingPosts("blog", "de"),
    listMarketingPosts("blog", "en"),
    listMarketingPosts("news", "de"),
    listMarketingPosts("news", "en"),
  ]);
  const posts = [...blogPosts, ...englishBlogPosts, ...newsPosts, ...englishNewsPosts].map((post) => ({
    url: `${siteUrl}${marketingPostPath(post.kind, post.slug, post.locale)}`,
    lastModified: new Date(`${post.date}T12:00:00.000Z`),
  }));
  const docs = await Promise.all((["de", "en"] as const).map(async (locale) => {
    const pages = await listDocs(locale);
    return pages.map((page) => ({
      url: `${siteUrl}${withMarketingLocale(page.slug ? `/docs/${page.slug}` : "/docs", locale)}`,
      lastModified: modified[`content/docs/${page.slug || "index"}${locale === "en" ? "-en" : ""}.md` as keyof typeof modified],
    }));
  }));
  const templates = (await listTemplates()).flatMap((page) => ["de", "en"].map((locale) => ({ url: `${siteUrl}/templates/${page.slug}${locale === "en" ? "?lang=en" : ""}` })));
  return [...staticEntries, ...posts, ...docs.flat(), ...templates];
}
