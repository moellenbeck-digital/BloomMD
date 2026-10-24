import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("marketing proxy", () => {
  test("rewrites the public desktop update path and marks the internal request", () => {
    const response = proxy(new NextRequest("https://bloommd.io/_desktop-updates/stable-macos-arm64-update.json"));

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://bloommd.io/desktop-updates/stable-macos-arm64-update.json");
    expect(response.headers.get("x-middleware-request-x-bloommd-desktop-proxy")).toBe("1");
  });

  test("does not expose the implementation route directly", () => {
    const response = proxy(new NextRequest("https://bloommd.io/desktop-updates/stable-macos-arm64-update.json"));
    expect(response.status).toBe(404);
  });
});
