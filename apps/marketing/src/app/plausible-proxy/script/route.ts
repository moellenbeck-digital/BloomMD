import { proxyPlausibleScript } from "@/lib/plausible-proxy";

// Reached only through the rewrite in src/proxy.ts (/_plausible/js/script.js). Dynamic, so the build
// never calls the Plausible instance.
export const dynamic = "force-dynamic";

export async function GET() {
  return proxyPlausibleScript();
}
