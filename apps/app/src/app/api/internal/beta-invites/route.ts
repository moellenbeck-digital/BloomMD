import { NextResponse } from "next/server";
import { isInternalInviteRequestAuthorized, internalInviteUnauthorizedResponse } from "../../../../lib/internal-api-auth";
import { createBetaInvite } from "../../../../lib/db";
import { sendBetaInviteEmail } from "../../../../lib/email";

export const dynamic = "force-dynamic";

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(email)) throw new Error("invalid-email");
  return email;
}

export async function POST(request: Request) {
  if (!isInternalInviteRequestAuthorized(request)) return internalInviteUnauthorizedResponse();

  try {
    const body = await request.json() as {
      email?: unknown;
      source?: unknown;
      note?: unknown;
      batchId?: unknown;
      expiresAt?: unknown;
      sendEmail?: unknown;
      forceSendEmail?: unknown;
      lang?: unknown;
    };
    const email = normalizeEmail(body.email);
    const result = await createBetaInvite({
      email,
      source: String(body.source || "manual").slice(0, 64),
      note: body.note ? String(body.note).slice(0, 500) : null,
      batchId: body.batchId ? String(body.batchId).slice(0, 120) : null,
      expiresAt: body.expiresAt ? String(body.expiresAt) : null,
    });
    const shouldSendEmail = result.shouldSendEmail || (body.forceSendEmail === true && result.invite.status === "invited");
    const mail = body.sendEmail === false
      ? { sent: false as const, reason: "disabled" as const }
      : shouldSendEmail
        ? await sendBetaInviteEmail(email, { lang: body.lang === "en" ? "en" : "de" })
        : { sent: false as const, reason: "already-invited" as const };
    return NextResponse.json({ invite: result.invite, mail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid-email") {
      return NextResponse.json({ error: "Invalid email." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[BloomMD] Internal beta invite failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Invite failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
