import { describe, expect, test } from "bun:test";
import { characterCount, checkStoreMetadata } from "./check-metadata";

describe("store metadata", () => {
  test("counts characters, not bytes", () => {
    expect(characterCount("Ä–ß")).toBe(3);
  });

  test("all listing texts exist and fit the App Store and Google Play limits", () => {
    expect(checkStoreMetadata(import.meta.dir)).toEqual([]);
  });
});
