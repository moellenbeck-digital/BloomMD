import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const germanSlugs = new Set(germanFiles.map((file) => file.replace(/\.md$/, "")));

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

describe("links between help pages", () => {
  for (const file of files) {
    test(`${file}: every /docs link points to an existing page`, () => {
      for (const target of docLinks(read(file))) {
        const slug = target.replace(/^\/docs\/?/, "");
        if (slug) expect(germanSlugs.has(slug), `${target} has no page ${slug}.md`).toBe(true);
      }
    });
  }

  test("the troubleshooting page is linked from the start, desktop and web pages", () => {
    for (const slug of ["index", "desktop", "web"]) {
      for (const file of [`${slug}.md`, `${slug}-en.md`]) {
        expect(docLinks(read(file)), `${file} should link to /docs/fehlerbehebung`).toContain("/docs/fehlerbehebung");
      }
    }
  });
});
