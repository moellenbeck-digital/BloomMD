import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listMarketingPosts, marketingPostDocumentTitle, marketingPostLanguages, marketingPostPath, marketingPostSlug, parseMarketingPost } from "./posts";

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

describe("pictures in posts", () => {
  const root = join(import.meta.dir, "..", "..");
  const pictureRe = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;

  for (const kind of ["blog", "news"] as const) {
    const dir = join(root, "content", kind);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
      test(`${kind}/${file}: every picture has an alt text and exists under public/`, () => {
        for (const [, alt = "", src = ""] of readFileSync(join(dir, file), "utf8").matchAll(pictureRe)) {
          expect(alt.trim(), `empty alt text for ${src}`).not.toBe("");
          if (/^https?:\/\//.test(src)) continue;
          expect(src.startsWith("/"), `${src} must be a site path starting with /`).toBe(true);
          expect(existsSync(join(root, "public", src.split(/[?#]/)[0] ?? src)), `${src} is missing under public/`).toBe(true);
        }
      });
    }
  }
});

test("a leading Markdown H1 never becomes a second article H1", () => {
  const post = parseMarketingPost({ filename: "article.md", kind: "blog", locale: "de", raw: "---\ntitle: Short\ndate: 2026-09-22\n---\n# Original long title\n\nBody" });
  expect(post?.content).toBe("Body");
});

describe("SEO titles", () => {
  test("seoTitle shortens only the document title; the article title stays", () => {
    const post = parseMarketingPost({ filename: "a.md", kind: "news", locale: "de", raw: "---\ntitle: Ein langer Originaltitel\nseoTitle: Kurz\ndate: 2026-09-22\n---\nBody" })!;
    expect(post.title).toBe("Ein langer Originaltitel");
    expect(marketingPostDocumentTitle(post)).toBe("Kurz · BloomMD");
    expect(marketingPostDocumentTitle({ title: "Ohne" })).toBe("Ohne · BloomMD");
  });

  test.each(["blog", "news"] as const)("published %s articles keep <title> at 60 and the description at 155 characters", async (kind) => {
    const tooLong: string[] = [];
    for (const locale of ["de", "en"] as const) {
      for (const post of await listMarketingPosts(kind, locale)) {
        const title = marketingPostDocumentTitle(post);
        if (title.length > 60) tooLong.push(`${locale}/${post.slug} title ${title.length}`);
        if (post.description.length > 155) tooLong.push(`${locale}/${post.slug} description ${post.description.length}`);
      }
    }
    expect(tooLong).toEqual([]);
  });
});

test("language links point to published articles and resolve reciprocally; monolingual articles are allowed", async () => {
  for (const kind of ["blog", "news"] as const) {
    const published = { de: await listMarketingPosts(kind, "de"), en: await listMarketingPosts(kind, "en") };
    for (const post of [...published.de, ...published.en]) {
      const links = await marketingPostLanguages(post);
      expect(links[post.locale]).toBe(marketingPostPath(kind, post.slug, post.locale));
      expect(links["x-default"]).toBe(links.de ?? links.en);
      for (const locale of ["de", "en"] as const) {
        const target = links[locale];
        if (!target) continue;
        const peer = published[locale].find(candidate => marketingPostPath(kind, candidate.slug, locale) === target);
        expect(peer).toBeDefined();
        expect(await marketingPostLanguages(peer!)).toEqual(links);
      }
    }
  }
});
