import { describe, expect, test } from "bun:test";
import { isTrialGuardedWrite, isTrialReadonlyEnabled, trialExpiredMessage, trialRequestLocale } from "./trial-readonly";

describe("trial read-only switch (#274)", () => {
  test("is off unless exactly 1", () => {
    expect(isTrialReadonlyEnabled({})).toBe(false);
    expect(isTrialReadonlyEnabled({ BLOOMMD_TRIAL_READONLY: "" })).toBe(false);
    expect(isTrialReadonlyEnabled({ BLOOMMD_TRIAL_READONLY: "0" })).toBe(false);
    expect(isTrialReadonlyEnabled({ BLOOMMD_TRIAL_READONLY: "true" })).toBe(false);
    expect(isTrialReadonlyEnabled({ BLOOMMD_TRIAL_READONLY: "1" })).toBe(true);
  });

  test("the refusal is clear in both languages", () => {
    expect(trialExpiredMessage("de")).toContain("Testzeitraum ist abgelaufen");
    expect(trialExpiredMessage("de")).toContain("nur noch lesbar");
    expect(trialExpiredMessage("en")).toContain("trial period has ended");
    expect(trialExpiredMessage("en")).toContain("read-only");
  });

  test("the language comes from ?lang, else from the browser", () => {
    const request = (url: string, acceptLanguage?: string) => new Request(url, { headers: acceptLanguage ? { "Accept-Language": acceptLanguage } : {} });
    expect(trialRequestLocale(request("https://app.test/api/x?lang=en"))).toBe("en");
    expect(trialRequestLocale(request("https://app.test/api/x?lang=de", "en-US"))).toBe("de");
    expect(trialRequestLocale(request("https://app.test/api/x", "en-US,en;q=0.9"))).toBe("en");
    expect(trialRequestLocale(request("https://app.test/api/x", "de-DE,de;q=0.9,en;q=0.5"))).toBe("de");
    expect(trialRequestLocale(request("https://app.test/api/x"))).toBe("de");
  });
});

describe("which requests the read-only mode guards (#274)", () => {
  test("reading and the export are never guarded", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(isTrialGuardedWrite(method, "/api/mindmaps")).toBe(false);
      expect(isTrialGuardedWrite(method, "/api/account/export")).toBe(false);
    }
  });

  test("writes to documents, workspaces, sync-adjacent routes and API tokens are guarded", () => {
    for (const [method, path] of [
      ["POST", "/api/mindmaps"],
      ["PUT", "/api/mindmaps/plan.md"],
      ["PATCH", "/api/mindmaps/plan.md/nodes/n1"],
      ["DELETE", "/api/mindmaps/plan.md"],
      ["POST", "/api/mindmaps/plan.md/share-links"],
      ["POST", "/api/workspaces"],
      ["POST", "/api/workspaces/abc/invitations"],
      ["DELETE", "/api/workspaces/abc/members/def"],
      ["POST", "/api/workspaces/abc/agents"],
      ["POST", "/api/account/access-tokens"],
      ["POST", "/api/workspace-invitations/token/accept"],
      ["POST", "/api/wiki/proposals/1/approve"],
      // A write route nobody listed is guarded by default.
      ["POST", "/api/some/new/route"],
    ] as const) {
      expect([method, path, isTrialGuardedWrite(method, path)]).toEqual([method, path, true]);
    }
  });

  test("signing in, billing, feedback, leaving, revoking a token and deleting the account stay possible", () => {
    for (const [method, path] of [
      ["POST", "/api/auth/login"],
      ["POST", "/api/auth/logout"],
      ["POST", "/api/mobile/token"],
      ["POST", "/api/billing/portal"],
      ["POST", "/api/billing/webhook"],
      ["POST", "/api/internal/beta-invites"],
      ["POST", "/api/feedback"],
      ["POST", "/api/account/delete"],
      ["POST", "/api/sync-ticket"],
      ["POST", "/api/workspaces/abc/leave"],
      ["DELETE", "/api/account/access-tokens"],
      ["POST", "/api/link-preview"],
    ] as const) {
      expect([method, path, isTrialGuardedWrite(method, path)]).toEqual([method, path, false]);
    }
  });

  test("pages are not API writes", () => {
    expect(isTrialGuardedWrite("POST", "/account")).toBe(false);
    expect(isTrialGuardedWrite("POST", "/apiary")).toBe(false);
  });
});
