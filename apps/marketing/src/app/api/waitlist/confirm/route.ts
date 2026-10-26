import { waitlistClosedResponse, waitlistSignupRedirect } from "../../../../lib/waitlist-redirect";

export const dynamic = "force-dynamic";

/**
 * Confirmation links from old waitlist mails. Nothing is confirmed any more — the waitlist is
 * closed — so a click on such a link leads to the registration instead.
 */
export async function GET(request: Request) {
  return waitlistSignupRedirect(request);
}

export async function POST() {
  return waitlistClosedResponse();
}
