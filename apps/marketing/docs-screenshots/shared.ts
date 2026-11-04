import { expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, "../../..");
/** Target folder; `DOCS_SCREENSHOTS_OUT` redirects it, for example to look at a run before committing. */
export const OUT_DIR = resolve(process.env.DOCS_SCREENSHOTS_OUT ?? join(here, "../public/docs"));
/** The only data source: the checked-in test vault. */
export const FIXTURE_VAULT = join(REPO_ROOT, "test-vault");

/** Help pages exist per language, so every picture is taken per language: `name.png` and `name-en.png`. */
export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Files up to this size keep the repository small; a bigger picture fails the run instead of silently bloating it. */
export const MAX_BYTES = 300 * 1024;

export const BROWSER_LOCALE: Record<Locale, string> = { de: "de-DE", en: "en-US" };

const HIDE_DEV_OVERLAY_AND_MOTION = [
  "nextjs-portal { display: none !important; }",
  "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
].join("\n");

export function fileName(name: string, locale: Locale): string {
  return locale === "de" ? `${name}.png` : `${name}-en.png`;
}

/** Writes one picture into {@link OUT_DIR} and checks its size. `target` is the whole page unless a locator is given. */
export async function capture(
  page: Page,
  name: string,
  locale: Locale,
  options: { target?: Locator; clip?: { x: number; y: number; width: number; height: number } } = {},
): Promise<string> {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, fileName(name, locale));
  await page.evaluate(() => document.fonts.ready);
  const common = { path, type: "png" as const, animations: "disabled" as const, caret: "hide" as const, style: HIDE_DEV_OVERLAY_AND_MOTION };
  if (options.target) await options.target.screenshot(common);
  else await page.screenshot({ ...common, clip: options.clip });
  const size = statSync(path).size;
  expect(size, `${relative(REPO_ROOT, path)} is ${(size / 1024).toFixed(0)} KB, limit ${MAX_BYTES / 1024} KB`).toBeLessThanOrEqual(MAX_BYTES);
  return path;
}

/** All Markdown files of the fixture vault as `{ "Konzepte/Graphentheorie.md": "…" }`. */
export function readFixtureVault(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) files[relative(FIXTURE_VAULT, full).split("\\").join("/")] = readFileSync(full, "utf8");
    }
  };
  walk(FIXTURE_VAULT);
  return files;
}
