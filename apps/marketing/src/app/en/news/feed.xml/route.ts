import { renderNewsFeed } from "@/lib/news-feed";

export const revalidate = 300;

export async function GET(): Promise<Response> {
  return new Response(await renderNewsFeed("en"), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
