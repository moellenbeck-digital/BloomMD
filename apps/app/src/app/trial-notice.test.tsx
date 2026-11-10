import { afterEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const USER = "11111111-1111-4111-8111-111111111111";
const DAY = 24 * 60 * 60 * 1000;
let endsAt: string | null = null;

const realDb = await import("../lib/db");
mock.module("../lib/db", () => ({ ...realDb, getTrialEndsAt: async () => endsAt }));
const { TrialReadonlyNotice } = await import("./trial-notice");

const html = async (userId: string | undefined, locale: "de" | "en") => {
  const element = await TrialReadonlyNotice({ userId, locale });
  return element ? renderToStaticMarkup(element) : "";
};

describe("notice of the read-only mode (#274)", () => {
  afterEach(() => {
    delete process.env.BLOOMMD_TRIAL_READONLY;
    endsAt = null;
  });

  test("hidden without the switch, even for an expired account", async () => {
    endsAt = new Date(Date.now() - DAY).toISOString();
    expect(await html(USER, "de")).toBe("");
  });

  test("with the switch on and the trial over: banner in German and English", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    endsAt = new Date(Date.now() - DAY).toISOString();
    const de = await html(USER, "de");
    expect(de).toContain('data-testid="trial-expired-banner"');
    expect(de).toContain("Testzeitraum abgelaufen");
    expect(de).toContain("nur lesbar");
    expect(de).toContain("Export");
    const en = await html(USER, "en");
    expect(en).toContain("Trial period ended");
    expect(en).toContain("read-only");
  });

  test("hidden while the trial runs, without a trial end or without an account", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    endsAt = new Date(Date.now() + DAY).toISOString();
    expect(await html(USER, "de")).toBe("");
    endsAt = null;
    expect(await html(USER, "de")).toBe("");
    endsAt = new Date(Date.now() - DAY).toISOString();
    expect(await html(undefined, "de")).toBe("");
  });
});
