import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "@bloommd/core/frontmatter";
import { absolutizeMarkdownLinks, buildLlmsFull } from "./llms-full";
import { listDocs } from "./docs";
import { getMarketingPost } from "./posts";

/**
 * Whether a root-relative marketing path (with an optional query) is served: a published docs page
 * in the requested language (`?lang=en` asks for the English one), a published article, a file
 * under `public/` or a static route under `src/app`. Drafts, folders under `public/` and app-only
 * routes (such as `/account`, which lives on bloommd.app) answer 404 on bloommd.io and do not count.
 */
async function marketingPathExists(target: string): Promise<boolean> {
  const root = process.cwd();
  const [path = "/", query = ""] = target.split("?");
  const file = join(root, "public", path);
  if (path !== "/" && existsSync(file) && statSync(file).isFile()) return true;
  const docSlug = /^\/docs(?:\/([^/]+))?\/?$/.exec(path);
  if (docSlug) {
    const locale = new URLSearchParams(query).get("lang") === "en" ? "en" : "de";
    return (await listDocs(locale)).some((page) => page.slug === (docSlug[1] ?? ""));
  }
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
    const targets = new Set([...text.matchAll(/\]\(https:\/\/bloommd\.io(\/[^)\s?#]*)?(\?[^)\s#]*)?[^)\s]*\)/g)].map((match) => `${match[1] || "/"}${match[2] ?? ""}`));
    expect(targets.size).toBeGreaterThan(0);
    for (const target of targets) expect(await marketingPathExists(target), `${target} is not served by bloommd.io`).toBe(true);
    expect(await marketingPathExists("/docs/okf-wiki?lang=en")).toBe(true);
    expect(await marketingPathExists("/docs/agent-wissen")).toBe(false);
    expect(await marketingPathExists("/docs/agent-wissen?lang=en")).toBe(false);
    expect(await marketingPathExists("/account")).toBe(false);
    expect(await marketingPathExists("/releases")).toBe(false);
  });

  test("is linked from llms.txt", () => {
    expect(readFileSync(join(process.cwd(), "public", "llms.txt"), "utf8")).toContain("(https://bloommd.io/llms-full.txt)");
  });
});
