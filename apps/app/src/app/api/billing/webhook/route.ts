import { NextResponse } from "next/server";
import { isBillingEnabled } from "../../../../lib/billing";
import { verifyStripeSignature } from "../../../../lib/stripe-signature";
import { readTextBody, RequestSecurityError } from "../../../../lib/request-security";
import {
  completeStripeEvent,
  isDatabaseConfigured,
  recordStripeEvent,
  recordStripeSubscription,
  releaseStripeEvent,
  updateStripeCustomer,
} from "../../../../lib/db";

export const runtime = "nodejs";

export function GET() {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: "Billing is disabled during the BloomMD beta." }, { status: 404 });
  }
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
}

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export async function POST(request: Request) {
  // No checkout can be started while billing is disabled, so there is no legitimate event to
  // process. 404 rather than 503 so Stripe stops retrying instead of queueing forever.
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: "Billing is disabled during the BloomMD beta." }, { status: 404 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let payload: string;
  try {
    payload = await readTextBody(request, 1024 * 1024);
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Billing database is not configured" }, { status: 503 });
  }

  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), webhookSecret)) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  let event: StripeWebhookEvent;

  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!event?.id || !event.type || !event.data?.object || typeof event.data.object !== "object") {
    return NextResponse.json({ error: "Invalid Stripe event" }, { status: 400 });
  }

  const objectId = typeof event.data.object.id === "string" ? event.data.object.id : null;
  const shouldProcess = await recordStripeEvent({
    id: event.id,
    type: event.type,
    payload: { id: event.id, type: event.type, objectId },
  });
  if (!shouldProcess) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as {
        id: string;
        mode?: "payment" | "subscription";
        payment_status?: string;
        status?: string;
        customer?: string;
        subscription?: string;
        metadata?: { tier?: string; app_user_id?: string };
      };
      const userId = session.metadata?.app_user_id;
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
      if (userId && stripeCustomerId) {
        await updateStripeCustomer(userId, stripeCustomerId);
      }
      await recordStripeSubscription({
        userId,
        tier: session.metadata?.tier ?? "unknown",
        status: session.payment_status ?? session.status ?? "complete",
        mode: session.mode ?? "payment",
        stripeCustomerId,
        stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
        stripeCheckoutSessionId: session.id,
        raw: {
          checkoutSessionId: session.id,
          paymentStatus: session.payment_status ?? null,
          status: session.status ?? null,
        },
      });
      console.log("[BloomMD] Stripe checkout completed:", event.id);
        break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as {
        id: string;
        customer?: string;
        status?: string;
        current_period_end?: number;
        cancel_at_period_end?: boolean;
        metadata?: { tier?: string; app_user_id?: string };
      };
      await recordStripeSubscription({
        userId: subscription.metadata?.app_user_id,
        tier: subscription.metadata?.tier ?? "unknown",
        status: subscription.status ?? "unknown",
        mode: "subscription",
        stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        raw: {
          subscriptionId: subscription.id,
          status: subscription.status ?? null,
          currentPeriodEnd: subscription.current_period_end ?? null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
        },
      });
      console.log("[BloomMD] Stripe event received:", event.type, event.id);
        break;
    }
    default:
        console.log("[BloomMD] Stripe event ignored:", event.type, event.id);
    }
    await completeStripeEvent(event.id);
  } catch (error) {
    await releaseStripeEvent(event.id, error instanceof Error ? error.name : "processing-error");
    console.error("[BloomMD] Stripe webhook processing failed:", event.id, error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Stripe event processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
