import { proxyPlausibleScript } from "@/lib/plausible-proxy";

// Reached only through the rewrite in src/proxy.ts (/_plausible/js/script.js). Dynamic: the answer
// depends on the request host and on the environment of the running server, never on the build.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return proxyPlausibleScript(request);
}
