import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

interface Options {
  force: boolean;
  releaseDir: string;
  sourceVault: string;
  target: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    force: false,
    releaseDir: "",
    sourceVault: "test-vault",
    target: ".qa/obsidian-clean-vault/BloomMD Obsidian Clean Vault",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      options.force = true;
      continue;
    }

    const next = argv[index + 1];
    if (!next) throw new Error(`${arg} requires a value.`);

    if (arg === "--release-dir") options.releaseDir = next;
    else if (arg === "--source-vault") options.sourceVault = next;
    else if (arg === "--target") options.target = next;
    else throw new Error(`Unknown option: ${arg}`);

    index += 1;
  }

  return options;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function assertFile(filePath: string): Promise<void> {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`${filePath} is not a file.`);
}

async function assertDirectory(filePath: string): Promise<void> {
  const info = await stat(filePath);
  if (!info.isDirectory()) throw new Error(`${filePath} is not a directory.`);
}

function toObsidianPathUri(filePath: string): string {
  return `obsidian://open?path=${encodeURIComponent(filePath)}`;
}

const root = process.cwd();
const options = parseArgs(process.argv.slice(2));
const sourceVault = path.resolve(root, options.sourceVault);
const sourceManifest = JSON.parse(await readFile(path.join(root, "plugins/obsidian/manifest.json"), "utf8")) as { version?: string };
if (!sourceManifest.version) throw new Error("plugins/obsidian/manifest.json does not define a version.");
const pluginRoot = path.join(root, "plugins/obsidian");
const releaseDir = path.resolve(root, options.releaseDir || `plugins/obsidian/release/${sourceManifest.version}`);
const target = path.resolve(root, options.target);
const pluginTarget = path.join(target, ".obsidian", "plugins", "bloommd");

await assertDirectory(sourceVault);
if (!options.releaseDir) {
  console.log("Building the canonical Obsidian plugin release for this clean-vault QA run...");
  const buildProcess = Bun.spawn([process.execPath, "run", "release:package"], { cwd: pluginRoot, stdout: "inherit", stderr: "inherit" });
  if (await buildProcess.exited !== 0) throw new Error("Could not build the canonical Obsidian plugin release.");
}
await assertDirectory(releaseDir);

for (const file of ["manifest.json", "main.js", "shared-runtime.js", "styles.css"]) {
  await assertFile(path.join(releaseDir, file));
}

if (await exists(target)) {
  if (!options.force) {
    throw new Error(`${target} already exists. Pass --force to recreate it.`);
  }
  await rm(target, { recursive: true, force: true });
}

await mkdir(path.dirname(target), { recursive: true });
await cp(sourceVault, target, {
  recursive: true,
  filter: (source) => !source.includes(`${path.sep}.obsidian${path.sep}`) && !source.endsWith(`${path.sep}.obsidian`),
});

await mkdir(pluginTarget, { recursive: true });
for (const file of ["manifest.json", "main.js", "shared-runtime.js", "styles.css"]) {
  await cp(path.join(releaseDir, file), path.join(pluginTarget, file));
}

await writeFile(path.join(target, ".obsidian", "community-plugins.json"), `${JSON.stringify(["bloommd"], null, 2)}\n`);
await writeFile(path.join(target, ".obsidian", "app.json"), `${JSON.stringify({ legacyEditor: false, livePreview: true }, null, 2)}\n`);

const manifest = JSON.parse(await readFile(path.join(releaseDir, "manifest.json"), "utf8")) as { version?: string };
const demoNote = path.join(target, "Aufnahmen", "Obsidian Demo.md");

console.log(`Prepared Obsidian clean vault: ${target}`);
console.log(`Plugin version: ${manifest.version ?? "unknown"}`);
console.log(`Plugin path: ${pluginTarget}`);
console.log(`Demo note: ${demoNote}`);
console.log("");
console.log("Open commands:");
console.log(`open -a Obsidian ${JSON.stringify(target)}`);
console.log(`open ${JSON.stringify(toObsidianPathUri(demoNote))}`);
