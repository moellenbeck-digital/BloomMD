import { describe, expect, test } from "bun:test";
import { listMarketingPosts, marketingPostSlug, parseMarketingPost } from "./posts";

describe("marketing posts", () => {
  test("maps bilingual filenames to one stable slug", () => {
    expect(marketingPostSlug("first-post.md")).toBe("first-post");
    expect(marketingPostSlug("first-post-en.md")).toBe("first-post");
  });

  test("parses publishable frontmatter and removes a repeated title", () => {
    const post = parseMarketingPost({
      filename: "first-post.md",
      kind: "blog",
      locale: "de",
      raw: [
        "---",
        "title: First post",
        "description: A short description",
        "date: 2026-08-28",
        "tags: [Markdown, UX]",
        "---",
        "",
        "# First post",
        "",
        "Text.",
      ].join("\n"),
    });

    expect(post).toMatchObject({
      slug: "first-post",
      title: "First post",
      description: "A short description",
      date: "2026-08-28",
      tags: ["Markdown", "UX"],
      content: "Text.",
    });
  });

  test("does not publish drafts or invalid dates", () => {
    const draft = parseMarketingPost({
      filename: "draft.md",
      kind: "news",
      locale: "de",
      raw: "---\ntitle: Draft\ndate: 2026-08-28\ndraft: true\n---\nDraft",
    });
    const invalidDate = parseMarketingPost({
      filename: "invalid.md",
      kind: "news",
      locale: "de",
      raw: "---\ntitle: Invalid\ndate: tomorrow\n---\nInvalid",
    });

    expect(draft).toBeNull();
    expect(invalidDate).toBeNull();
  });

  test("loads German and English posts newest first", async () => {
    const german = await listMarketingPosts("news", "de");
    const english = await listMarketingPosts("news", "en");
    const isNewestFirst = (posts: typeof german): boolean => posts.every((post, index) => {
      const followingPost = posts[index + 1];
      return !followingPost || post.date.localeCompare(followingPost.date) >= 0;
    });

    expect(german.length).toBeGreaterThan(0);
    expect(english.length).toBe(german.length);
    expect(isNewestFirst(german)).toBe(true);
    expect(isNewestFirst(english)).toBe(true);
    expect(german.every((post) => post.locale === "de")).toBe(true);
    expect(english.every((post) => post.locale === "en")).toBe(true);
  });
});
