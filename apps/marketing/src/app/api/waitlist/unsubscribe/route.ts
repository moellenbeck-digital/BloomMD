import { NextResponse } from "next/server";
import { publicMarketingUrl } from "../../../../lib/deployment";
import { unsubscribeFromWaitlist } from "../../../../lib/waitlist-db";

export const dynamic = "force-dynamic";

/** Removes an address from the waitlist. Reachable without an account, by design. */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
  const locale = requestUrl.searchParams.get("lang") === "en" ? "en" : "de";
  const removed = token ? await unsubscribeFromWaitlist(token) : false;
  const target = new URL(removed ? "/waitlist/abgemeldet" : "/waitlist/ungueltig", publicMarketingUrl());
  if (requestUrl.searchParams.has("lang")) target.searchParams.set("lang", locale);
  return NextResponse.redirect(target, { status: 303, headers: { "Cache-Control": "no-store" } });
}
