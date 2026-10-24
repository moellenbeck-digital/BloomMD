import { describe, expect, test } from "bun:test";
import { sharedMapView } from "./shared-map";

const MARKDOWN = `---
title: Plan
private_note: nur für mich
---

# Plan <!-- bloommd:id=root -->

<!-- interne Notiz -->
Sichtbarer Text.

![[Plan ink.svg]]

## Aufgabe <!-- bloommd:id=t1 --> <!-- bloommd:meta={"kind":"task","status":"open","due":"2026-10-10","assignee":"Max","note":"Geheim/Notiz"} -->

Erledigen.
`;

describe("sharedMapView", () => {
  test("reveals titles, visible text and task facts, but no frontmatter, comments or embeds", () => {
    const view = sharedMapView("plan.md", MARKDOWN);
    const serialized = JSON.stringify(view);
    expect(view.title).toBe("Plan");
    expect(serialized).toContain("Sichtbarer Text.");
    expect(serialized).not.toContain("private_note");
    expect(serialized).not.toContain("nur für mich");
    expect(serialized).not.toContain("interne Notiz");
    expect(serialized).not.toContain("ink.svg");
    expect(serialized).not.toContain("Geheim/Notiz");
    expect(serialized).not.toContain("bloommd:");
    const task = view.nodes.find((node) => node.title === "Aufgabe");
    expect(task?.metadata).toEqual({ kind: "task", status: "open", due: "2026-10-10", assignee: "Max" });
    expect(view.nodes.find((node) => node.id === view.rootId)?.children).toContain(task!.id);
  });
});
