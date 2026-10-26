import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { exportWikiBundle } from "./wiki-export";

const NOW = new Date("2026-03-01T12:00:00Z");

const ALPHA = `---
type: concept
title: Alpha
tags: [core]
generated:
  by: agent-1
  at: "2026-01-01"
verified:
  by: alice
  at: "2026-01-02"
stale_after: "2026-02-01"
sources:
  - resource: https://example.com/doc
    id: src-1
    title: Doc
    contentHash: "sha256:aaa"
---
# Alpha

Intro with **bold**, *italic* and \`code\`.

- first
- second
  - nested

See [[Beta]], [[Missing page]] and ![diagram](assets/diagram.png).
[external](https://example.com/x) ![remote](https://example.com/p.png)

<script>window.__pwned = 1</script>
<img src="x" onerror="window.__pwned = 1">
[js](javascript:window.__pwned=1)
![data](data:text/html;base64,PHNjcmlwdD4=)
[traversal](../../secret.png)
`;

const BETA = `---
type: concept
title: Beta
status: draft
---
# Beta

Back to [Alpha](alpha.md).
`;

let sandbox = "";
let out = "";
const windows: Window[] = [];

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "bloommd-wiki-browser-"));
  const bundle = join(sandbox, "bundle");
  out = join(sandbox, "out");
  await mkdir(join(bundle, "concepts/assets"), { recursive: true });
  await writeFile(join(bundle, "index.md"), `---\ntype: index\ntitle: Test Wiki\nokf_version: "0.2"\n---\n# Test Wiki\n\n- [Alpha](./concepts/alpha.md)\n- [Beta](./concepts/beta.md)\n`);
  await writeFile(join(bundle, "log.md"), `---\ntype: log\n---\n# Wiki log\n\n## 2026-01-01\n- created the wiki\n`);
  await writeFile(join(bundle, "concepts/alpha.md"), ALPHA);
  await writeFile(join(bundle, "concepts/beta.md"), BETA);
  await writeFile(join(bundle, "concepts/assets/diagram.png"), "png-bytes");
  await exportWikiBundle(bundle, out, { now: NOW, sourceHashes: { "src-1": "sha256:bbb" } });
});

afterEach(async () => {
  for (const window of windows.splice(0)) await window.happyDOM.close();
  await rm(sandbox, { recursive: true, force: true });
});

interface OpenOptions {
  url?: string;
  languages?: string[];
  /** Replaces the default `fetch`, which serves wiki.json from the export. */
  fetch?: (url: string) => Promise<Response>;
}

