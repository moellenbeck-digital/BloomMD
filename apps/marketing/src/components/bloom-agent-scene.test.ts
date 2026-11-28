import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./bloom-agent-scene.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./bloom-agent-scene.module.css", import.meta.url), "utf8");

describe("bloom agent scene", () => {
  // The privacy and cookie texts promise no storage for this: the "played" flag lives in memory only.
  test("writes no browser storage and no cookie", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|cookieStore|caches\./);
    expect(source).toMatch(/let playedInThisPageView = false;/);
  });

  test("animates only transform, opacity and stroke-dashoffset", () => {
    const keyframes = [...css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)].map((match) => match[1]!);
    expect(keyframes.length).toBeGreaterThan(10);
    for (const body of keyframes) {
      const properties = [...body.matchAll(/([a-z-]+):/g)].map((match) => match[1]!);
      for (const property of properties) expect(["transform", "opacity", "stroke-dashoffset", "animation-timing-function"]).toContain(property);
    }
  });
});
