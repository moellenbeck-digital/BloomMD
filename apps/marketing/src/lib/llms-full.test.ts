import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "@bloommd/core/frontmatter";
import { absolutizeMarkdownLinks, buildLlmsFull } from "./llms-full";
import { listDocs } from "./docs";

describe("llms-full.txt", () => {
  test("contains every published docs page in both languages", async () => {
    const text = await buildLlmsFull();
    for (const locale of ["de", "en"] as const) {
      for (const page of await listDocs(locale)) expect(text).toContain(`## ${page.title} (${locale})`);
    }
  });

  test("leaves out draft docs", async () => {
    const dir = join(process.cwd(), "content", "docs");
    const drafts = readdirSync(dir).filter(file => file.endsWith(".md")).map(file => parseFrontmatter(readFileSync(join(dir, file), "utf8")).data).filter(data => data.draft === true || data.draft === "true");
    expect(drafts.length).toBeGreaterThan(0);
    const text = await buildLlmsFull();
    for (const draft of drafts) expect(text).not.toContain(`## ${String(draft.title)} (`);
  });

  test("uses absolute links only", async () => {
    const text = await buildLlmsFull();
    expect(text).not.toMatch(/\]\(\/(?!\/)/);
    expect(absolutizeMarkdownLinks("[a](/docs/web?lang=en) ![b](/docs/x.png) [c](https://x.y/) [d](#top)")).toBe("[a](https://bloommd.io/docs/web?lang=en) ![b](https://bloommd.io/docs/x.png) [c](https://x.y/) [d](#top)");
  });

  test("is linked from llms.txt", () => {
    expect(readFileSync(join(process.cwd(), "public", "llms.txt"), "utf8")).toContain("(https://bloommd.io/llms-full.txt)");
  });
});
