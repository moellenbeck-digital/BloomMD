import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingContentArticle } from "@/components/marketing-content";
import { marketingMetadata } from "@/lib/metadata";
import { getMarketingPost, listMarketingPosts, marketingPostPath } from "@/lib/posts";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await listMarketingPosts("news", "en")).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getMarketingPost("news", slug, "en");
  if (!post) return {};
  return marketingMetadata({
    title: `${post.title} · BloomMD`,
    description: post.description,
    path: marketingPostPath("news", post.slug, "en"),
    locale: "en",
    languages: {
      de: marketingPostPath("news", post.slug, "de"),
      en: marketingPostPath("news", post.slug, "en"),
      "x-default": marketingPostPath("news", post.slug, "de"),
    },
    type: "article",
    publishedTime: post.date,
  });
}

export default async function EnglishNewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getMarketingPost("news", slug, "en");
  if (!post) notFound();
  return <MarketingContentArticle kind="news" locale="en" post={post} />;
}
