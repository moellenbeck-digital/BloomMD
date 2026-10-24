import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LEARNING_SETTINGS,
  MAX_INTERVAL_DAYS,
  addDays,
  dayKey,
  daysBetween,
  emptyLearningFile,
  examPlan,
  learningFilePath,
  learningKey,
  levelOn,
  mergeLearningFiles,
  normalizeLearningSettings,
  parseLearningFile,
  rateEntry,
  serializeLearningFile,
  studyOrder,
  summarize,
  type LearningEntry,
  type LearningFile,
} from "./learning";

const settings = DEFAULT_LEARNING_SETTINGS;
const at = (day: string, time = "10:00:00") => new Date(`${day}T${time}`);
const entry = (level: number, due: string, lastReviewed = "2026-10-01T08:00:00.000Z", of: 3 | 5 = 3, streak = 0): LearningEntry =>
  ({ level, of, due, lastReviewed, streak });

describe("settings defaults", () => {
  test("three levels New / Unsure / Got it with 0, 1 and 4 days, spaced repetition on", () => {
    const normalized = normalizeLearningSettings(undefined);
    expect(normalized).toEqual(DEFAULT_LEARNING_SETTINGS);
    expect(normalized.names[3]).toEqual(["New", "Unsure", "Got it"]);
    expect(normalized.intervals[3]).toEqual([0, 1, 4]);
    expect(normalized.spacedRepetition).toBe(true);
    expect(normalized.order).toBe("due");
    expect(normalized.names[5]).toHaveLength(5);
    expect(normalized.colors[5]).toHaveLength(5);
  });

  test("keeps valid choices and repairs broken or missing ones level by level", () => {
    const normalized = normalizeLearningSettings({
      levels: 5,
      display: "fill",
      names: { 5: ["Nope", "", 3, "Ok"] },
      colors: { 3: ["#112233", "red"] },
      intervals: { 3: [0, -1, 9999] },
      growth: 0.5,
      order: "sideways",
    });
    expect(normalized.levels).toBe(5);
    expect(normalized.display).toBe("fill");
    expect(normalized.names[5]).toEqual(["Nope", "Hard", "Unsure", "Ok", "Got it"]);
    expect(normalized.colors[3]).toEqual(["#112233", "#f5a524", "#30a46c"]);
    expect(normalized.intervals[3]).toEqual([0, 1, 4]);
    expect(normalized.growth).toBe(2.5);
    expect(normalized.order).toBe("due");
  });

  test("normalizing does not share arrays with the defaults", () => {
    const normalized = normalizeLearningSettings({});
    normalized.names[3][0] = "changed";
    expect(DEFAULT_LEARNING_SETTINGS.names[3][0]).toBe("New");
  });
});

describe("days", () => {
  test("uses the local calendar day and counts across months", () => {
    expect(dayKey(at("2026-03-05", "23:30:00"))).toBe("2026-03-05");
    expect(addDays("2026-02-27", 3)).toBe("2026-03-02");
    expect(daysBetween("2026-10-10", "2026-10-24")).toBe(14);
    expect(daysBetween("2026-10-10", "2026-10-09")).toBe(-1);
  });
});

describe("scheduling", () => {
  test("each level has its interval; New stays due today", () => {
    const now = at("2026-10-10");
    expect(rateEntry(undefined, 0, settings, now)).toMatchObject({ level: 0, due: "2026-10-10", streak: 0 });
    expect(rateEntry(undefined, 1, settings, now)).toMatchObject({ level: 1, due: "2026-10-11", streak: 0 });
    expect(rateEntry(undefined, 2, settings, now)).toMatchObject({ level: 2, due: "2026-10-14", streak: 1 });
  });

  test("Got it again in a row grows the interval by the growth factor, a lower rating resets it", () => {
    let current = rateEntry(undefined, 2, settings, at("2026-10-10"));
    const intervals = [daysBetween("2026-10-10", current.due)];
    let day = current.due;
    for (let index = 0; index < 3; index += 1) {
      current = rateEntry(current, 2, settings, at(day));
      intervals.push(daysBetween(day, current.due));
      day = current.due;
    }
    expect(intervals).toEqual([4, 10, 25, 63]);
    expect(current.streak).toBe(4);
    const forgotten = rateEntry(current, 1, settings, at(day));
    expect(forgotten.streak).toBe(0);
    expect(daysBetween(day, forgotten.due)).toBe(1);
    expect(daysBetween(day, rateEntry(forgotten, 2, settings, at(day)).due)).toBe(4);
  });

  test("intervals are capped", () => {
    const long = { ...entry(2, "2026-10-10"), streak: 30 };
    const next = rateEntry(long, 2, settings, at("2026-10-10"));
    expect(daysBetween("2026-10-10", next.due)).toBe(MAX_INTERVAL_DAYS);
  });

  test("without spaced repetition every rating is due again right away", () => {
    const next = rateEntry(undefined, 2, { ...settings, spacedRepetition: false }, at("2026-10-10"));
    expect(next.due).toBe("2026-10-10");
  });

  test("ratings from another scale map onto the current one", () => {
    expect(levelOn(entry(2, "2026-10-10"), 5)).toBe(4);
    expect(levelOn(entry(1, "2026-10-10"), 5)).toBe(2);
    expect(levelOn(entry(4, "2026-10-10", undefined, 5), 3)).toBe(2);
    expect(levelOn(entry(1, "2026-10-10", undefined, 5), 3)).toBe(1);
    // A mastered node on 3 levels stays mastered after switching to 5: the streak continues.
    const next = rateEntry({ ...entry(2, "2026-10-10"), streak: 1 }, 4, { ...settings, levels: 5 }, at("2026-10-10"));
    expect(next.streak).toBe(2);
  });
});

