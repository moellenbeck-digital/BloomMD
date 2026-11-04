import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "./auth";
import { assertRateLimit, RateLimitError } from "./request-security";

/**
 * Limits for `/api/link-preview` (#208). The route fetches arbitrary public URLs on the server's
 * behalf, so an unauthenticated caller could use it as an outbound request proxy.
 *
 * Anonymous callers are counted per client address only. A signed-in caller is counted per
 * account, which is generous because one person pasting links while editing sends a handful per
 * minute at most. The per-address cap of an account request is higher than the account cap
 * because several accounts can share one address (office, campus); it only stops one address from
 * fanning out over many accounts. The two tiers use separate counters, so signed-in traffic never
 * uses up the anonymous allowance of a shared address.
 */
export const LINK_PREVIEW_RATE_LIMIT = {
  windowMs: 60 * 1000,
  anonymousPerSource: 30,
  accountPerAccount: 120,
  accountPerSource: 300,
} as const;

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function accountIdentifier(request: Request) {
  try {
    return (await getApiRequestIdentity(request))?.userId ?? null;
  } catch (error) {
    // An unresolvable identity is counted as anonymous: the stricter limit applies.
    console.error("[BloomMD] Link preview identity lookup failed:", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

/**
 * Counts the request against the link-preview limit. Returns the response to send when the request
 * must not proceed (429 over the limit, 503 if the limit cannot be checked), otherwise null.
 * Call it before anything that makes an outbound request.
 */
export async function enforceLinkPreviewRateLimit(request: Request): Promise<NextResponse | null> {
  const accountId = await accountIdentifier(request);
  const subject = accountId ? "account" : "anonymous";
  const { windowMs } = LINK_PREVIEW_RATE_LIMIT;
  try {
    if (accountId) {
      await assertRateLimit(request, {
        action: "link-preview-account",
        identifier: accountId,
        limit: LINK_PREVIEW_RATE_LIMIT.accountPerAccount,
        sourceLimit: LINK_PREVIEW_RATE_LIMIT.accountPerSource,
        windowMs,
      });
    } else {
      await assertRateLimit(request, { action: "link-preview", limit: LINK_PREVIEW_RATE_LIMIT.anonymousPerSource, windowMs });
    }
    return null;
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Hashed key only: no address, no account, no requested URL. Repeat offenders show up as the same key.
      console.warn(JSON.stringify({
        event: "rate-limit-exceeded",
        action: "link-preview",
        windowSeconds: windowMs / 1000,
        subject,
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
