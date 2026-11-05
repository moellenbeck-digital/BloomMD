import { proxyPlausibleEvent } from "@/lib/plausible-proxy";

// Reached only through the rewrite in src/proxy.ts (/_plausible/api/event).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyPlausibleEvent(request);
}
