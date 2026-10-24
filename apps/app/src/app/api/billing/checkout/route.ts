import { NextResponse } from "next/server";
import { getBillingPlan, getSiteUrl, isBillingEnabled } from "../../../../lib/billing";
import { getSession } from "../../../../lib/auth";
import { isDatabaseConfigured, upsertMarketUser } from "../../../../lib/db";
import { assertSameOrigin, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

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

  let form: URLSearchParams;
  try {
    assertSameOrigin(request);
    form = await readUrlEncodedForm(request);
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const plan = getBillingPlan(String(form.get("tier") || ""));
  const siteUrl = getSiteUrl();

  if (!plan) {
    return NextResponse.redirect(new URL("/?billing=unknown-plan#pricing", siteUrl), 303);
  }

  const session = await getSession();
  if (!session) {
    const error = encodeURIComponent("Bitte melde dich an, bevor du einen Plan buchst.");
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/#pricing")}&error=${error}`, siteUrl), 303);
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.redirect(new URL(`/?billing=database-not-configured&tier=${plan.tier}#pricing`, siteUrl), 303);
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env[plan.envKey];

  if (!stripeSecretKey || !priceId) {
    return NextResponse.redirect(new URL(`/?billing=not-configured&tier=${plan.tier}#pricing`, siteUrl), 303);
  }

  const marketUser = await upsertMarketUser({
    provider: session.provider,
    authUserId: session.userId ?? session.email,
    email: session.email,
    name: session.name,
  });

  if (!marketUser) {
    return NextResponse.redirect(new URL(`/?billing=user-not-created&tier=${plan.tier}#pricing`, siteUrl), 303);
  }

  const appUserId = marketUser.id;
  const body = new URLSearchParams({
    mode: plan.mode,
    success_url: `${siteUrl}/app?checkout=success&tier=${encodeURIComponent(plan.tier)}`,
    cancel_url: `${siteUrl}/?checkout=cancelled#pricing`,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    allow_promotion_codes: "true",
    "automatic_tax[enabled]": "true",
    client_reference_id: appUserId,
    "metadata[tier]": plan.tier,
    "metadata[app_user_id]": appUserId,
  });

  if (marketUser.stripeCustomerId) {
    body.set("customer", marketUser.stripeCustomerId);
  } else {
    body.set("customer_email", session.email);
  }

  if (plan.mode === "subscription") {
    body.set("subscription_data[metadata][tier]", plan.tier);
    body.set("subscription_data[metadata][app_user_id]", appUserId);
  } else {
    body.set("payment_intent_data[metadata][tier]", plan.tier);
    body.set("payment_intent_data[metadata][app_user_id]", appUserId);
  }

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!stripeResponse.ok) {
    console.error("[BloomMD] Stripe checkout failed with status:", stripeResponse.status);
    return NextResponse.redirect(new URL(`/?billing=stripe-error&tier=${plan.tier}#pricing`, siteUrl), 303);
  }

  const checkoutSession = (await stripeResponse.json()) as { url?: string };
  if (!checkoutSession.url) {
    return NextResponse.redirect(new URL(`/?billing=stripe-missing-url&tier=${plan.tier}#pricing`, siteUrl), 303);
  }

  return NextResponse.redirect(checkoutSession.url, 303);
}
