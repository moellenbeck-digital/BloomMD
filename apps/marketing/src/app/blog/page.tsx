import type { Metadata } from "next";
import { MarketingContentIndex } from "@/components/marketing-content";
import { marketingMetadata } from "@/lib/metadata";
import { listMarketingPosts } from "@/lib/posts";

export const metadata: Metadata = marketingMetadata({
  title: "Blog · BloomMD",
  description: "Beiträge über Markdown-first, visuelle Struktur und Wissensarbeit mit BloomMD.",
  path: "/blog",
  languages: { de: "/blog", en: "/en/blog", "x-default": "/blog" },
});

export default async function BlogPage() {
  const posts = await listMarketingPosts("blog", "de");
  return <MarketingContentIndex kind="blog" locale="de" posts={posts} />;
}
