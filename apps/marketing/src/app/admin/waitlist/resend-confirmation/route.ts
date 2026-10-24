import { NextResponse } from "next/server";
import { assertSameOrigin, RequestSecurityError } from "../../../../lib/request-security";
import { waitlistAdminActionRedirectPath } from "../../../../lib/waitlist-admin";
import { resendWaitlistConfirmation } from "../../../../lib/waitlist-admin-actions";

export const dynamic = "force-dynamic";

function legacyRouteResult(result: Awaited<ReturnType<typeof resendWaitlistConfirmation>>) {
  if (result.ok || result.error !== "server-error") return result;
  return { ...result, error: "resend-failed" as const };
}

function adminRedirect(request: Request, formData: FormData, result: Parameters<typeof waitlistAdminActionRedirectPath>[1]) {
  return NextResponse.redirect(new URL(waitlistAdminActionRedirectPath(formData, result), request.url), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  formData.set("intent", "resend-confirmation");

  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof RequestSecurityError) return adminRedirect(request, formData, { ok: false, error: "invalid-origin" });
    throw error;
  }

  const result = legacyRouteResult(await resendWaitlistConfirmation(formData.get("email")));
  return adminRedirect(request, formData, result);
}
