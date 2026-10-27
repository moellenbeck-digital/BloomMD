import { describe, expect, test } from "bun:test";
import { accessLabel, draftFromRights, normalizeAreaName, rightsFromDraft, sameRights } from "./agent-rights-form";

describe("agent rights form", () => {
  test("a draft round-trips sub-areas and sorts them", () => {
    const draft = draftFromRights({ access: "propose", areas: { "Learnings/dev-team": "write", Arbeit: "read" } });
    expect(draft.rows.map((row) => row.area)).toEqual(["Arbeit", "Learnings/dev-team"]);
    expect(rightsFromDraft(draft)).toEqual({ access: "propose", areas: { Arbeit: "read", "Learnings/dev-team": "write" } });
  });

  test("area names are tidied and empty rows are ignored", () => {
    expect(normalizeAreaName(" Learnings / dev-team / ")).toBe("Learnings/dev-team");
    expect(rightsFromDraft({ access: "read", rows: [{ area: "  ", access: "write" }, { area: " Arbeit ", access: "propose" }] })).toEqual({ access: "read", areas: { Arbeit: "propose" } });
  });

  test("the same area twice is refused instead of silently keeping one right", () => {
    expect(() => rightsFromDraft({ access: "read", rows: [{ area: "Arbeit", access: "write" }, { area: "arbeit ", access: "read" }] })).toThrow("DUPLICATE_AREA:arbeit");
    expect(() => rightsFromDraft({ access: "read", rows: [{ area: "x".repeat(201), access: "read" }] })).toThrow("AREA_TOO_LONG");
  });

  test("rights compare by folded names", () => {
    expect(sameRights({ access: "read", areas: { Arbeit: "write" } }, { access: "read", areas: { " arbeit": "write" } })).toBe(true);
    expect(sameRights({ access: "read", areas: { Arbeit: "write" } }, { access: "read", areas: { Arbeit: "propose" } })).toBe(false);
    expect(sameRights({ access: "read", areas: {} }, { access: "write", areas: {} })).toBe(false);
  });

  test("levels have a label in both languages", () => {
    expect(accessLabel("propose", "de")).toBe("Vorschlagen");
    expect(accessLabel("write", "en")).toBe("Write directly");
  });
});
