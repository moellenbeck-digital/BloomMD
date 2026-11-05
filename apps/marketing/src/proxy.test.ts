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

  test("lets the well-known association files and /open pass untouched", () => {
    for (const url of [
      "https://bloommd.io/.well-known/apple-app-site-association",
      "https://bloommd.io/.well-known/assetlinks.json",
      "https://bloommd.io/open?path=x.md&node=a",
      "https://bloommd.io/open/Doc-1?node=a",
    ]) {
      const response = proxy(new NextRequest(url));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  test("rewrites the public Plausible paths to the internal handlers without redirect or gate", () => {
    const script = proxy(new NextRequest("https://bloommd.io/_plausible/js/script.js"));
    expect(script.status).toBe(200);
    expect(script.headers.get("location")).toBeNull();
    expect(script.headers.get("x-middleware-rewrite")).toBe("https://bloommd.io/plausible-proxy/script");
    expect(script.headers.get("x-middleware-request-x-bloommd-plausible-proxy")).toBe("1");

    const event = proxy(new NextRequest("https://bloommd.io/_plausible/api/event", { method: "POST", body: "{}" }));
    expect(event.status).toBe(200);
    expect(event.headers.get("location")).toBeNull();
    expect(event.headers.get("x-middleware-rewrite")).toBe("https://bloommd.io/plausible-proxy/event");
  });

  test("does not expose the Plausible handlers directly or proxy other /_plausible paths", () => {
    expect(proxy(new NextRequest("https://bloommd.io/plausible-proxy/event", { method: "POST", body: "{}" })).status).toBe(404);
    expect(proxy(new NextRequest("https://bloommd.io/plausible-proxy/script")).status).toBe(404);
    for (const url of ["https://bloommd.io/_plausible/admin", "https://bloommd.io/_plausible/js/other.js", "https://bloommd.io/_plausible/api/event/x"]) {
      expect(proxy(new NextRequest(url)).headers.get("x-middleware-rewrite")).toBeNull();
    }
  });
});
