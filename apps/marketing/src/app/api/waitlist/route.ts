import { waitlistClosedResponse } from "../../../lib/waitlist-redirect";

export const dynamic = "force-dynamic";

/**
 * The waitlist is closed (registration replaced it). This endpoint stays only so old forms and
 * bookmarked clients get a clear answer instead of a 404 — it never writes anything.
 */
export async function POST() {
  return waitlistClosedResponse();
}
