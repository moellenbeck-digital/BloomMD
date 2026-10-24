"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isWaitlistAdminAuthorized } from "../../../lib/waitlist-admin-auth";
import { waitlistAdminActionRedirectPath } from "../../../lib/waitlist-admin";
import { getMarketingLocale } from "../../../lib/locale";
import {
  deleteWaitlistEntry,
  inviteWaitlistEntry,
  resendWaitlistConfirmation,
} from "../../../lib/waitlist-admin-actions";

type ActionSecurityError = "invalid-origin" | "admin-session";

function actionOriginIsAllowed(requestHeaders: Headers) {
  const origin = requestHeaders.get("origin");
  if (!origin) return true;

  const configuredSiteOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSiteOrigin) {
    try {
      if (new URL(configuredSiteOrigin).origin === origin) return true;
    } catch {
      // Production configuration validation reports malformed site URLs.
    }
  }

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return false;
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",", 1)[0]?.trim() || "https";
  return `${protocol}://${host}` === origin;
}

async function securityResult(): Promise<ActionSecurityError | null> {
  const requestHeaders = await headers();
  if (!actionOriginIsAllowed(requestHeaders)) return "invalid-origin";
  if (!isWaitlistAdminAuthorized(requestHeaders.get("authorization"))) return "admin-session";
  return null;
}

async function redirectActionResult(formData: FormData, result: Awaited<ReturnType<typeof inviteWaitlistEntry>>) {
  redirect(waitlistAdminActionRedirectPath(formData, result));
}

export async function inviteWaitlistAction(formData: FormData) {
  const securityError = await securityResult();
  if (securityError) {
    redirect(waitlistAdminActionRedirectPath(formData, { ok: false, error: securityError }));
  }

  const result = await inviteWaitlistEntry(formData.get("email"), formData.get("mode"), getMarketingLocale(String(formData.get("lang") || "de")));
  await redirectActionResult(formData, result);
}

export async function resendWaitlistConfirmationAction(formData: FormData) {
  const securityError = await securityResult();
  if (securityError) {
    redirect(waitlistAdminActionRedirectPath(formData, { ok: false, error: securityError }));
  }

  const result = await resendWaitlistConfirmation(formData.get("email"), getMarketingLocale(String(formData.get("lang") || "de")));
  await redirectActionResult(formData, result);
}

export async function deleteWaitlistEntryAction(formData: FormData) {
  const securityError = await securityResult();
  if (securityError) {
    redirect(waitlistAdminActionRedirectPath(formData, { ok: false, error: securityError }));
  }

  const result = await deleteWaitlistEntry(formData.get("email"), formData.get("confirm"));
  await redirectActionResult(formData, result);
}
