import { describe, expect, test } from "bun:test";
import { testDatabaseUrl } from "./db-test-url";

describe("testDatabaseUrl", () => {
  const url = "postgres://user:pw@localhost:5432/db";

  test("returns the variable when it is set, in CI and locally", () => {
    expect(testDatabaseUrl({ BLOOMMD_TEST_DATABASE_URL: url })).toBe(url);
    expect(testDatabaseUrl({ BLOOMMD_TEST_DATABASE_URL: url, CI: "true" })).toBe(url);
  });

  test("locally an unset or empty variable stays undefined, so the DB tests skip", () => {
    expect(testDatabaseUrl({})).toBeUndefined();
    expect(testDatabaseUrl({ BLOOMMD_TEST_DATABASE_URL: "" })).toBe("");
    expect(testDatabaseUrl({ CI: "false" })).toBeUndefined();
  });

  test("in CI an unset or empty variable throws instead of skipping", () => {
    const message = "BLOOMMD_TEST_DATABASE_URL fehlt in der CI, DB-Tests dürfen nicht übersprungen werden";
    expect(() => testDatabaseUrl({ CI: "true" })).toThrow(message);
    expect(() => testDatabaseUrl({ CI: "true", BLOOMMD_TEST_DATABASE_URL: "" })).toThrow(message);
  });
});
