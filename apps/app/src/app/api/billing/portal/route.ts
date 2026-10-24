import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { getSiteUrl, isBillingEnabled } from "../../../../lib/billing";
import { getMarketAccountByEmail, isDatabaseConfigured } from "../../../../lib/db";
import { assertSameOrigin, RequestSecurityError } from "../../../../lib/request-security";

export function GET() {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: "Billing is disabled during the BloomMD beta." }, { status: 404 });
  }
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request) {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: "Billing is disabled during the BloomMD beta." }, { status: 404 });
  }

  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const siteUrl = getSiteUrl();

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/account")}`, siteUrl), 303);
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.redirect(new URL("/account?billing=database-not-configured", siteUrl), 303);
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.redirect(new URL("/account?billing=not-configured", siteUrl), 303);
  }

  const account = await getMarketAccountByEmail(session.email);
  const stripeCustomerId = account?.user.stripeCustomerId;
  if (!stripeCustomerId) {
    return NextResponse.redirect(new URL("/account?billing=no-stripe-customer", siteUrl), 303);
  }

  const body = new URLSearchParams({
    customer: stripeCustomerId,
    return_url: `${siteUrl}/account`,
  });

  const stripeResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!stripeResponse.ok) {
    console.error("[BloomMD] Stripe billing portal failed with status:", stripeResponse.status);
    return NextResponse.redirect(new URL("/account?billing=portal-error", siteUrl), 303);
  }

  const portalSession = (await stripeResponse.json()) as { url?: string };
  if (!portalSession.url) {
    return NextResponse.redirect(new URL("/account?billing=portal-missing-url", siteUrl), 303);
  }

  return NextResponse.redirect(portalSession.url, 303);
}
