import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "@bloommd/core/frontmatter";
import { releaseToNewsDraftFiles } from "./news-drafts";

describe("release news drafts", () => {
  test("creates bilingual drafts and excludes sensitive-looking release lines", () => {
    const files = releaseToNewsDraftFiles({
      title: "BloomMD 0.2.12",
      tag: "v0.2.12",
      body: [
        "## Highlights",
        "",
        "Improved keyboard navigation.",
        "DATABASE_URL=private-value",
        "Local path: /Users/example/secrets.txt",
      ].join("\n"),
      sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12",
      publishedAt: "2026-08-28T10:00:00.000Z",
    });

    expect(files.map((file) => file.filename)).toEqual([
      "2026-08-28-bloommd-0-2-12-v0-2-12.md",
      "2026-08-28-bloommd-0-2-12-v0-2-12-en.md",
    ]);
    for (const file of files) {
      const parsed = parseFrontmatter(file.content);
      expect(parsed.data.draft).toBe(true);
      expect(parsed.data.source).toBe("github-release");
      expect(parsed.content).toContain("Improved keyboard navigation.");
      expect(parsed.content).not.toContain("DATABASE_URL");
      expect(parsed.content).not.toContain("/Users/example");
    }
  });
});
