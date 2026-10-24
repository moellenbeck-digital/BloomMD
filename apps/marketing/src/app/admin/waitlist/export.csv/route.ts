import { NextResponse } from "next/server";
import { waitlistEntriesToCsv } from "../../../../lib/waitlist-admin";
import { isWaitlistConfigured, listConfirmedWaitlist } from "../../../../lib/waitlist-db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWaitlistConfigured()) {
    return NextResponse.json(
      { error: "BLOOMMD_WAITLIST_DATABASE_URL is not configured." },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" } },
    );
  }

  const csv = waitlistEntriesToCsv(await listConfirmedWaitlist());
  return new NextResponse(csv, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": "attachment; filename=\"bloommd-waitlist-confirmed.csv\"",
      "Content-Type": "text/csv; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
