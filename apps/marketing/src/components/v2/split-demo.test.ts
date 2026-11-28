import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("./split-demo.tsx", import.meta.url), "utf8");

describe("v2 demo section", () => {
  test("keeps the existing copy", () => {
    for (const text of ["Aus Text wird Raum", "Aus Markdown wird ein navigierbarer Wissensraum.", "research-plan.md", "Echte Aufnahme", "Branch gezogen", "Markdown aktualisiert", "Visual maps reveal relationships faster."]) {
      expect(component).toContain(text);
    }
  });

  test("the looping recording can be paused and does not autoplay under reduced motion", () => {
    expect(component).not.toContain("autoPlay");
    expect(component).toContain("prefers-reduced-motion: reduce");
    expect(component).toContain("Aufnahme anhalten");
  });
});
