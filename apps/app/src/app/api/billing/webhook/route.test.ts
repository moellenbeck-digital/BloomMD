import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
const SECRET = "whsec_test_379";

type Recorded = Record<string, unknown>;
let recorded: Recorded[] = [];
let customerUpdates: Array<[string, string]> = [];
let seen = new Set<string>();
let completed: string[] = [];
let released: string[] = [];
let failRecording = false;

mock.module("../../../../lib/db", () => ({
  consumeRateLimit: async () => null,
  isDatabaseConfigured: () => true,
  recordStripeEvent: async ({ id }: { id: string }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  },
  completeStripeEvent: async (id: string) => {
    completed.push(id);
  },
  releaseStripeEvent: async (id: string) => {
    released.push(id);
    seen.delete(id);
  },
  updateStripeCustomer: async (userId: string, customerId: string) => {
    customerUpdates.push([userId, customerId]);
  },
  recordStripeSubscription: async (input: Recorded) => {
    if (failRecording) throw new Error("db down");
    recorded.push(input);
  },
}));

const { GET, POST } = await import("./route");

function signed(event: unknown, secret = SECRET) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return new Request("https://app.bloommd.test/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

const metadata = { tier: "cloud", interval: "monthly", app_user_id: USER };
const periodEnd = 1_900_000_000;

describe("POST /api/billing/webhook for the Cloud plan (#379)", () => {
  beforeEach(() => {
    recorded = [];
    customerUpdates = [];
    seen = new Set();
    completed = [];
    released = [];
    failRecording = false;
    process.env.BLOOMMD_BILLING_ENABLED = "1";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  test("stays a 404 while billing is disabled", async () => {
    delete process.env.BLOOMMD_BILLING_ENABLED;
    expect(GET().status).toBe(404);
    expect((await POST(signed({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } }))).status).toBe(404);
    expect(recorded).toEqual([]);
  });

  test("rejects an unsigned or wrongly signed event without touching the database", async () => {
    const event = { id: "evt_bad", type: "checkout.session.completed", data: { object: { id: "cs_1", metadata } } };
    expect((await POST(signed(event, "whsec_other"))).status).toBe(400);
    expect((await POST(new Request("https://app.bloommd.test/api/billing/webhook", { method: "POST", body: JSON.stringify(event) }))).status).toBe(400);
    expect(recorded).toEqual([]);
    expect(seen.size).toBe(0);
  });

  test("checkout.session.completed records the Cloud subscription for the account", async () => {
    const response = await POST(signed({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", mode: "subscription", payment_status: "paid", status: "complete", customer: "cus_1", subscription: "sub_1", metadata } },
    }));
    expect(response.status).toBe(200);
    expect(customerUpdates).toEqual([[USER, "cus_1"]]);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      userId: USER,
      tier: "cloud",
      status: "paid",
      mode: "subscription",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      stripeCheckoutSessionId: "cs_1",
    });
    expect(completed).toEqual(["evt_checkout"]);
  });

  test("customer.subscription.created/updated carry the tier, the status and the period end", async () => {
    for (const [type, status, cancelAtPeriodEnd] of [
      ["customer.subscription.created", "active", false],
      ["customer.subscription.updated", "active", true],
      ["customer.subscription.updated", "past_due", false],
      ["customer.subscription.deleted", "canceled", false],
    ] as const) {
      const response = await POST(signed({
        id: `evt_${type}_${status}_${cancelAtPeriodEnd}`,
        type,
        data: { object: { id: "sub_1", customer: "cus_1", status, current_period_end: periodEnd, cancel_at_period_end: cancelAtPeriodEnd, metadata } },
      }));
      expect(response.status).toBe(200);
    }
    expect(recorded.map((entry) => [entry.tier, entry.status, entry.cancelAtPeriodEnd])).toEqual([
      ["cloud", "active", false],
      ["cloud", "active", true],
      ["cloud", "past_due", false],
      ["cloud", "canceled", false],
    ]);
    for (const entry of recorded) {
      expect(entry).toMatchObject({ userId: USER, mode: "subscription", stripeSubscriptionId: "sub_1", currentPeriodEnd: periodEnd });
    }
  });

  test("takes the period end from the subscription item when the subscription has none", async () => {
    await POST(signed({
      id: "evt_item_period",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_2", customer: "cus_2", status: "active", cancel_at_period_end: true, items: { data: [{ current_period_end: periodEnd }] }, metadata } },
    }));
    expect(recorded[0]).toMatchObject({ tier: "cloud", currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true });
  });

  test("a replayed event is acknowledged once and recorded once", async () => {
    const event = { id: "evt_dup", type: "customer.subscription.created", data: { object: { id: "sub_1", status: "active", metadata } } };
    expect((await POST(signed(event))).status).toBe(200);
    const again = await POST(signed(event));
    expect(await again.json()).toEqual({ received: true, duplicate: true });
    expect(recorded).toHaveLength(1);
  });

  test("a failing write releases the event so Stripe retries it", async () => {
    failRecording = true;
    const originalError = console.error;
    console.error = () => {};
    try {
      const response = await POST(signed({ id: "evt_fail", type: "customer.subscription.created", data: { object: { id: "sub_1", status: "active", metadata } } }));
      expect(response.status).toBe(500);
    } finally {
      console.error = originalError;
    }
    expect(released).toEqual(["evt_fail"]);
    expect(completed).toEqual([]);
  });
});
