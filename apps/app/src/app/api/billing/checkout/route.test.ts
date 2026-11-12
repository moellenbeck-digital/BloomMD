import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
let stripeCustomerId: string | null = null;
let upsertCalls = 0;

mock.module("../../../../lib/auth", () => ({
  getSession: async () => ({ provider: "password", userId: USER, email: "kunde@bloommd.test", name: "Kunde" }),
}));

mock.module("../../../../lib/db", () => ({
  consumeRateLimit: async () => null,
  isDatabaseConfigured: () => true,
  upsertMarketUser: async () => {
    upsertCalls += 1;
    return { id: USER, stripeCustomerId };
  },
}));

const { GET, POST } = await import("./route");

const ORIGIN = "https://app.bloommd.test";
const realFetch = globalThis.fetch;
let stripeRequests: Array<{ url: string; body: URLSearchParams }> = [];
let stripeStatus = 200;
let stripeJson: unknown = { url: "https://checkout.stripe.com/c/pay/cs_test_1" };

const checkout = (fields: Record<string, string>) =>
  POST(new Request(`${ORIGIN}/api/billing/checkout`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  }));

const location = (response: Response) => new URL(response.headers.get("location") ?? "", ORIGIN);

describe("POST /api/billing/checkout (#379)", () => {
  beforeEach(() => {
    stripeCustomerId = null;
    upsertCalls = 0;
    stripeRequests = [];
    stripeStatus = 200;
    stripeJson = { url: "https://checkout.stripe.com/c/pay/cs_test_1" };
    process.env.BLOOMMD_BILLING_ENABLED = "1";
    process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_PRICE_CLOUD_MONTHLY = "price_monthly";
    process.env.STRIPE_PRICE_CLOUD_ANNUAL = "price_annual";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      stripeRequests.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")) });
      return new Response(JSON.stringify(stripeJson), { status: stripeStatus, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const key of ["BLOOMMD_BILLING_ENABLED", "NEXT_PUBLIC_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_PRICE_CLOUD_MONTHLY", "STRIPE_PRICE_CLOUD_ANNUAL"]) {
      delete process.env[key];
    }
  });

  test("stays a 404 for GET and POST without BLOOMMD_BILLING_ENABLED=1", async () => {
    delete process.env.BLOOMMD_BILLING_ENABLED;
    expect(GET().status).toBe(404);
    expect((await checkout({ tier: "cloud", interval: "monthly" })).status).toBe(404);
    expect(stripeRequests).toEqual([]);
    expect(upsertCalls).toBe(0);
  });

  test("monthly: a subscription with the monthly price, address, tax id and automatic tax", async () => {
    const response = await checkout({ tier: "cloud", interval: "monthly" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_test_1");

    expect(stripeRequests).toHaveLength(1);
    const { url, body } = stripeRequests[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_monthly");
    expect(body.get("line_items[0][quantity]")).toBe("1");
    expect(body.get("billing_address_collection")).toBe("required");
    expect(body.get("tax_id_collection[enabled]")).toBe("true");
    expect(body.get("automatic_tax[enabled]")).toBe("true");
    expect(body.get("allow_promotion_codes")).toBe("false");
    expect(body.get("client_reference_id")).toBe(USER);
    expect(body.get("customer_email")).toBe("kunde@bloommd.test");
    expect(body.has("customer")).toBe(false);
    expect(body.has("customer_update[name]")).toBe(false);
    expect(body.has("customer_update[address]")).toBe(false);
  });

  test("annual: the annual price", async () => {
    expect((await checkout({ tier: "cloud", interval: "annual" })).status).toBe(303);
    expect(stripeRequests[0]!.body.get("line_items[0][price]")).toBe("price_annual");
    expect(stripeRequests[0]!.body.get("mode")).toBe("subscription");
  });

  test("tier and interval are on the session and on the subscription", async () => {
    await checkout({ tier: "cloud", interval: "annual" });
    const { body } = stripeRequests[0]!;
    expect(body.get("metadata[tier]")).toBe("cloud");
    expect(body.get("metadata[interval]")).toBe("annual");
    expect(body.get("metadata[app_user_id]")).toBe(USER);
    expect(body.get("subscription_data[metadata][tier]")).toBe("cloud");
    expect(body.get("subscription_data[metadata][interval]")).toBe("annual");
    expect(body.get("subscription_data[metadata][app_user_id]")).toBe(USER);
    // The one-time payment branch is gone.
    expect([...body.keys()].filter((key) => key.startsWith("payment_intent_data"))).toEqual([]);
  });

  test("an existing customer is reused and gets name and address updated from the checkout", async () => {
    stripeCustomerId = "cus_existing";
    await checkout({ tier: "cloud", interval: "monthly" });
    const { body } = stripeRequests[0]!;
    expect(body.get("customer")).toBe("cus_existing");
    expect(body.get("customer_update[name]")).toBe("auto");
    expect(body.get("customer_update[address]")).toBe("auto");
    expect(body.has("customer_email")).toBe(false);
  });

  test("a missing or unknown interval or tier ends in unknown-plan, without a Stripe call", async () => {
    const cases: Array<Record<string, string>> = [
      { tier: "cloud" },
      { tier: "cloud", interval: "" },
      { tier: "cloud", interval: "yearly" },
      { tier: "cloud", interval: "lifetime" },
      { interval: "monthly" },
      { tier: "pro-monthly", interval: "monthly" },
      { tier: "lifetime", interval: "annual" },
      { tier: "sync-monthly", interval: "monthly" },
    ];
    for (const fields of cases) {
      const response = await checkout(fields);
      expect(response.status, JSON.stringify(fields)).toBe(303);
      expect(location(response).searchParams.get("billing"), JSON.stringify(fields)).toBe("unknown-plan");
    }
    expect(stripeRequests).toEqual([]);
    expect(upsertCalls).toBe(0);
  });

  test("fails closed: a missing price id or secret key never calls Stripe", async () => {
    delete process.env.STRIPE_PRICE_CLOUD_ANNUAL;
    let response = await checkout({ tier: "cloud", interval: "annual" });
    expect(location(response).searchParams.get("billing")).toBe("not-configured");

    delete process.env.STRIPE_SECRET_KEY;
    response = await checkout({ tier: "cloud", interval: "monthly" });
    expect(location(response).searchParams.get("billing")).toBe("not-configured");
    expect(stripeRequests).toEqual([]);
  });

  test("fails closed: a Stripe error or a response without a URL ends on the pricing page", async () => {
    stripeStatus = 500;
    stripeJson = { error: { message: "boom" } };
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(location(await checkout({ tier: "cloud", interval: "monthly" })).searchParams.get("billing")).toBe("stripe-error");
    } finally {
      console.error = originalError;
    }

    stripeStatus = 200;
    stripeJson = {};
    expect(location(await checkout({ tier: "cloud", interval: "monthly" })).searchParams.get("billing")).toBe("stripe-missing-url");
  });

  test("refuses a foreign origin", async () => {
    const response = await POST(new Request(`${ORIGIN}/api/billing/checkout`, {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" },
      body: "tier=cloud&interval=monthly",
    }));
    expect(response.status).toBe(403);
    expect(stripeRequests).toEqual([]);
  });
});
