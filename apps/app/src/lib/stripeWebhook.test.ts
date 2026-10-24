import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { verifyStripeSignature } from "./stripe-signature";

describe("Stripe webhook signatures", () => {
  test("accepts a current valid v1 signature", () => {
    const now = 1_800_000_000_000;
    const timestamp = Math.floor(now / 1000);
    const payload = JSON.stringify({ id: "evt_test" });
    const secret = "whsec_test";
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, now)).toBe(true);
  });

  test("rejects stale, malformed, and incorrect signatures", () => {
    const now = 1_800_000_000_000;
    const payload = "{}";
    const oldTimestamp = Math.floor(now / 1000) - 301;
    const signature = createHmac("sha256", "secret").update(`${oldTimestamp}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${oldTimestamp},v1=${signature}`, "secret", now)).toBe(false);
    expect(verifyStripeSignature(payload, "invalid", "secret", now)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${Math.floor(now / 1000)},v1=00`, "secret", now)).toBe(false);
  });
});
