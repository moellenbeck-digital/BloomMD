import { expect, test } from "bun:test";
import { macOSReleaseEnabled } from "./macos-signing";

const configured = {
  BLOOMMD_MACOS_RELEASE: "1",
  ELECTROBUN_DEVELOPER_ID: "Developer ID Application: Example (TEAM123456)",
  APPLE_TEAM_ID: "TEAM123456",
  ELECTROBUN_APPLEAPIKEY: "KEY1234567",
  ELECTROBUN_APPLEAPIISSUER: "issuer",
  ELECTROBUN_APPLEAPIKEYPATH: "/tmp/key.p8",
};

test("development builds do not need release credentials", () => {
  expect(macOSReleaseEnabled({})).toBe(false);
});

test("signed releases require the entire credential set and matching team", () => {
  expect(macOSReleaseEnabled(configured)).toBe(true);
  for (const key of Object.keys(configured).filter((key) => key !== "BLOOMMD_MACOS_RELEASE")) {
    expect(() => macOSReleaseEnabled({ ...configured, [key]: "" })).toThrow();
  }
  expect(() => macOSReleaseEnabled({ ...configured, APPLE_TEAM_ID: "WRONGTEAM" })).toThrow();
  expect(() => macOSReleaseEnabled({ BLOOMMD_MACOS_RELEASE: "true" })).toThrow();
});
