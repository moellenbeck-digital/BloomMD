/**
 * App Store "Kopfzeile" (product page header) artwork, 3840 × 1646 px, in the style of the
 * captioned frames: headline on the BloomMD orange gradient next to three raw iPad screenshots.
 * Apple crops the header differently per device, so the essential content stays in the middle.
 *
 *   bun packages/mobile/store/screenshots/harness/header.ts
 *
 * Reads `store/screenshots/ios/<locale>/ipad-13/*.png`, writes `store/screenshots/ios-header/<locale>.png`.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(resolve(import.meta.dirname, "../../../../../apps/marketing/package.json"));
const { chromium } = require("@playwright/test") as typeof import("@playwright/test");

const ROOT = resolve(import.meta.dirname, "..");
const SIZE = { width: 3840, height: 1646 };
const SHOTS = ["02-handwriting.png", "01-map.png", "03-vault.png"];

const TEXT: Record<string, [string, string]> = {
  "de-DE": ["Markdown-Notizen als Mind Map", "Dein Obsidian-Vault, der Apple Pencil und normale Markdown-Dateien."],
  "en-US": ["Markdown notes as mind maps", "Your Obsidian vault, Apple Pencil and plain Markdown files."],
};

function page(images: string[], title: string, subtitle: string): string {
  const shots = images
    .map((image, index) => `<div class="shot s${index}"><img src="data:image/png;base64,${image}"></div>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${SIZE.width}px; height: ${SIZE.height}px; overflow: hidden; }
    body { background: linear-gradient(120deg, #FF6B35 0%, #F7931E 100%); font-family: ui-rounded, -apple-system, "SF Pro Rounded", system-ui, sans-serif; color: #fff; position: relative; }
    .text { position: absolute; left: 640px; top: 0; bottom: 0; width: 1180px; display: flex; flex-direction: column; justify-content: center; }
    .brand { font-size: 64px; font-weight: 700; letter-spacing: 0.02em; color: #FFF4EE; margin: 0 0 28px; }
    h1 { margin: 0; font-size: 132px; line-height: 1.04; letter-spacing: -0.02em; font-weight: 800; }
    p { margin: 40px 0 0; font-size: 56px; line-height: 1.3; color: #FFF4EE; font-weight: 500; }
    .shot { position: absolute; width: 620px; height: 827px; border-radius: 44px; overflow: hidden; border: 12px solid #1A1A1A; box-shadow: 0 30px 90px rgba(26,26,26,0.3); background: #fff; }
    .shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
    .s0 { left: 1960px; top: 470px; transform: rotate(-4deg); }
    .s1 { left: 2380px; top: 360px; z-index: 2; width: 700px; height: 933px; }
    .s2 { left: 2880px; top: 470px; transform: rotate(4deg); }
  </style></head><body><div class="text"><div class="brand">BloomMD</div><h1>${title}</h1><p>${subtitle}</p></div>${shots}</body></html>`;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 });
const tab = await context.newPage();
const outDir = join(ROOT, "ios-header");
mkdirSync(outDir, { recursive: true });
for (const [locale, [title, subtitle]] of Object.entries(TEXT)) {
  const images = SHOTS.map((file) => readFileSync(join(ROOT, "ios", locale, "ipad-13", file)).toString("base64"));
  await tab.setContent(page(images, title, subtitle));
  const out = join(outDir, `${locale}.png`);
  await tab.screenshot({ path: out, type: "png" });
  console.log(out);
}
await browser.close();
