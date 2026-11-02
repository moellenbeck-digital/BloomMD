import { NextResponse } from "next/server";
import { assertRateLimit, RateLimitError } from "./request-security";

/**
 * Limit for `/api/link-preview` (#208). The route fetches arbitrary public URLs on the server's
 * behalf and has no sign-in, so every caller is counted per client address. 30 a minute is far
 * above what the demo editor sends (one request per pasted link).
 */
export const LINK_PREVIEW_RATE_LIMIT = {
  windowMs: 60 * 1000,
  perSource: 30,
} as const;

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * Counts the request against the link-preview limit. Returns the response to send when the request
 * must not proceed (429 over the limit, 503 if the limit cannot be checked), otherwise null.
 * Call it before anything that makes an outbound request.
 */
export async function enforceLinkPreviewRateLimit(request: Request): Promise<NextResponse | null> {
  const { windowMs } = LINK_PREVIEW_RATE_LIMIT;
  try {
    await assertRateLimit(request, { action: "link-preview", limit: LINK_PREVIEW_RATE_LIMIT.perSource, windowMs });
    return null;
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Hashed key only: no address and no requested URL. Repeat offenders show up as the same key.
      console.warn(JSON.stringify({
        event: "rate-limit-exceeded",
        action: "link-preview",
        windowSeconds: windowMs / 1000,
        subject: "anonymous",
        key: error.keyHash?.slice(0, 16) ?? null,
      }));
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), ...NO_STORE } },
      );
    }
    // Fail closed: without a working counter the endpoint would be an unlimited proxy.
    console.error("[BloomMD] Link preview rate limit unavailable:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Preview unavailable." }, { status: 503, headers: NO_STORE });
  }
}
