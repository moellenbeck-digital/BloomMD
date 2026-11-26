import { buildLlmsFull } from "@/lib/llms-full";

// Built once from the checked-in docs at build time.
export const dynamic = "force-static";

export async function GET() {
  return new Response(await buildLlmsFull(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
