import { fetchLinkPreview } from "../../../lib/link-preview";
import { enforceLinkPreviewRateLimit } from "../../../lib/link-preview-rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/link-preview?url=...  - fetches a page server-side and returns its title, description and image.
 *
 * Because the server fetches whatever URL a caller names, the request path is hardened against SSRF
 * (implementation: lib/link-preview.ts, kept identical in apps/app and apps/marketing):
 *
 * - Rate limit first: a rejected request never causes an outbound request (lib/link-preview-rate-limit.ts).
 * - Resolve once, connect to what was checked (DNS pinning): the host name is resolved a single time with all of its
 *   addresses (`lookup(..., { all: true })`). The request is refused if the list is empty or if ANY address is not
 *   public. The connection is then made with node:http(s) and a `lookup` callback that only returns those
 *   validated addresses, so the name is never resolved a second time and a rebinding DNS server cannot swap in an
 *   internal address between check and connect. The URL is not rewritten to the IP: SNI, the TLS certificate check
 *   and the Host header keep the original host name. IP literals in the URL are checked directly and used as they are.
 * - Host names are normalized before the text check (lower case, trailing dot removed, IPv6 brackets removed), so
 *   `localhost.` and `Foo.Internal.` are refused like `localhost` and `foo.internal`. Refused names: `localhost`,
 *   `*.localhost`, `*.local`, `*.internal`; URLs with credentials; every scheme except http and https.
 * - Refused address ranges. IPv4: 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10 (CGNAT), 127.0.0.0/8, 169.254.0.0/16 (link-local,
 *   cloud metadata), 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24, 192.168.0.0/16, 198.18.0.0/15,
 *   198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/4 (multicast), 240.0.0.0/4 (reserved, incl. 255.255.255.255).
 *   IPv6: everything outside 2000::/3 (so ::, ::1, IPv4-compatible ::a.b.c.d, 64:ff9b::/96, 100::/64, fc00::/7,
 *   fe80::/10, fec0::/10, ff00::/8, ...), plus 2001::/23 (incl. Teredo), 2001:db8::/32 and 3fff::/20 inside it.
 *   IPv4-mapped addresses (`::ffff:127.0.0.1`, also in hex form `::ffff:7f00:1`) and 6to4 (`2002::/16`) are judged
 *   by the IPv4 rules of the address they embed. An address that cannot be parsed counts as refused.
 * - Redirects are followed by hand (at most 2, 5 s timeout per hop, 1 MB HTML limit). Every redirect target goes
 *   through the whole procedure again: scheme check, host normalization, fresh resolution, address check, new
 *   pin. A redirect to another scheme than http/https, to an internal target, or from https to http (downgrade)
 *   is refused.
 */
export async function GET(request: Request) {
  // Count first: a rejected request must not cause any outbound fetch.
  const limited = await enforceLinkPreviewRateLimit(request);
  if (limited) return limited;
  const value = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  if (!value || value.length > 2048) return NextResponse.json({ error: "A valid URL is required." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  try {
    return NextResponse.json({ preview: await fetchLinkPreview(value) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview unavailable." }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
  }
}
