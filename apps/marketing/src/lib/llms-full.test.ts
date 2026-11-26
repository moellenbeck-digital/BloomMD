import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "@bloommd/core/frontmatter";
import { absolutizeMarkdownLinks, buildLlmsFull } from "./llms-full";
import { listDocs } from "./docs";
import { getMarketingPost } from "./posts";

/**
 * Whether a root-relative marketing path is served: a published docs page, a published article,
 * a file under `public/` or a static route under `src/app`. Drafts and app-only routes (such as
 * `/account`, which lives on bloommd.app) answer 404 on bloommd.io and therefore do not count.
 */
async function marketingPathExists(path: string): Promise<boolean> {
  const root = process.cwd();
  if (path !== "/" && existsSync(join(root, "public", path))) return true;
  const docSlug = /^\/docs(?:\/([^/]+))?\/?$/.exec(path);
  if (docSlug) return (await listDocs("de")).some((page) => page.slug === (docSlug[1] ?? ""));
  const article = /^(\/en)?\/(blog|news)\/([^/]+)$/.exec(path);
  if (article) return (await getMarketingPost(article[2] as "blog" | "news", article[3] ?? "", article[1] ? "en" : "de")) !== null;
  const dir = join(root, "src", "app", path);
  return ["page.tsx", "route.ts"].some((file) => existsSync(join(dir, file)));
}

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

  test("every link to bloommd.io points to a published page", async () => {
    const text = await buildLlmsFull();
    const paths = new Set([...text.matchAll(/\]\(https:\/\/bloommd\.io(\/[^)\s?#]*)?[^)\s]*\)/g)].map((match) => match[1] || "/"));
    expect(paths.size).toBeGreaterThan(0);
    for (const path of paths) expect(await marketingPathExists(path), `${path} is not served by bloommd.io`).toBe(true);
    expect(await marketingPathExists("/docs/agent-wissen")).toBe(false);
    expect(await marketingPathExists("/account")).toBe(false);
  });

  test("is linked from llms.txt", () => {
    expect(readFileSync(join(process.cwd(), "public", "llms.txt"), "utf8")).toContain("(https://bloommd.io/llms-full.txt)");
  });
});
