import { describe, expect, test } from "bun:test";
import { parseAppLink } from "./app-links";

describe("parseAppLink", () => {
  test("recognizes the sign-in callback and keeps the full URL for the state check", () => {
    expect(parseAppLink("bloommd://auth?code=bloom_mac_x&state=abc")).toEqual({ kind: "auth", url: "bloommd://auth?code=bloom_mac_x&state=abc" });
  });

  test("still opens notes and ignores foreign links", () => {
    expect(parseAppLink("bloommd://open?path=Schule/Physik.md&node=abc")).toEqual({ kind: "open", path: "Schule/Physik.md", node: "abc" });
    expect(parseAppLink("https://bloommd.app/auth?code=x")).toBeNull();
    expect(parseAppLink("bloommd://open?path=../x.md")).toBeNull();
  });
});
