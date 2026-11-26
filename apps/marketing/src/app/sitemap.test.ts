import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sitemap from "./sitemap";
import { contentModified, docSourceFile } from "@/lib/content-modified";
import { parseDocPage, listDocs } from "@/lib/docs";
import { listMarketingPosts } from "@/lib/posts";
import { ARTICLE_LISTING_ROUTES, STATIC_ROUTE_SOURCES } from "@/lib/seo-routes";
import { listTemplates, templateSlugs } from "@/lib/templates";

const site = "https://bloommd.io";

describe("content-modified inventory", () => {
  test("has a date for every static route with sources and nothing else", () => {
    const expected = Object.entries(STATIC_ROUTE_SOURCES).filter(([, sources]) => sources !== null).map(([route]) => route).sort();
    expect(Object.keys(contentModified.routes).sort()).toEqual(expected);
  });

  test("has a date for every published docs file and no drafts", () => {
    const dir = join(process.cwd(), "content", "docs");
    const published = readdirSync(dir).filter(file => file.endsWith(".md") && parseDocPage(file, readFileSync(join(dir, file), "utf8"))).sort();
    expect(Object.keys(contentModified.docs).sort()).toEqual(published);
  });

  test("has a date for every template", () => {
    expect(Object.keys(contentModified.templates).sort()).toEqual(templateSlugs().sort());
  });

  test("stores valid ISO dates", () => {
    for (const group of [contentModified.routes, contentModified.docs, contentModified.templates]) {
      for (const date of Object.values(group)) expect(Number.isNaN(Date.parse(date))).toBe(false);
    }
  });
});

describe("sitemap", () => {
  test("lists every URL once and dates every URL except the live roadmap", async () => {
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    const undated = entries.filter(entry => !entry.lastModified).map(entry => entry.url);
    expect(undated.sort()).toEqual([`${site}/en/roadmap`, `${site}/roadmap`]);
  });

  test("dates article listings by their newest article", async () => {
    const entries = await sitemap();
    for (const { path, kind, locale } of ARTICLE_LISTING_ROUTES) {
      const [newest] = await listMarketingPosts(kind, locale);
      const listing = entries.find(entry => entry.url === `${site}${path}`);
      expect(listing?.lastModified).toEqual(new Date(`${newest!.date}T12:00:00.000Z`));
    }
  });

  test("lists every template in German and English with its source date", async () => {
    const entries = await sitemap();
    for (const { slug } of await listTemplates()) {
      for (const url of [`${site}/templates/${slug}`, `${site}/templates/${slug}?lang=en`]) {
        expect(entries.find(entry => entry.url === url)?.lastModified).toBe(contentModified.templates[slug]!);
      }
    }
  });

  test("dates docs pages from their own source file", async () => {
    const entries = await sitemap();
    for (const locale of ["de", "en"] as const) {
      for (const page of await listDocs(locale)) {
        const path = `/docs${page.slug ? `/${page.slug}` : ""}${locale === "en" ? "?lang=en" : ""}`;
        expect(entries.find(entry => entry.url === `${site}${path}`)?.lastModified).toBe(contentModified.docs[docSourceFile(page.slug, locale)]!);
      }
    }
  });
});