describe("progress and sessions", () => {
  const entries: Record<string, LearningEntry> = {
    a: entry(2, "2026-10-20"),
    b: entry(1, "2026-10-09"),
    c: entry(0, "2026-10-10"),
    e: entry(2, "2026-10-01"),
  };
  const ids = ["a", "b", "c", "d", "e"];

  test("counts mastered, due and unsure nodes among the cards", () => {
    expect(summarize(ids, entries, 3, "2026-10-10")).toEqual({ total: 5, rated: 4, mastered: 2, due: 3, unsure: 2 });
    expect(summarize(ids, entries, 3, "2026-10-10", false).due).toBe(0);
  });

  test("study orders", () => {
    expect(studyOrder(ids, entries, 3, "2026-10-10", "map")).toEqual(ids);
    expect(studyOrder(ids, entries, 3, "2026-10-10", "due")).toEqual(["e", "b", "c", "d", "a"]);
    expect(studyOrder(ids, entries, 3, "2026-10-10", "onlyDue")).toEqual(["e", "b", "c"]);
    expect(studyOrder(ids, entries, 3, "2026-10-10", "onlyUnsure")).toEqual(["b", "c"]);
  });

  test("exam plan spreads what is not mastered over the days left, exam day included", () => {
    expect(examPlan("2026-10-14", "2026-10-10", 18)).toEqual({ daysLeft: 4, perDay: 4 });
    expect(examPlan("2026-10-10", "2026-10-10", 7)).toEqual({ daysLeft: 0, perDay: 7 });
    expect(examPlan("2026-10-01", "2026-10-10", 7)).toEqual({ daysLeft: -9, perDay: 0 });
    expect(examPlan(undefined, "2026-10-10", 7)).toBeNull();
  });
});

describe("storage", () => {
  test("keys a map by its BloomMD id, otherwise by a stable hash of its path", () => {
    expect(learningKey({ id: "a1b2c3d4", path: "Bio/Zelle.md" })).toBe("id-a1b2c3d4");
    const byPath = learningKey({ path: "Bio/Zelle.md" });
    expect(byPath).toMatch(/^path-[0-9a-z]+$/);
    expect(learningKey({ id: "../x", path: "Bio/Zelle.md" })).toBe(byPath);
    expect(learningKey({ id: 42, path: "Bio/Zelle.md" })).toBe(byPath);
    expect(learningKey({ path: "Bio/Zelle 2.md" })).not.toBe(byPath);
    // The same name in decomposed Unicode (as macOS may report it) is the same map.
    expect(learningKey({ path: "Bio/Übung.md" })).toBe(learningKey({ path: "Bio/Übung.md" }));
    expect(learningFilePath("id-a1b2c3d4")).toBe(".bloommd/learning/id-a1b2c3d4.json");
  });

  test("round-trips and reads broken files leniently", () => {
    const file: LearningFile = { format: 1, path: "Bio/Zelle.md", examDate: "2026-11-02", examUpdated: "2026-10-10T08:00:00.000Z", entries: { a1: entry(1, "2026-10-11") } };
    expect(parseLearningFile(serializeLearningFile(file))).toEqual(file);
    expect(parseLearningFile("{oops")).toEqual(emptyLearningFile());
    expect(parseLearningFile(null)).toEqual(emptyLearningFile());
    const lenient = parseLearningFile(JSON.stringify({
      examDate: "next week",
      entries: { ok: entry(2, "2026-10-14"), bad: { level: 7, of: 3, due: "2026-10-14", lastReviewed: "x" }, "a b": entry(0, "2026-10-10") },
    }));
    expect(Object.keys(lenient.entries)).toEqual(["ok"]);
    expect(lenient.examDate).toBeUndefined();
  });

  test("merges node by node: the newer rating wins on each node", () => {
    const mac: LearningFile = { format: 1, entries: { a: entry(2, "2026-10-14", "2026-10-10T08:00:00.000Z"), b: entry(0, "2026-10-10", "2026-10-10T09:00:00.000Z") } };
    const ipad: LearningFile = { format: 1, entries: { a: entry(1, "2026-10-11", "2026-10-10T08:30:00.000Z"), c: entry(2, "2026-10-14", "2026-10-09T08:00:00.000Z") } };
    const merged = mergeLearningFiles(mac, ipad);
    expect(merged.entries.a!.level).toBe(1);
    expect(merged.entries.b!.level).toBe(0);
    expect(merged.entries.c!.level).toBe(2);
    expect(mergeLearningFiles(ipad, mac)).toEqual(merged);
  });

  test("a reset drops older ratings from every device, newer ones survive", () => {
    const reset: LearningFile = { format: 1, resetAt: "2026-10-10T12:00:00.000Z", entries: {} };
    const stale: LearningFile = { format: 1, entries: { a: entry(2, "2026-10-14", "2026-10-10T08:00:00.000Z"), b: entry(1, "2026-10-11", "2026-10-10T13:00:00.000Z") } };
    const merged = mergeLearningFiles(reset, stale);
    expect(Object.keys(merged.entries)).toEqual(["b"]);
    expect(merged.resetAt).toBe("2026-10-10T12:00:00.000Z");
  });

  test("the newer exam date choice wins, also when it was cleared", () => {
    const set: LearningFile = { format: 1, examDate: "2026-11-02", examUpdated: "2026-10-10T08:00:00.000Z", entries: {} };
    const cleared: LearningFile = { format: 1, examUpdated: "2026-10-10T09:00:00.000Z", entries: {} };
    expect(mergeLearningFiles(set, cleared).examDate).toBeUndefined();
    expect(mergeLearningFiles(cleared, { ...set, examUpdated: "2026-10-11T08:00:00.000Z" }).examDate).toBe("2026-11-02");
  });
});
