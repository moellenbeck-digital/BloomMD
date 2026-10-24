import type { Metadata } from "next";
import { MarketingContentIndex } from "@/components/marketing-content";
import { marketingMetadata } from "@/lib/metadata";
import { listMarketingPosts } from "@/lib/posts";

export const revalidate = 300;

export const metadata: Metadata = marketingMetadata({
  title: "News · BloomMD",
  description: "Produkt-Updates, Release-Hinweise und praktische Änderungen bei BloomMD.",
  path: "/news",
  languages: { de: "/news", en: "/en/news", "x-default": "/news" },
});

export default async function NewsPage() {
  const posts = await listMarketingPosts("news", "de");
  return <MarketingContentIndex kind="news" locale="de" posts={posts} />;
}
