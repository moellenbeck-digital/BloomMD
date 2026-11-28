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

describe("bloom agent scene keyframes", () => {
  // Chrome resolves no var() in animation-timing-function inside @keyframes and falls back to linear.
  test("use literal easings, var() only outside the keyframes", () => {
    const keyframes = [...css.matchAll(/@keyframes [\w-]+ \{[^\n]*\}|@keyframes [\w-]+ \{[\s\S]*?\n\}/g)].map((match) => match[0]);
    const easings = keyframes.flatMap((body) => [...body.matchAll(/animation-timing-function: ([^;]+);/g)].map((match) => match[1]!));
    expect(easings.length).toBeGreaterThan(60);
    for (const easing of easings) expect(easing).toMatch(/^(linear\(|cubic-bezier\(|ease-in$|ease-out$|linear$)/);
    expect(css).toMatch(/--snap: cubic-bezier/);
  });

  test("the easing variables and their literal copies in the keyframes match", () => {
    const vars = Object.fromEntries([...css.matchAll(/^\s+--(spring-soft|pop|out|in-out|snap|settle): (.+);$/gm)].map((match) => [match[1]!, match[2]!]));
    const keyframes = [...css.matchAll(/@keyframes [\w-]+ \{[\s\S]*?\n\}/g)].map((match) => match[0]).join("\n");
    for (const name of ["spring-soft", "pop", "out", "snap", "settle"]) expect(keyframes).toContain(`animation-timing-function: ${vars[name]};`);
  });

  test("the scroll coupling needs animation-range and runs only near the viewport", () => {
    expect(css).toMatch(/@supports \(animation-timeline: scroll\(\)\) and \(animation-range: [^)]+\)/);
    const scrollRules = css.match(/\[data-scroll\][^{]*\{/g) ?? [];
    expect(scrollRules.length).toBeGreaterThanOrEqual(4);
    for (const rule of scrollRules) expect(rule).toContain("[data-inview]");
  });
});
