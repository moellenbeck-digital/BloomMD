import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareSplashHtml } from "../shared/splash-html";
import {
  DISPLAY_VERSION_PLACEHOLDER,
  formatDisplayVersion,
  renderSplashHtml,
  resolveBuildVersion,
  resolveDisplayVersion,
} from "../shared/display-version";

const templateFile = join(import.meta.dir, "..", "splash", "index.html");
const SHA = "2269618abcdef0123456789";

describe("display version", () => {
  test("appends the 7-character short SHA, or nothing without one", () => {
    expect(formatDisplayVersion("0.5.15", SHA)).toBe("BloomMD 0.5.15 (2269618)");
    expect(formatDisplayVersion("0.5.15", "")).toBe("BloomMD 0.5.15");
    expect(formatDisplayVersion("0.5.15")).toBe("BloomMD 0.5.15");
  });

  test("keeps a pre-release version as is", () => {
    expect(formatDisplayVersion("0.5.16-beta.1", SHA)).toBe("BloomMD 0.5.16-beta.1 (2269618)");
    expect(formatDisplayVersion("0.5.16-beta.1")).toBe("BloomMD 0.5.16-beta.1");
  });

  test("BLOOMMD_RELEASE_VERSION wins over the package version; unset or empty falls back", () => {
    expect(resolveBuildVersion({ BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1" }, "0.5.15")).toBe("0.5.16-beta.1");
    expect(resolveBuildVersion({}, "0.5.15")).toBe("0.5.15");
    expect(resolveBuildVersion({ BLOOMMD_RELEASE_VERSION: "" }, "0.5.15")).toBe("0.5.15");
  });

  test("resolves from the build environment", () => {
    expect(resolveDisplayVersion({}, "0.5.15")).toBe("BloomMD 0.5.15");
    expect(resolveDisplayVersion({ BLOOMMD_BUILD_SHA: SHA }, "0.5.15")).toBe("BloomMD 0.5.15 (2269618)");
    expect(resolveDisplayVersion({ BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1", BLOOMMD_BUILD_SHA: SHA }, "0.5.15")).toBe(
      "BloomMD 0.5.16-beta.1 (2269618)",
    );
  });
});

describe("renderSplashHtml", () => {
  test("replaces every placeholder and escapes the value", () => {
    const html = renderSplashHtml(`<a>${DISPLAY_VERSION_PLACEHOLDER}</a><b>${DISPLAY_VERSION_PLACEHOLDER}</b>`, "BloomMD <1> $&");
    expect(html).toBe("<a>BloomMD &lt;1&gt; $&amp;</a><b>BloomMD &lt;1&gt; $&amp;</b>");
  });

  test("refuses a template without the placeholder", () => {
    expect(() => renderSplashHtml("<div>v0.3.0</div>", "BloomMD 1.0.0")).toThrow(DISPLAY_VERSION_PLACEHOLDER);
  });
});

describe("prepareSplashHtml", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function build(env: Record<string, string | undefined>) {
    dir = mkdtempSync(join(tmpdir(), "bloommd-splash-"));
    const outFile = join(dir, "splash", "index.html");
    const displayVersion = prepareSplashHtml({ templateFile, outFile, env, packageVersion: "0.5.15" });
    return { displayVersion, html: readFileSync(outFile, "utf8") };
  }

  function versionOf(html: string) {
    return html.match(/<div class="version">([^<]*)<\/div>/)?.[1];
  }

  test("shows the package version without release metadata", () => {
    const { displayVersion, html } = build({});
    expect(versionOf(html)).toBe("BloomMD 0.5.15");
    expect(displayVersion).toBe("BloomMD 0.5.15");
  });

  test("shows release version and short SHA", () => {
    const { displayVersion, html } = build({ BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1", BLOOMMD_BUILD_SHA: SHA });
    expect(versionOf(html)).toBe("BloomMD 0.5.16-beta.1 (2269618)");
    expect(versionOf(html)).toBe(displayVersion);
  });

  test("shows the release version without SHA", () => {
    const { html } = build({ BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1" });
    expect(versionOf(html)).toBe("BloomMD 0.5.16-beta.1");
  });

  test("leaves no placeholder and no hardcoded version in the generated file", () => {
    for (const env of [{}, { BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1", BLOOMMD_BUILD_SHA: SHA }]) {
      const { html } = build(env);
      expect(html).not.toContain("{{");
      expect(html).not.toContain("v0.3.0");
    }
  });
});
