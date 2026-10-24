import { NextResponse } from "next/server";
import { publicMarketingUrl } from "../../../../lib/deployment";
import { confirmWaitlistSignup } from "../../../../lib/waitlist-db";

export const dynamic = "force-dynamic";

/**
 * Confirms a waitlist address from the link in the email.
 *
 * A GET because it is reached by clicking a link in a mail client. That is acceptable here: the
 * token is single-use, it belongs to the person holding the mailbox, and confirming is not a
 * destructive act. Unsubscribing is treated the same way for the same reason.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
  const locale = requestUrl.searchParams.get("lang") === "en" ? "en" : "de";
  const confirmed = token ? await confirmWaitlistSignup(token) : false;
  const target = new URL(confirmed ? "/waitlist/bestaetigt" : "/waitlist/ungueltig", publicMarketingUrl());
  if (requestUrl.searchParams.has("lang")) target.searchParams.set("lang", locale);
  return NextResponse.redirect(target, { status: 303, headers: { "Cache-Control": "no-store" } });
}
