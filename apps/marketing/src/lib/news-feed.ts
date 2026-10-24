import { listMarketingPosts, marketingPostPath } from "./posts";
import type { MarketingLocale } from "./locale";

const DEFAULT_SITE_URL = "https://bloommd.io";

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_URL;
  try {
    return new URL(configured).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export async function renderNewsFeed(locale: MarketingLocale): Promise<string> {
  const posts = await listMarketingPosts("news", locale);
  const baseUrl = siteUrl();
  const feedPath = locale === "en" ? "/en/news/feed.xml" : "/news/feed.xml";
  const title = locale === "en" ? "BloomMD News" : "BloomMD Neuigkeiten";
  const description = locale === "en" ? "Product updates and release notes from BloomMD." : "Produkt-Updates und Release-Hinweise von BloomMD.";
  const items = posts.map((post) => {
    const url = `${baseUrl}${marketingPostPath("news", post.slug, locale)}`;
    return [
      "    <item>",
      `      <title>${xmlEscape(post.title)}</title>`,
      `      <link>${xmlEscape(url)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
      `      <pubDate>${new Date(`${post.date}T12:00:00.000Z`).toUTCString()}</pubDate>`,
      `      <description>${xmlEscape(post.description)}</description>`,
      "    </item>",
    ].join("\n");
  }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${xmlEscape(title)}</title>`,
    `    <link>${xmlEscape(`${baseUrl}${locale === "en" ? "/en/news" : "/news"}`)}</link>`,
    `    <description>${xmlEscape(description)}</description>`,
    `    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${xmlEscape(`${baseUrl}${feedPath}`)}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");
}
