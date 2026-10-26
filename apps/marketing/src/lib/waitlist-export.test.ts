import { describe, expect, test } from "bun:test";
import { formatWaitlistExportSummary, summarizeWaitlistExport, waitlistEntriesToExportCsv } from "./waitlist-export";
import type { WaitlistAdminEntry } from "./waitlist-db";

const entries: WaitlistAdminEntry[] = [
  {
    email: "confirmed@example.test",
    status: "confirmed",
    createdAt: "2026-08-01T09:00:00.000Z",
    confirmedAt: "2026-08-01T10:00:00.000Z",
    unsubscribedAt: null,
    invitedAt: null,
    source: "landing",
  },
  {
    email: "pending@example.test",
    status: "pending",
    createdAt: "2026-08-02T09:00:00.000Z",
    confirmedAt: null,
    unsubscribedAt: null,
    invitedAt: null,
    source: null,
  },
  {
    // Confirmed first, unsubscribed later: unsubscribed wins, like in `count`.
    email: "left@example.test",
    status: "unsubscribed",
    createdAt: "2026-08-03T09:00:00.000Z",
    confirmedAt: "2026-08-03T09:30:00.000Z",
    unsubscribedAt: "2026-08-04T10:00:00.000Z",
    invitedAt: null,
    source: "landing-en",
  },
];

describe("waitlist export", () => {
  test("writes email, status, time and source per entry", () => {
    expect(waitlistEntriesToExportCsv(entries)).toBe(
      [
        "email,status,zeitpunkt,quelle",
        "confirmed@example.test,bestätigt,2026-08-01T10:00:00.000Z,landing",
        "pending@example.test,offen,2026-08-02T09:00:00.000Z,",
        "left@example.test,abgemeldet,2026-08-04T10:00:00.000Z,landing-en",
        "",
      ].join("\n"),
    );
  });

  test("the summary counts all entries and the confirmed ones, as `count` does", () => {
    const summary = summarizeWaitlistExport(entries);
    expect(summary).toEqual({ total: 3, confirmed: 1 });
    expect(formatWaitlistExportSummary(summary)).toBe("3 Einträge, davon bestätigt 1");
  });

  test("an empty list still has a header and a summary", () => {
    expect(waitlistEntriesToExportCsv([])).toBe("email,status,zeitpunkt,quelle\n");
    expect(formatWaitlistExportSummary(summarizeWaitlistExport([]))).toBe("0 Einträge, davon bestätigt 0");
  });

  test("quotes cells with commas and neutralizes spreadsheet formulas from the visitor-typed source", () => {
    const csv = waitlistEntriesToExportCsv([
      { ...entries[0]!, source: '=HYPERLINK("http://evil.example","x")' },
      { ...entries[1]!, source: "a,b" },
    ]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[1]).toBe("confirmed@example.test,bestätigt,2026-08-01T10:00:00.000Z,\"'=HYPERLINK(\"\"http://evil.example\"\",\"\"x\"\")\"");
    expect(lines[2]).toBe('pending@example.test,offen,2026-08-02T09:00:00.000Z,"a,b"');
  });
});
