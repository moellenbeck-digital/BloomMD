import type { Metadata } from "next";
import { MarketingContentIndex } from "@/components/marketing-content";
import { marketingMetadata } from "@/lib/metadata";
import { listMarketingPosts } from "@/lib/posts";

export const revalidate = 300;

export const metadata: Metadata = marketingMetadata({
  title: "News · BloomMD",
  description: "Product updates, release notes and practical changes at BloomMD.",
  path: "/en/news",
  locale: "en",
  languages: { de: "/news", en: "/en/news", "x-default": "/news" },
});

export default async function EnglishNewsPage() {
  const posts = await listMarketingPosts("news", "en");
  return <MarketingContentIndex kind="news" locale="en" posts={posts} />;
}
