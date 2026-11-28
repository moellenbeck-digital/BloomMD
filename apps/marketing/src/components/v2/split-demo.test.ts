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
    // Autoplay and native controls only in the copy for visitors without JavaScript.
    expect(component.match(/autoPlay/g)).toHaveLength(1);
    expect(component.slice(component.indexOf("<noscript>"), component.indexOf("</noscript>"))).toContain("autoPlay controls");
    expect(component).toContain("{mounted && (");
    expect(component).toContain("prefers-reduced-motion: reduce");
    expect(component).toContain("Aufnahme anhalten");
  });
});
