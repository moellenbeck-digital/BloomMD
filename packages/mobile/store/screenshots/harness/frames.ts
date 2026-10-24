/**
 * Captioned marketing frames from the raw simulator screenshots: a headline above the screenshot,
 * rendered with Playwright at exactly the store pixel size. The raw screenshots stay untouched.
 *
 *   bun packages/mobile/store/screenshots/harness/frames.ts
 *
 * Reads `store/screenshots/ios/<locale>/<device>/NN-<scene>.png`, writes
 * `store/screenshots/ios-framed/<locale>/<device>/NN-<scene>.png`.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(resolve(import.meta.dirname, "../../../../../apps/marketing/package.json"));
const { chromium } = require("@playwright/test") as typeof import("@playwright/test");

const ROOT = resolve(import.meta.dirname, "..");
const SIZES: Record<string, { width: number; height: number }> = {
  "iphone-6.9": { width: 1320, height: 2868 },
  "ipad-13": { width: 2064, height: 2752 },
};

const CAPTIONS: Record<string, Record<string, [string, string]>> = {
  "de-DE": {
    map: ["Markdown wird Mind Map", "Jede Überschrift ein Knoten – die Datei bleibt Markdown."],
    handwriting: ["Mit dem Apple Pencil", "Formeln und Skizzen direkt im Knoten, gespeichert als SVG."],
    vault: ["Dein Obsidian-Vault", "Direkt aus iCloud Drive bearbeiten – ohne Import."],
    outline: ["Gliederung zum Wiederholen", "Dieselbe Notiz als übersichtliche Liste."],
    tasks: ["Aufgaben und Entscheidungen", "Status, Fälligkeit und Verantwortliche im Knoten."],
    presentation: ["Knoten für Knoten", "Die Präsentationsansicht zum Lernen und Vorstellen."],
  },
  "en-US": {
    map: ["Markdown becomes a mind map", "Every heading is a node – the file stays Markdown."],
    handwriting: ["Write with Apple Pencil", "Formulas and sketches inside a node, saved as SVG."],
    vault: ["Your Obsidian vault", "Edit it right in iCloud Drive – no import."],
    outline: ["An outline for revision", "The same note as a clear, indented list."],
    tasks: ["Tasks and decisions", "Status, due date and owner right on the node."],
    presentation: ["One node at a time", "Presentation view for studying and presenting."],
  },
};

function page(image: string, size: { width: number; height: number }, title: string, subtitle: string): string {
  const scale = size.width / 1320;
  const shotHeight = Math.round(size.height * 0.76);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${size.width}px; height: ${size.height}px; overflow: hidden; }
    body { background: linear-gradient(160deg, #FF6B35 0%, #F7931E 100%); font-family: ui-rounded, -apple-system, "SF Pro Rounded", system-ui, sans-serif; color: #fff; display: flex; flex-direction: column; align-items: center; }
    h1 { margin: ${Math.round(150 * scale)}px ${Math.round(90 * scale)}px 0; font-size: ${Math.round(104 * scale)}px; line-height: 1.08; letter-spacing: -0.02em; text-align: center; font-weight: 800; }
    p { margin: ${Math.round(30 * scale)}px ${Math.round(110 * scale)}px 0; font-size: ${Math.round(50 * scale)}px; line-height: 1.3; text-align: center; color: #FFF4EE; font-weight: 500; }
    .shot { margin-top: auto; height: ${shotHeight}px; border-radius: ${Math.round(70 * scale)}px ${Math.round(70 * scale)}px 0 0; overflow: hidden; box-shadow: 0 0 ${Math.round(80 * scale)}px rgba(26,26,26,0.25); border: ${Math.round(14 * scale)}px solid #1A1A1A; border-bottom: 0; }
    .shot img { display: block; height: ${Math.round(size.height * 0.86)}px; }
  </style></head><body><h1>${title}</h1><p>${subtitle}</p><div class="shot"><img src="data:image/png;base64,${image}"></div></body></html>`;
}

const browser = await chromium.launch();
for (const locale of Object.keys(CAPTIONS)) {
  for (const device of Object.keys(SIZES)) {
    const dir = join(ROOT, "ios", locale, device);
    if (!existsSync(dir)) continue;
    const size = SIZES[device]!;
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    const tab = await context.newPage();
    const outDir = join(ROOT, "ios-framed", locale, device);
    mkdirSync(outDir, { recursive: true });
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".png")).sort()) {
      const scene = file.replace(/^\d+-/, "").replace(/\.png$/, "");
      const caption = CAPTIONS[locale]![scene];
      if (!caption) throw new Error(`No caption for ${locale}/${scene}`);
      await tab.setContent(page(readFileSync(join(dir, file)).toString("base64"), size, caption[0], caption[1]));
      await tab.screenshot({ path: join(outDir, file), type: "png" });
      console.log(join(outDir, file));
    }
    await context.close();
  }
}
await browser.close();
