import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingContentArticle } from "@/components/marketing-content";
import { marketingMetadata } from "@/lib/metadata";
import { getMarketingPost, listMarketingPosts, marketingPostPath } from "@/lib/posts";

export async function generateStaticParams() {
  return (await listMarketingPosts("blog", "en")).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getMarketingPost("blog", slug, "en");
  if (!post) return {};
  return marketingMetadata({
    title: `${post.title} · BloomMD`,
    description: post.description,
    path: marketingPostPath("blog", post.slug, "en"),
    locale: "en",
    languages: {
      de: marketingPostPath("blog", post.slug, "de"),
      en: marketingPostPath("blog", post.slug, "en"),
      "x-default": marketingPostPath("blog", post.slug, "de"),
    },
    type: "article",
    publishedTime: post.date,
  });
}

export default async function EnglishBlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getMarketingPost("blog", slug, "en");
  if (!post) notFound();
  return <MarketingContentArticle kind="blog" locale="en" post={post} />;
}
