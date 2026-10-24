import { NextResponse } from "next/server";
import { isInternalInviteRequestAuthorized, internalInviteUnauthorizedResponse } from "../../../../../lib/internal-api-auth";
import { listBetaInviteStatuses, type BetaInviteStatus } from "../../../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isInternalInviteRequestAuthorized(request)) return internalInviteUnauthorizedResponse();

  try {
    const body = await request.json() as { emails?: unknown };
    const emails = Array.isArray(body.emails)
      ? body.emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean).slice(0, 500)
      : [];
    const statuses = await listBetaInviteStatuses(emails);
    const entries = emails.map((email) => {
      const status: BetaInviteStatus = statuses.get(email) ?? "none";
      return { email, status };
    });
    return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[BloomMD] Internal beta invite statuses failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Invite status lookup failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
