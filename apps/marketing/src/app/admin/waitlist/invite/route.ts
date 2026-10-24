import { NextResponse } from "next/server";
import { assertSameOrigin, RequestSecurityError } from "../../../../lib/request-security";
import { waitlistAdminActionRedirectPath } from "../../../../lib/waitlist-admin";
import { inviteWaitlistEntry } from "../../../../lib/waitlist-admin-actions";
import { getMarketingLocale } from "../../../../lib/locale";

export const dynamic = "force-dynamic";

function legacyRouteResult(result: Awaited<ReturnType<typeof inviteWaitlistEntry>>) {
  if (result.ok || result.error !== "invite-server-error") return result;
  return { ...result, error: "invite-failed" as const };
}

function adminRedirect(request: Request, formData: FormData, result: Parameters<typeof waitlistAdminActionRedirectPath>[1]) {
  return NextResponse.redirect(new URL(waitlistAdminActionRedirectPath(formData, result), request.url), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  formData.set("intent", "invite");

  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof RequestSecurityError) return adminRedirect(request, formData, { ok: false, error: "invalid-origin" });
    throw error;
  }

  const result = legacyRouteResult(await inviteWaitlistEntry(formData.get("email"), formData.get("mode") ?? "invite", getMarketingLocale(String(formData.get("lang") || "de"))));
  return adminRedirect(request, formData, result);
}