async function openBrowser(options: OpenOptions = {}) {
  const html = await readFile(join(out, "index.html"), "utf8");
  const json = await readFile(join(out, "wiki.json"), "utf8");
  // Only the export's own script runs here; page content reaches the DOM as text and is never evaluated.
  const window = new Window({
    url: options.url ?? "https://wiki.test/share/index.html",
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  windows.push(window);
  const requests: string[] = [];
  const serve = options.fetch ?? (async () => new Response(json, { headers: { "content-type": "application/json" } }));
  (window as unknown as { fetch: unknown }).fetch = async (url: string) => {
    requests.push(String(url));
    return serve(String(url));
  };
  if (options.languages) Object.defineProperty(window.navigator, "languages", { value: options.languages, configurable: true });
  window.document.write(html);
  await waitFor(window, '[data-testid="wiki-page"], [data-testid="wiki-error"]');
  return { window, document: window.document, requests };
}

async function waitFor(window: Window, selector: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!window.document.querySelector(selector)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${selector}. Body: ${window.document.body.textContent?.slice(0, 300)}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const text = (document: Window["document"], selector: string): string => document.querySelector(selector)?.textContent ?? "";

describe("page view", () => {
  test("lists the pages and shows the first one with trust, lifecycle and expiry badges", async () => {
    const { document } = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    expect(document.querySelectorAll('[data-testid="wiki-list-item"]')).toHaveLength(2);
    expect(text(document, '[data-testid="wiki-page"] h2')).toBe("Alpha");
    expect(text(document, '[data-testid="wiki-badge-trust"]')).toBe("verified");
    expect(text(document, '[data-testid="wiki-badge-lifecycle"]')).toBe("stable");
    expect(text(document, '[data-testid="wiki-badge-expired"]')).toBe("expired");
    expect(text(document, "h1")).toBe("Test Wiki");
  });

  test("shows citations with 'source changed', and 'without source' for an unsourced draft", async () => {
    const { window, document } = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    expect(text(document, '[data-testid="wiki-citations"]')).toContain("Doc");
    expect(text(document, '[data-testid="wiki-source-changed"]')).toBe("Source changed");

    window.location.hash = "#/page/" + encodeURIComponent("concepts/beta.md");
    await waitFor(window, '[data-testid="wiki-no-source"]');
    expect(text(document, '[data-testid="wiki-badge-trust"]')).toBe("unattributed");
    expect(text(document, '[data-testid="wiki-badge-lifecycle"]')).toBe("draft");
    expect(text(document, '[data-testid="wiki-no-source"]')).toContain("cannot be verified");
  });

  test("renders Markdown, wiki links between pages, and keeps broken ones visible", async () => {
    const { document } = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    const md = document.querySelector(".md")!;
    expect(md.querySelector("strong")?.textContent).toBe("bold");
    expect(md.querySelector("em")?.textContent).toBe("italic");
    expect(md.querySelector("code")?.textContent).toBe("code");
    expect(md.querySelectorAll("ul ul li")).toHaveLength(1);
    const betaLink = [...md.querySelectorAll("a")].find((anchor) => anchor.textContent === "Beta");
    expect(betaLink?.getAttribute("href")).toBe("#/page/concepts%2Fbeta.md");
    expect(md.querySelector(".broken")?.textContent).toBe("Missing page");
    expect(md.querySelector("img")?.getAttribute("src")).toBe("concepts/assets/diagram.png");
  });

  test("navigates between pages through the hash", async () => {
    const { window, document } = await openBrowser();
    window.location.hash = "#/page/" + encodeURIComponent("concepts/beta.md");
    await waitFor(window, '[data-testid="wiki-no-source"]');
    expect(text(document, '[data-testid="wiki-page"] h2')).toBe("Beta");
    expect(document.querySelector('[data-testid="wiki-list-item"][aria-current="true"]')?.textContent).toContain("Beta");
  });

  test("an unknown page link says so instead of showing something else", async () => {
    const { window, document } = await openBrowser();
    window.location.hash = "#/page/" + encodeURIComponent("concepts/gone.md");
    await waitFor(window, '[data-testid="wiki-no-page"]');
    expect(text(document, '[data-testid="wiki-no-page"]')).toBe("No page found.");
  });
});

describe("search and views", () => {
  test("search filters the page list, tag and problem filters narrow it further", async () => {
    const { window, document } = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    const search = document.querySelector('[data-testid="wiki-search"]') as unknown as HTMLInputElement;
    const type = (value: string) => {
      search.value = value;
      (search as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(new window.Event("input", { bubbles: true }));
    };
    type("back to");
    expect(document.querySelectorAll('[data-testid="wiki-list-item"]')).toHaveLength(1);
    expect(text(document, '[data-testid="wiki-page"] h2')).toBe("Beta");

    type("no such text anywhere");
    expect(document.querySelectorAll('[data-testid="wiki-list-item"]')).toHaveLength(0);
    expect(text(document, '[data-testid="wiki-no-page"]')).toBe("No page found.");
    expect(text(document, '[data-testid="wiki-count"]')).toBe("0 of 2 pages");
  });

  test("index and log render from the bundle, index links lead to pages", async () => {
    const { window, document } = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    (document.querySelector('[data-testid="wiki-view-index"]') as unknown as HTMLElement).click();
    await waitFor(window, '[data-testid="wiki-index"]');
    expect(text(document, '[data-testid="wiki-index"]')).toContain("Wiki index");
    const links = [...document.querySelectorAll('[data-testid="wiki-index"] a')].map((anchor) => anchor.getAttribute("href"));
    expect(links).toEqual(["#/page/concepts%2Falpha.md", "#/page/concepts%2Fbeta.md"]);
    // Frontmatter is for machines; it is not shown.
    expect(text(document, '[data-testid="wiki-index"]')).not.toContain("okf_version");

    (document.querySelector('[data-testid="wiki-view-log"]') as unknown as HTMLElement).click();
    await waitFor(window, '[data-testid="wiki-log"]');
    expect(text(document, '[data-testid="wiki-log"]')).toContain("created the wiki");
  });

  test("the knowledge map lists pages and marks the broken link", async () => {
    const { window, document } = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    (document.querySelector('[data-testid="wiki-view-map"]') as unknown as HTMLElement).click();
    await waitFor(window, '[data-testid="wiki-knowledge-map"]');
    const map = text(document, '[data-testid="wiki-knowledge-map"]');
    expect(map).toContain("Alpha");
    expect(map).toContain("Missing page (broken)");
  });
});

describe("references and media", () => {
  test("unavailable references stay listed with the reason; external ones are a plain link, not a request", async () => {
    const { document } = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    const unsafe = [...document.querySelectorAll('[data-testid="wiki-reference-unsafe"]')];
    expect(unsafe.length).toBeGreaterThanOrEqual(3);
    expect(unsafe.map((card) => card.textContent).join(" ")).toContain("Unsupported scheme.");
    expect(document.querySelector('[data-testid="wiki-reference-missing"]')?.textContent).toContain("Missing page");

    const external = [...document.querySelectorAll('[data-testid="wiki-reference"]')].filter((card) => card.textContent?.includes("example.com/x"));
    expect(external).toHaveLength(1);
    expect(external[0]!.querySelector("a")?.getAttribute("rel")).toContain("noopener");
    expect(external[0]!.querySelector("img, video, audio, iframe")).toBeNull();
  });

  test("makes no request except wiki.json, and loads no external media", async () => {
    const { document, requests } = await openBrowser();
    expect(requests).toEqual(["wiki.json"]);
    for (const element of document.querySelectorAll("[src], [href]")) {
      const url = element.getAttribute("src") ?? "";
      expect(url).not.toMatch(/^(https?:)?\/\//i);
    }
  });
});

describe("safe rendering", () => {
  test("raw HTML, javascript: and data: links stay inert text", async () => {
    const { window, document } = await openBrowser();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();

    const md = document.querySelector(".md")!;
    expect(md.querySelector("script")).toBeNull();
    expect(md.querySelector("[onerror]")).toBeNull();
    // The markup is shown as text, so a reader sees what the page contains.
    expect(md.textContent).toContain('<img src="x" onerror="window.__pwned = 1">');

    for (const element of document.querySelectorAll("a[href], [src]")) {
      const url = (element.getAttribute("href") ?? element.getAttribute("src") ?? "").trim();
      expect(url).not.toMatch(/^(javascript|data|vbscript|file):/i);
    }
    expect([...md.querySelectorAll("a")].some((anchor) => anchor.textContent === "js")).toBe(false);
    expect(document.querySelector("form, input[type=file], textarea, iframe, object, embed")).toBeNull();
  });
});

describe("language and embedding", () => {
  test("?lang= selects German or English", async () => {
    const de = await openBrowser({ url: "https://wiki.test/share/index.html?lang=de" });
    expect(de.document.documentElement.getAttribute("lang")).toBe("de");
    expect(text(de.document, '[data-testid="wiki-view-pages"]')).toBe("Seiten");
    expect(text(de.document, '[data-testid="wiki-badge-expired"]')).toBe("abgelaufen");
    expect(text(de.document, '[data-testid="wiki-badge-lifecycle"]')).toBe("stabil");

    const en = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    expect(en.document.documentElement.getAttribute("lang")).toBe("en");
    expect(text(en.document, '[data-testid="wiki-view-pages"]')).toBe("Pages");
  });

  test("without ?lang= the browser language decides, English being the fallback", async () => {
    expect((await openBrowser({ languages: ["de-DE", "en"] })).document.documentElement.getAttribute("lang")).toBe("de");
    expect((await openBrowser({ languages: ["fr-FR"] })).document.documentElement.getAttribute("lang")).toBe("en");
  });

  test("the language switch changes the text in place and keeps the URL in step", async () => {
    const { window, document } = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    (document.querySelector('[data-testid="wiki-lang-de"]') as unknown as HTMLElement).click();
    expect(text(document, '[data-testid="wiki-view-pages"]')).toBe("Seiten");
    expect(window.location.search).toBe("?lang=de");
  });

  test("?embed=1 hides the header; navigation stays", async () => {
    const embedded = await openBrowser({ url: "https://wiki.test/share/index.html?embed=1&lang=en" });
    expect(embedded.document.querySelector("header.hdr")?.hasAttribute("hidden")).toBe(true);
    expect(embedded.document.querySelector('[data-testid="wiki-view-pages"]')).not.toBeNull();

    const plain = await openBrowser({ url: "https://wiki.test/share/index.html?lang=en" });
    expect(plain.document.querySelector("header.hdr")?.hasAttribute("hidden")).toBe(false);
  });
});

describe("loading", () => {
  test("falls back to the embedded wiki.json when fetch fails", async () => {
    const { document, requests } = await openBrowser({ fetch: async () => { throw new TypeError("network down"); } });
    expect(requests).toEqual(["wiki.json"]);
    expect(text(document, '[data-testid="wiki-page"] h2')).toBe("Alpha");
  });

  test("falls back when wiki.json answers with an error status", async () => {
    const { document } = await openBrowser({ fetch: async () => new Response("nope", { status: 404 }) });
    expect(text(document, '[data-testid="wiki-page"] h2')).toBe("Alpha");
  });

  test("from file:// it reads the embedded copy without trying to fetch", async () => {
    const { document, requests } = await openBrowser({ url: "file:///srv/export/index.html" });
    expect(requests).toEqual([]);
    expect(text(document, '[data-testid="wiki-page"] h2')).toBe("Alpha");
  });
});
