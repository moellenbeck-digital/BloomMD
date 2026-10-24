import { expect, test } from "bun:test";
import { desktopSettingsPath } from "./settings";

test("native test settings are isolated only in explicit E2E mode", () => {
  expect(desktopSettingsPath({}, "/home/test")).toBe("/home/test/.bloommd-desktop.json");
  expect(desktopSettingsPath({ BLOOMMD_E2E_SETTINGS_PATH: "/tmp/fixture/settings.json" }, "/home/test")).toBe("/home/test/.bloommd-desktop.json");
  expect(desktopSettingsPath({ BLOOMMD_E2E: "1", BLOOMMD_E2E_SETTINGS_PATH: "/tmp/fixture/settings.json" }, "/home/test")).toBe("/tmp/fixture/settings.json");
  expect(() => desktopSettingsPath({ BLOOMMD_E2E: "1", BLOOMMD_E2E_SETTINGS_PATH: "settings.json" }, "/home/test")).toThrow("must be absolute");
});
