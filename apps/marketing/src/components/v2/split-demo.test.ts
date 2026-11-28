import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";

const component = readFileSync(new URL("./split-demo.tsx", import.meta.url), "utf8");

describe("v2 demo section", () => {
  test("keeps the existing copy", () => {
    for (const text of ["Aus Text wird Raum", "Aus Markdown wird ein navigierbarer Wissensraum.", "research-plan.md", "Echte Aufnahme", "Branch gezogen", "Markdown aktualisiert", "Visual maps reveal relationships faster."]) {
      expect(component).toContain(text);
    }
  });

  test("the looping recording can be paused and does not autoplay under reduced motion", () => {
    // No autoplay attribute at all: visitors without JavaScript get native controls and start it themselves.
    expect(component).not.toContain("autoPlay");
    expect(component.slice(component.indexOf("<noscript>"), component.indexOf("</noscript>"))).toContain(" controls ");
    expect(component).toContain("{mounted && (");
    expect(component).toContain("prefers-reduced-motion: reduce");
    expect(component).toContain("Aufnahme anhalten");
  });

  test("only the video for visitors without JavaScript carries a poster, so nothing extra loads otherwise", () => {
    const fallback = component.slice(component.indexOf("<noscript>"), component.indexOf("</noscript>"));
    expect(fallback).toContain('poster="/demo-branch-drag-markdown-poster.webp"');
    expect(component.split("poster=").length).toBe(2);
    expect(statSync(new URL("../../../public/demo-branch-drag-markdown-poster.webp", import.meta.url)).size).toBeLessThanOrEqual(30 * 1024);
  });
});
