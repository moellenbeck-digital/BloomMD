import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocPage } from "./docs";

/**
 * Checks on the help pages in `content/docs` themselves, not on how they are parsed (that is
 * `docs.test.ts`): both languages exist, every picture is there, the central pages carry a picture and
 * links between help pages point somewhere. The renderer reads these files at request time, so a
 * missing picture or a dead link would only show up as a broken page for the reader.
 */

const ROOT = join(import.meta.dir, "..", "..");
const DOCS_DIR = join(ROOT, "content", "docs");
const PUBLIC_DIR = join(ROOT, "public");

/** Pages that explain a flow and have to show it. A slug is the German file name without `.md`. */
const PAGES_WITH_A_PICTURE = [
  "index",
  "desktop",
  "web",
  "closed-beta-zugang",
  "lokal-oder-cloud",
  "okf-wiki",
  "obsidian",
  "fehlerbehebung",
];

const files = readdirSync(DOCS_DIR).filter((file) => file.endsWith(".md")).sort();
const germanFiles = files.filter((file) => !file.endsWith("-en.md"));
/** Published pages as `slug` (German) and `slug?lang=en` (English), the way the site serves them. */
const publishedPages = new Set(files.flatMap((file) => {
  const page = parseDocPage(file, read(file));
  return page ? [file.endsWith("-en.md") ? `${page.slug}?lang=en` : page.slug] : [];
}));
/** Every page, drafts included, in the same form. */
const allPages = new Set(files.map((file) => file.endsWith("-en.md") ? `${file.replace(/-en\.md$/, "").replace(/^index$/, "")}?lang=en` : file.replace(/\.md$/, "").replace(/^index$/, "")));

function counterpart(file: string): string {
  return file.endsWith("-en.md") ? file.replace(/-en\.md$/, ".md") : file.replace(/\.md$/, "-en.md");
}

function read(file: string): string {
  return readFileSync(join(DOCS_DIR, file), "utf8");
}

/** Without code blocks and code spans: `![](bilder/strand.png)` in a sentence about syntax is no picture. */
function withoutCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

/** Markdown images as `{ alt, src }`; a title after the address (`"…"`) is not part of `src`. */
function images(markdown: string): { alt: string; src: string }[] {
  return [...withoutCode(markdown).matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => ({ alt: match[1] ?? "", src: match[2] ?? "" }));
}

/** Targets of links to other help pages: `/docs/slug`, with `?lang=en` or `#anchor` cut off. */
function docLinks(markdown: string): string[] {
  return [...withoutCode(markdown).matchAll(/(?<!!)\[[^\]]*\]\((\/docs(?:\/[^)\s?#]*)?)(?:[?#][^)\s]*)?\)/g)].map((match) => match[1] ?? "");
}

describe("help pages exist in both languages", () => {
  test("there are help pages at all", () => {
    expect(germanFiles.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    test(`${file} has ${counterpart(file)}`, () => {
      expect(files).toContain(counterpart(file));
    });
  }

  for (const file of germanFiles) {
    test(`${file} and ${counterpart(file)} show the same number of pictures`, () => {
      expect(images(read(counterpart(file))).length).toBe(images(read(file)).length);
    });
  }
});

describe("pictures", () => {
  for (const file of files) {
    test(`${file}: every picture exists under public/ and has an alt text`, () => {
      for (const { alt, src } of images(read(file))) {
        expect(alt.trim(), `empty alt text for ${src}`).not.toBe("");
        if (/^https?:\/\//.test(src)) continue;
        expect(src.startsWith("/"), `${src} must be a site path starting with /`).toBe(true);
        const path = src.split(/[?#]/)[0] ?? src;
        expect(existsSync(join(PUBLIC_DIR, path)), `${src} is missing under public/`).toBe(true);
      }
    });
  }

  for (const slug of PAGES_WITH_A_PICTURE) {
    for (const file of [`${slug}.md`, `${slug}-en.md`]) {
      test(`${file} contains at least one picture`, () => {
        expect(files).toContain(file);
        expect(images(read(file)).length).toBeGreaterThan(0);
      });
    }
  }
});

/** Link targets to help pages as `slug` or `slug?lang=en`; an anchor is cut off. */
function docPageLinks(markdown: string): string[] {
  return [...withoutCode(markdown).matchAll(/(?<!!)\[[^\]]*\]\(\/docs(?:\/([^)\s?#/]*))?\/?(\?[^)\s#]*)?(?:#[^)\s]*)?\)/g)]
    .map((match) => `${match[1] ?? ""}${/(?:^\?|&)lang=en(?:&|$)/.test(match[2] ?? "") ? "?lang=en" : ""}`);
}

describe("links between help pages", () => {
  for (const file of files) {
    const draft = parseDocPage(file, read(file)) === null;
    // Drafts answer 404, so a published page must not link to one. A draft may link to another
    // draft: both go live together with the release they describe.
    test(`${file}: every /docs link points to a ${draft ? "page" : "published page"} in the linked language`, () => {
      for (const target of docPageLinks(read(file))) {
        expect((draft ? allPages : publishedPages).has(target), `/docs/${target} is not ${draft ? "a page" : "a published page"}`).toBe(true);
      }
    });
  }

  test("the link check rejects drafts, missing languages and missing pages", () => {
    expect(docPageLinks("[a](/docs/web?lang=en#x) [b](/docs) [c](/docs/web#top)")).toEqual(["web?lang=en", "", "web"]);
    expect(publishedPages.has("export")).toBe(false);
    expect(allPages.has("export")).toBe(true);
    expect(publishedPages.has("agent-wissen?lang=en")).toBe(false);
    expect(publishedPages.has("okf-wiki?lang=en")).toBe(true);
    expect(allPages.has("does-not-exist")).toBe(false);
  });

  test("the troubleshooting page is linked from the start, desktop and web pages", () => {
    for (const slug of ["index", "desktop", "web"]) {
      for (const file of [`${slug}.md`, `${slug}-en.md`]) {
        expect(docLinks(read(file)), `${file} should link to /docs/fehlerbehebung`).toContain("/docs/fehlerbehebung");
      }
    }
  });
});
