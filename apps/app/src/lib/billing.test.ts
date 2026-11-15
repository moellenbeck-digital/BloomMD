import { describe, expect, test } from "bun:test";
import { billingIntervals, billingPlans, getBillingInterval, getBillingPlan, landingPlans } from "./billing";

describe("billing plans (#379)", () => {
  test("there is exactly one plan, Cloud, billed as a subscription", () => {
    expect(Object.keys(billingPlans)).toEqual(["cloud"]);
    expect(billingPlans.cloud.name).toBe("Cloud");
    expect(billingPlans.cloud.mode).toBe("subscription");
  });

  test("monthly costs 6 EUR, annual 60 EUR, each with its own price id key", () => {
    const { monthly, annual } = billingPlans.cloud.intervals;
    expect([monthly.price, monthly.cadence, monthly.envKey]).toEqual(["6 EUR", "pro Monat", "STRIPE_PRICE_CLOUD_MONTHLY"]);
    expect([annual.price, annual.cadence, annual.envKey]).toEqual(["60 EUR", "pro Jahr", "STRIPE_PRICE_CLOUD_ANNUAL"]);
    expect([...billingIntervals]).toEqual(["monthly", "annual"]);
  });

  test("the landing page lists Free and Cloud, nothing else", () => {
    expect(landingPlans.map((plan) => ("id" in plan ? plan.id : plan.tier))).toEqual(["free", "cloud"]);
  });

  test("getBillingPlan resolves only cloud; legacy and unknown tiers stay unknown", () => {
    expect(getBillingPlan("cloud")?.name).toBe("Cloud");
    for (const tier of ["pro-monthly", "pro-annual", "lifetime", "sync-monthly", "Cloud", "", "unknown", null]) {
      expect(getBillingPlan(tier)).toBeNull();
    }
  });

  test("getBillingInterval accepts monthly and annual only", () => {
    expect(getBillingInterval("monthly")).toBe("monthly");
    expect(getBillingInterval("annual")).toBe("annual");
    for (const interval of ["yearly", "Monthly", "", "lifetime", null]) {
      expect(getBillingInterval(interval)).toBeNull();
    }
  });
});
