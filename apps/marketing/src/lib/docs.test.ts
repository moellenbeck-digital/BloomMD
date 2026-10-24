import { describe, expect, test } from "bun:test";
import { parseDocPage } from "./docs";

describe("parseDocPage", () => {
  test("reads title, description, order and slug", () => {
    const page = parseDocPage("obsidian-en.md", "---\ntitle: Obsidian\ndescription: Plugin help\norder: 5\n---\n\n# Obsidian\n\nBody");
    expect(page).toEqual({ slug: "obsidian", title: "Obsidian", description: "Plugin help", order: 5, content: "Body" });
  });

  test("keeps draft help pages unpublished", () => {
    expect(parseDocPage("obsidian.md", "---\ntitle: Obsidian\ndraft: true\n---\n\nBody")).toBeNull();
    expect(parseDocPage("obsidian.md", "---\ntitle: Obsidian\ndraft: false\n---\n\nBody")?.title).toBe("Obsidian");
  });
});
