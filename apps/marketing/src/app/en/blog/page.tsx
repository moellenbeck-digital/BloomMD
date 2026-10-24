import type { Metadata } from "next";
import { MarketingContentIndex } from "@/components/marketing-content";
import { marketingMetadata } from "@/lib/metadata";
import { listMarketingPosts } from "@/lib/posts";

export const metadata: Metadata = marketingMetadata({
  title: "Blog · BloomMD",
  description: "Notes on Markdown-first work, visual structure and knowledge work with BloomMD.",
  path: "/en/blog",
  locale: "en",
  languages: { de: "/blog", en: "/en/blog", "x-default": "/blog" },
});

export default async function EnglishBlogPage() {
  const posts = await listMarketingPosts("blog", "en");
  return <MarketingContentIndex kind="blog" locale="en" posts={posts} />;
}
