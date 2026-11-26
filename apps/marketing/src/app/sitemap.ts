import type { MetadataRoute } from "next";
import { listMarketingPosts, marketingPostPath, type MarketingPost } from "@/lib/posts";
import { listDocs } from "@/lib/docs";
import { withMarketingLocale } from "@/lib/locale";
import { docModified, docSourceFile, routeModified, templateModified } from "@/lib/content-modified";
import { ARTICLE_LISTING_ROUTES, QUERY_LOCALIZED_ROUTES, STATIC_ROUTE_SOURCES, type StaticRoute } from "@/lib/seo-routes";
import { listTemplates } from "@/lib/templates";

const siteUrl = "https://bloommd.io";

function postDate(post: MarketingPost): Date {
  return new Date(`${post.date}T12:00:00.000Z`);
}

/** Omits `lastModified` instead of inventing one when no source date exists. */
function entry(path: string, lastModified: string | Date | undefined): MetadataRoute.Sitemap[number] {
  return lastModified ? { url: `${siteUrl}${path}`, lastModified } : { url: `${siteUrl}${path}` };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = (Object.keys(STATIC_ROUTE_SOURCES) as StaticRoute[]).flatMap((route) => {
    const paths = QUERY_LOCALIZED_ROUTES.includes(route) ? [route, `${route}?lang=en`] : [route];
    return paths.map((path) => entry(path, routeModified(route)));
  });

  const listings = await Promise.all(ARTICLE_LISTING_ROUTES.map(async ({ path, kind, locale }) => {
    const posts = await listMarketingPosts(kind, locale);
    // Posts are sorted newest first; an empty listing has no provable date.
    return { listing: entry(path, posts[0] ? postDate(posts[0]) : undefined), posts };
  }));
  const posts = listings.flatMap(({ posts }) => posts).map((post) => entry(marketingPostPath(post.kind, post.slug, post.locale), postDate(post)));

  const docs = await Promise.all((["de", "en"] as const).map(async (locale) => {
    const pages = await listDocs(locale);
    return pages.map((page) => entry(
      withMarketingLocale(page.slug ? `/docs/${page.slug}` : "/docs", locale),
      docModified(docSourceFile(page.slug, locale)),
    ));
  }));

  const templates = (await listTemplates()).flatMap(({ slug }) => [`/templates/${slug}`, `/templates/${slug}?lang=en`].map((path) => entry(path, templateModified(slug))));

  return [...staticEntries, ...listings.map(({ listing }) => listing), ...posts, ...docs.flat(), ...templates];
}
