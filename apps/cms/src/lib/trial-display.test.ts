import { describe, expect, test } from "bun:test";
import { trialSummary } from "./trial-display";

const now = new Date("2026-11-15T12:00:00.000Z");

describe("trialSummary", () => {
  test("no value or a broken value shows a dash", () => {
    expect(trialSummary(null, now)).toEqual({ text: "–", state: "none" });
    expect(trialSummary(undefined, now)).toEqual({ text: "–", state: "none" });
    expect(trialSummary("not a date", now)).toEqual({ text: "–", state: "none" });
  });

  test("a running trial shows the date in Berlin time and the days left, rounded up", () => {
    expect(trialSummary("2026-12-15T00:00:00.000Z", now)).toEqual({ text: "15.12.2026 (noch 30 Tage)", state: "running" });
    expect(trialSummary("2026-11-17T11:00:00.000Z", now).text).toBe("17.11.2026 (noch 2 Tage)");
    expect(trialSummary("2026-11-16T13:00:00.000Z", now).text).toBe("16.11.2026 (noch 2 Tage)");
  });

  test("the date is the one of Berlin, not of UTC", () => {
    expect(trialSummary("2026-12-14T23:30:00.000Z", now).text.startsWith("15.12.2026")).toBe(true);
  });

  test("less than a day left and the moment of the end", () => {
    expect(trialSummary("2026-11-16T11:59:00.000Z", now)).toEqual({ text: "16.11.2026 (endet in weniger als einem Tag)", state: "ends_today" });
    expect(trialSummary("2026-11-15T12:00:00.000Z", now)).toEqual({ text: "15.11.2026 (heute abgelaufen)", state: "ended" });
  });

  test("an ended trial shows how long ago", () => {
    expect(trialSummary("2026-11-14T11:00:00.000Z", now)).toEqual({ text: "14.11.2026 (abgelaufen vor 1 Tag)", state: "ended" });
    expect(trialSummary("2026-11-05T12:00:00.000Z", now).text).toBe("05.11.2026 (abgelaufen vor 10 Tagen)");
  });
});
