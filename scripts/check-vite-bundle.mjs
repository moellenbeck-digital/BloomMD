import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const [distDir = "dist", rawEntryBudget = "1800000", rawLazyBudget = "1750000"] = process.argv.slice(2);
const entryBudget = Number(rawEntryBudget);
const lazyBudget = Number(rawLazyBudget);
if (!Number.isSafeInteger(entryBudget) || !Number.isSafeInteger(lazyBudget)) {
  throw new Error("Bundle budgets must be positive integer byte counts.");
}

const html = await readFile(join(distDir, "index.html"), "utf8");
const entryMatch = html.match(/<script[^>]+src=["'](?:\.\/|\/)?(assets\/[^"']+\.js)["']/);
if (!entryMatch?.[1]) throw new Error(`Could not identify the Vite entry chunk in ${distDir}/index.html.`);

async function verify(filePath, budget, label) {
  const bytes = (await stat(filePath)).size;
  if (bytes > budget) throw new Error(`${label} is ${bytes} bytes, above the ${budget}-byte release budget.`);
  console.log(`${label}: ${bytes} / ${budget} bytes`);
}

await verify(join(distDir, entryMatch[1]), entryBudget, "Initial JavaScript entry");

const assetsDir = join(distDir, "assets");
const lazyEditor = (await readdir(assetsDir)).find((name) => /^NodeEditor-.*\.js$/.test(name));
if (lazyEditor) await verify(join(assetsDir, lazyEditor), lazyBudget, "Lazy node editor");
