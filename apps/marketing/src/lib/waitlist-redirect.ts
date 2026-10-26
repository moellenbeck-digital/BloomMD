import { NextResponse } from "next/server";
import { publicAppUrl } from "./deployment";

/**
 * Waitlist pages that are gone for good: whoever lands here is sent to the registration.
 * `/waitlist/abgemeldet` and `/api/waitlist/unsubscribe` are deliberately not listed — unsubscribe
 * links in mails that were already sent must keep working.
 */
const RETIRED_WAITLIST_PATHS = new Set(["/waitlist", "/waitlist/bestaetigt", "/waitlist/ungueltig"]);

export function isRetiredWaitlistPath(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return RETIRED_WAITLIST_PATHS.has(normalized);
}

/** The registration in the product app, in the language the visitor came with. */
export function waitlistSignupUrl(search: URLSearchParams | null = null) {
  const target = new URL("/signup", publicAppUrl());
  if (search?.get("lang") === "en") target.searchParams.set("lang", "en");
  return target;
}

/**
 * Answer for requests that used to create or confirm an entry. Nothing is written: the waitlist is
 * closed and there is no code path left that inserts into it.
 */
export function waitlistClosedResponse() {
  return NextResponse.json(
    {
      error: "The waitlist has ended. Please register instead. / Die Warteliste ist beendet. Bitte registriere dich stattdessen.",
      signup: waitlistSignupUrl().toString(),
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

/** Permanent redirect from an old waitlist link to the registration. */
export function waitlistSignupRedirect(request: Request) {
  return NextResponse.redirect(waitlistSignupUrl(new URL(request.url).searchParams), {
    status: 308,
    headers: { "Cache-Control": "no-store" },
  });
}
