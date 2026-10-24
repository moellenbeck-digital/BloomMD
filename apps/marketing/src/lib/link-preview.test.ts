import { describe, expect, test } from "bun:test";
import { parseLinkPreviewHtml, assertPublicHttpUrl } from "./link-preview";

describe("link previews", () => {
  test("extracts Open Graph metadata and resolves relative images", () => {
    const result = parseLinkPreviewHtml(
      '<html><head><title>Fallback</title><meta property="og:title" content="BloomMD"><meta property="og:description" content="Visual maps"><meta property="og:image" content="/social.png"></head></html>',
      new URL("https://example.com/docs/page"),
    );
    expect(result).toEqual({
      title: "BloomMD",
      description: "Visual maps",
      image: "https://example.com/social.png",
    });
  });

  test("rejects local and non-web preview targets", async () => {
    await expect(assertPublicHttpUrl("javascript:alert(1)")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://127.0.0.1:3000/demo")).rejects.toThrow("Private network");
    await expect(assertPublicHttpUrl("http://localhost:3000/demo")).rejects.toThrow("not allowed");
  });
});
