import { NextResponse } from "next/server";
import { assertSameOrigin, RequestSecurityError } from "../../../../lib/request-security";
import { waitlistAdminActionRedirectPath } from "../../../../lib/waitlist-admin";
import { deleteWaitlistEntry } from "../../../../lib/waitlist-admin-actions";

export const dynamic = "force-dynamic";

function adminRedirect(request: Request, formData: FormData, result: Parameters<typeof waitlistAdminActionRedirectPath>[1]) {
  return NextResponse.redirect(new URL(waitlistAdminActionRedirectPath(formData, result), request.url), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  formData.set("intent", "delete");

  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof RequestSecurityError) return adminRedirect(request, formData, { ok: false, error: "invalid-origin" });
    throw error;
  }

  const result = await deleteWaitlistEntry(formData.get("email"), formData.get("confirm"));
  return adminRedirect(request, formData, result);
}
