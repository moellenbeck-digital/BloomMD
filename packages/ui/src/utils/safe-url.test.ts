import { describe, expect, test } from "bun:test";
import { toSafeImageSrc, toSafeLink } from "./safe-url";

describe("toSafeLink", () => {
  test("@t54 http(s) links are external", () => {
    expect(toSafeLink("https://example.com/a?b=1")).toEqual({ href: "https://example.com/a?b=1", external: true });
    expect(toSafeLink("  http://example.com ")).toEqual({ href: "http://example.com/", external: true });
  });

  test("@t54 mailto stays a plain link", () => {
    expect(toSafeLink("mailto:team@example.com")).toEqual({ href: "mailto:team@example.com", external: false });
    expect(toSafeLink("mailto:")).toBeNull();
  });

  test("@t54 unsafe schemes never become links, however they are disguised", () => {
    for (const url of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " \tjavascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "​javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/x",
      "ftp://example.com",
    ]) expect(toSafeLink(url), url).toBeNull();
  });

  test("@t54 relative and protocol-relative targets are not links", () => {
    for (const url of ["docs/other.md", "#anchor", "/etc", "//evil.example", "\\\\evil.example", "/\\evil.example", ""]) {
      expect(toSafeLink(url), url).toBeNull();
    }
  });
});

describe("toSafeImageSrc", () => {
  test("@t54 allows http(s), embedded raster images and relative paths", () => {
    expect(toSafeImageSrc("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(toSafeImageSrc("assets/a.png")).toBe("assets/a.png");
    expect(toSafeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  test("@t54 rejects scripts, SVG data URLs, other schemes and protocol-relative sources", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/png;base64,AAAA\"onerror=\"x",
      "file:///etc/passwd",
      "//evil.example/x.png",
      "",
    ]) expect(toSafeImageSrc(url), url).toBeNull();
  });
});
