/**
 * Drives a real Obsidian desktop app through the BloomMD handwriting flows.
 *
 * Obsidian runs with an isolated profile (its own user-data dir) against the generated clean QA
 * vault, so the tester's own vaults and settings are never touched. Playwright attaches over the
 * Chrome DevTools Protocol, which also lets us send genuine `pointerType: "pen"` and touch input.
 *
 * Runs under Node (not Bun): Playwright's CDP WebSocket connection does not complete under Bun.
 *
 * Usage: bun run qa:obsidian-ink-smoke [--skip-build] [--keep-open] [--app /Applications/Obsidian.app]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Browser, type CDPSession, type Locator, type Page } from "playwright-core";

interface Options {
  app: string;
  skipBuild: boolean;
  keepOpen: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { app: "/Applications/Obsidian.app", skipBuild: false, keepOpen: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--skip-build") options.skipBuild = true;
    else if (arg === "--keep-open") options.keepOpen = true;
    else if (arg === "--app" && argv[index + 1]) options.app = argv[++index]!;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

const root = process.cwd();
const options = parseArgs(process.argv.slice(2));
// Vault and profile live outside the repository: a checkout inside an iCloud-synced folder (such as
// ~/Documents) gets " 2" conflict copies when the vault is recreated, which corrupts the test data.
const qaRoot = path.join(tmpdir(), "bloommd-obsidian-ink-smoke");
const vault = path.join(qaRoot, "BloomMD Obsidian Clean Vault");
const profile = path.join(qaRoot, "profile");
const artifacts = path.join(root, "artifacts/obsidian-ink-smoke");
const DEMO_NOTE = "Aufnahmen/Obsidian Demo.md";
/** Stands in for BloomMD Desktop's handoff socket, so "Open app" can be checked without the app. */
const desktopHandoff = path.join(qaRoot, "desktop-handoff.sock");
const STEP_TIMEOUT = 60_000;
/** Mirrors PEN_COOLDOWN_MS in plugins/obsidian/src/pen-gestures.ts. */
const PEN_COOLDOWN = 400;

interface StepResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: StepResult[] = [];

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("No port"))));
    });
  });
}

async function run(command: string[], cwd = root): Promise<void> {
  // The smoke is the touch matrix itself, so its build may carry mobile support before it is verified.
  const env = { ...process.env, BLOOMMD_ALLOW_UNVERIFIED_MOBILE: "1" };
  const child = spawn(command[0]!, command.slice(1), { cwd, stdio: "inherit", env });
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  if (code !== 0) throw new Error(`${command.join(" ")} failed.`);
}

interface StoredInk {
  strokes: Array<{ tool: string; points: Array<[number, number, number]> }>;
  links: Array<{ target: string; strokeIds: string[] }>;
}

/** Reads the editable data of a BloomMD ink SVG; the unit tests cover the full parser. */
function storedInk(svg: string): StoredInk {
  const json = /<metadata id="bloommd-ink">([\s\S]*?)<\/metadata>/.exec(svg)?.[1];
  if (!json) throw new Error("Drawing file has no BloomMD ink metadata.");
  return JSON.parse(json) as StoredInk;
}

/** Obsidian keeps app updates as `obsidian-<version>.asar` in its profile; reuse the newest one. */
async function prepareProfile(): Promise<void> {
  await rm(profile, { recursive: true, force: true });
  await mkdir(profile, { recursive: true });
  const userProfile = path.join(homedir(), "Library/Application Support/obsidian");
  try {
    const asars = (await readdir(userProfile)).filter((name) => /^obsidian-[\d.]+\.asar$/.test(name)).sort();
    const newest = asars[asars.length - 1];
    if (newest) await cp(path.join(userProfile, newest), path.join(profile, newest));
  } catch (error) {
    console.warn(`No Obsidian app update found in ${userProfile}; using the installer version.`, error);
  }
  const vaults = { bloommdinksmoke01: { path: vault, ts: Date.now(), open: true } };
  await writeFile(path.join(profile, "obsidian.json"), JSON.stringify({ vaults }));
}

async function launchObsidian(port: number): Promise<ChildProcess> {
  const binary = path.join(options.app, "Contents/MacOS/Obsidian");
  await stat(binary);
  const child = spawn(binary, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], {
    stdio: "ignore",
    env: { ...process.env, BLOOMMD_DESKTOP_HANDOFF_PATH: desktopHandoff },
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return child;
    } catch {
      // Obsidian is still starting.
    }
    await sleep(500);
  }
  child.kill();
  throw new Error("Obsidian did not expose the DevTools endpoint within 30 seconds.");
}

/** Obsidian sometimes ignores SIGTERM after a mobile-emulation reload; never leave it running. */
async function stopObsidian(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), sleep(5_000).then(() => false)]);
  if (!stopped) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function step(name: string, page: Page, action: () => Promise<string>): Promise<void> {
  const shot = path.join(artifacts, `${String(results.length + 1).padStart(2, "0")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
  try {
    // A step must never hang the run, e.g. on an unexpected Obsidian confirmation dialog.
    const detail = await Promise.race([
      action(),
      sleep(STEP_TIMEOUT).then(() => { throw new Error(`Step timed out after ${STEP_TIMEOUT / 1000}s (open dialog?).`); }),
    ]);
    results.push({ name, ok: true, detail });
    console.log(`✓ ${name} — ${detail}`);
  } catch (error) {
    const lines = error instanceof Error ? error.message.split("\n") : [String(error)];
    const locator = lines.find((line) => line.includes("waiting for"))?.trim();
    const detail = locator ? `${lines[0]} (${locator})` : lines[0]!;
    results.push({ name, ok: false, detail });
    console.error(`✗ ${name} — ${detail}`);
  }
  await page.screenshot({ path: shot }).catch((error: unknown) => console.warn(`Screenshot failed for ${name}`, error));
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

type Point = [x: number, y: number, pressure: number];

async function penStroke(cdp: CDPSession, page: Page, points: Point[]): Promise<void> {
  const surface = await page.locator(".bloommd-ink-surface").boundingBox();
  if (!surface) throw new Error("Drawing surface is not visible.");
  const send = (type: "mousePressed" | "mouseMoved" | "mouseReleased", [x, y, force]: Point) => cdp.send("Input.dispatchMouseEvent", {
    type,
    x: surface.x + x,
    y: surface.y + y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
    pointerType: "pen",
    force,
  });
  await send("mousePressed", points[0]!);
  for (const point of points.slice(1)) await send("mouseMoved", point);
  await send("mouseReleased", points[points.length - 1]!);
}

/** A genuine touch tap (pointerType "touch") at the centre of an element. */
async function tap(cdp: CDPSession, page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} is not visible.`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** A genuine touch or Apple Pencil tap at the centre of a located element. */
async function tapOn(cdp: CDPSession, target: Locator, pointer: "touch" | "pen"): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error("Tap target is not visible.");
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  if (pointer === "touch") {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  for (const type of ["mousePressed", "mouseReleased"] as const) {
    await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1, pointerType: "pen", force: 0.5 });
  }
}

/** Personal learning progress files in the vault's hidden .bloommd folder. */
async function learningFiles(page: Page): Promise<Array<{ path: string; data: { examDate?: string; entries: Record<string, { level: number; due: string }> } }>> {
  return page.evaluate(async () => {
    const adapter = (window as unknown as { app: { vault: { adapter: { exists(path: string): Promise<boolean>; list(path: string): Promise<{ files: string[] }>; read(path: string): Promise<string> } } } }).app.vault.adapter;
    if (!(await adapter.exists(".bloommd/learning"))) return [];
    const { files } = await adapter.list(".bloommd/learning");
    return Promise.all(files.map(async (path) => ({ path, data: JSON.parse(await adapter.read(path)) })));
  });
}

async function touchDrag(cdp: CDPSession, from: [number, number], to: [number, number]): Promise<void> {
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) => cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
  });
  await touch("touchStart", from[0], from[1]);
  for (let index = 1; index <= 6; index += 1) {
    await touch("touchMove", from[0] + ((to[0] - from[0]) * index) / 6, from[1] + ((to[1] - from[1]) * index) / 6);
  }
  await touch("touchEnd", to[0], to[1]);
}

const wave = (x0: number, y0: number, width: number, height: number, samples = 24): Point[] =>
  Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1);
    return [x0 + width * t, y0 + Math.sin(t * Math.PI * 2) * height, 0.2 + 0.7 * Math.sin(t * Math.PI)];
  });

async function vaultState(page: Page): Promise<{ markdown: string; svgs: Array<{ path: string; content: string }> }> {
  return page.evaluate(async (note) => {
    const obsidian = (window as unknown as { app: ObsidianApp }).app;
    const file = obsidian.vault.getAbstractFileByPath(note);
    const markdown = file ? await obsidian.vault.read(file) : "";
    const svgs = await Promise.all(
      obsidian.vault.getFiles().filter((entry) => entry.extension === "svg" && entry.path.includes(" ink")).map(async (entry) => ({ path: entry.path, content: await obsidian.vault.read(entry) })),
    );
    return { markdown, svgs };
  }, DEMO_NOTE);
}

/** Minimal surface of Obsidian's global `app` (and BloomMD's plugin instance) used inside page.evaluate. */
interface ObsidianFile {
  path: string;
  extension: string;
}
interface QaPlugin {
  manifest: { version: string };
  settings: { showNodeContent: boolean; learning: { display: string; levels: number } };
  saveSettings(): Promise<void>;
  resetLearning(): Promise<void>;
  getOrCreateView(): Promise<{ leaf: unknown }>;
  loadFileIntoView(path: string, view: unknown): Promise<void>;
}
interface ObsidianApp {
  vault: {
    getAbstractFileByPath(path: string): ObsidianFile | null;
    read(file: ObsidianFile): Promise<string>;
    getFiles(): ObsidianFile[];
  };
  workspace: {
    layoutReady: boolean;
    getLeavesOfType(type: string): Array<{ detach(): void }>;
    revealLeaf(leaf: unknown): Promise<void>;
  };
  plugins: {
    setEnable(enabled: boolean): Promise<void>;
    enablePlugin(id: string): Promise<void>;
    plugins: Record<string, QaPlugin | undefined>;
  };
  emulateMobile?(enabled: boolean): void;
}

/** Collapsed state of Obsidian's sidebars; mobile swipes toggle them. */
async function sidebarState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const workspace = (window as unknown as { app: { workspace: { leftSplit: { collapsed: boolean }; rightSplit: { collapsed: boolean } } } }).app.workspace;
    return `left:${workspace.leftSplit.collapsed ? "closed" : "open"} right:${workspace.rightSplit.collapsed ? "closed" : "open"}`;
  });
}

async function openDemoMap(page: Page): Promise<void> {
  await page.evaluate(async (note) => {
    // Private plugin API is fine for QA: it opens the map without depending on window focus.
    const obsidian = (window as unknown as { app: ObsidianApp }).app;
    obsidian.workspace.getLeavesOfType("markdown").forEach((leaf) => leaf.detach());
    const plugin = obsidian.plugins.plugins.bloommd;
    if (!plugin) throw new Error("BloomMD is not loaded.");
    const view = await plugin.getOrCreateView();
    await plugin.loadFileIntoView(note, view);
    await obsidian.workspace.revealLeaf(view.leaf);
  }, DEMO_NOTE);
  await page.locator(".bloommd-react-shell").waitFor();
  await page.waitForTimeout(400);
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") throw new Error("The Obsidian ink smoke currently runs on macOS.");
  await rm(artifacts, { recursive: true, force: true });
  await mkdir(artifacts, { recursive: true });
  const prepare = ["bun", "scripts/qa/prepare-obsidian-clean-vault.ts", "--force", "--target", vault];
  if (options.skipBuild) {
    const manifest = JSON.parse(await readFile("plugins/obsidian/manifest.json", "utf8")) as { version: string };
    prepare.push("--release-dir", `plugins/obsidian/release/${manifest.version}`);
  }
  await run(prepare);
  await prepareProfile();

  const port = await freePort();
  const obsidian = await launchObsidian(port);
  let browser: Browser | null = null;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    if (!context) throw new Error("Obsidian exposed no browser context.");
    let page = context.pages().find((candidate) => candidate.url().startsWith("app://obsidian.md"));
    for (let attempt = 0; !page && attempt < 20; attempt += 1) {
      await sleep(500);
      page = context.pages().find((candidate) => candidate.url().startsWith("app://obsidian.md"));
    }
    if (!page) throw new Error("Obsidian window not found.");
    const cdp = await context.newCDPSession(page);
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.waitForFunction(() => Boolean((window as unknown as { app?: Partial<ObsidianApp> }).app?.workspace?.layoutReady), undefined, { timeout: 30_000 });

    await step("Plugin loads", page, async () => {
      const trust = page!.locator(".modal button", { hasText: /Trust|vertrauen/i });
      if (await trust.count()) await trust.first().click();
      const version = await page!.evaluate(async () => {
        const obsidian = (window as unknown as { app: ObsidianApp & { vault: { setConfig(key: string, value: unknown): void } } }).app;
        // macOS uses native OS menus by default, which the DOM cannot see; iPad always uses DOM menus.
        obsidian.vault.setConfig("nativeMenus", false);
        await obsidian.plugins.setEnable(true);
        // Obsidian may still be loading the plugin from community-plugins.json; enabling it again in
        // parallel would register the view twice. Wait for that load before enabling explicitly.
        for (let attempt = 0; attempt < 40 && !obsidian.plugins.plugins.bloommd; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!obsidian.plugins.plugins.bloommd) await obsidian.plugins.enablePlugin("bloommd");
        return obsidian.plugins.plugins.bloommd?.manifest.version;
      });
      expect(Boolean(version), "BloomMD did not load.");
      await openDemoMap(page!);
      return `BloomMD ${version}, map rendered`;
    });

    await step("Inspector full screen", page, async () => {
      await page!.locator(".bloommd-open-inspector").click();
      await page!.getByRole("button", { name: "Full screen" }).click();
      const inspector = await page!.locator(".bloommd-inspector").boundingBox();
      const shell = await page!.locator(".bloommd-react-shell").boundingBox();
      expect(Boolean(inspector && shell && Math.abs(inspector.width - shell.width) < 1 && Math.abs(inspector.height - shell.height) < 1), "Full screen inspector does not cover the view.");
      await page!.keyboard.press("Escape");
      expect((await page!.locator(".bloommd-inspector.is-fullscreen").count()) === 0, "Escape did not leave full screen.");
      expect((await page!.locator(".bloommd-inspector").count()) === 1, "Escape closed the inspector instead of leaving full screen.");
      return `covers ${Math.round(shell!.width)}×${Math.round(shell!.height)}, Escape leaves full screen`;
    });

    const toolbar = page.getByRole("toolbar", { name: "Handwriting tools" });
    const closeInspectorIfOpen = async () => {
      const exit = page!.getByRole("button", { name: "Exit full screen" });
      if (await exit.count()) await exit.click();
      const close = page!.getByRole("button", { name: "Close inspector" });
      if (await close.count()) await close.click();
    };
    const strokes = page.locator(".bloommd-ink-surface path[data-stroke-id]");

    await step("New drawing with pen and highlighter", page, async () => {
      await page!.getByRole("tab", { name: /Handwriting/ }).click();
      await page!.getByRole("button", { name: "New drawing" }).click();
      await page!.locator(".bloommd-ink-surface").waitFor();
      expect((await page!.locator(".bloommd-inspector.is-fullscreen").count()) === 1 || ((await page!.locator(".bloommd-inspector").boundingBox())?.width ?? 0) >= 520, "Narrow inspector did not switch to full screen for drawing.");
      await penStroke(cdp, page!, wave(60, 90, 160, 30));
      await penStroke(cdp, page!, wave(260, 90, 120, 20));
      await toolbar.getByRole("button", { name: "Highlighter", exact: true }).click();
      await penStroke(cdp, page!, [[50, 90, 0.5], [400, 90, 0.5]]);
      expect((await strokes.count()) === 3, `Expected 3 strokes, found ${await strokes.count()}.`);
      await page!.waitForTimeout(1_200);
      const state = await vaultState(page!);
      expect(state.svgs.length === 1, `Expected one drawing file, found ${state.svgs.length}.`);
      const ink = storedInk(state.svgs[0]!.content);
      expect(ink.strokes.length === 3, "Saved drawing does not contain 3 strokes.");
      const pressures = ink.strokes[0]!.points.map((point) => point[2]);
      expect(Math.max(...pressures) - Math.min(...pressures) > 0.3, "Pen pressure was not recorded.");
      expect(ink.strokes[2]!.tool === "highlighter", "Third stroke is not a highlighter stroke.");
      const embed = state.markdown.match(/!\[\[[^\]]+ ink\.svg]]/)?.[0];
      expect(Boolean(embed), "Drawing is not embedded into the node Markdown.");
      return `${state.svgs[0]!.path} saved with pressure ${Math.min(...pressures)}–${Math.max(...pressures)}, ${embed} in note`;
    });

    await step("Eraser and undo", page, async () => {
      await toolbar.getByRole("button", { name: "Eraser", exact: true }).click();
      const first = await strokes.first().boundingBox();
      if (!first) throw new Error("First stroke not visible.");
      const surface = (await page!.locator(".bloommd-ink-surface").boundingBox())!;
      const x = first.x - surface.x + first.width * 0.1;
      await penStroke(cdp, page!, Array.from({ length: 12 }, (_, index): Point => [x, first.y - surface.y - 10 + ((first.height + 20) * index) / 11, 0.5]));
      const afterErase = await strokes.count();
      expect(afterErase < 3, "Eraser removed nothing.");
      await toolbar.getByRole("button", { name: "Undo", exact: true }).click();
      expect((await strokes.count()) === 3, "Undo did not restore the erased strokes.");
      return `eraser removed ${3 - afterErase} stroke(s), undo restored them`;
    });

    await step("Finger pans instead of drawing", page, async () => {
      const surface = (await page!.locator(".bloommd-ink-surface").boundingBox())!;
      const group = page!.locator(".bloommd-ink-svg > g");
      const before = await group.getAttribute("transform");
      const center: [number, number] = [surface.x + surface.width / 2, surface.y + surface.height / 2];
      // Fingers are ignored briefly after the pen lifts (the writing hand is still resting).
      await page!.waitForTimeout(PEN_COOLDOWN + 100);
      await touchDrag(cdp, center, [center[0] + 80, center[1] + 40]);
      const after = await group.getAttribute("transform");
      expect(before !== after, "Finger drag did not move the canvas.");
      expect((await strokes.count()) === 3, "Finger drag drew a stroke.");
      return `${before} → ${after}`;
    });

    await step("Lasso moves and scales handwriting", page, async () => {
      // The finger-pan step moved the canvas; bring every stroke back into view first.
      await toolbar.getByRole("button", { name: "Fit drawing", exact: true }).click();
      await toolbar.getByRole("button", { name: "Lasso", exact: true }).click();
      const surface = (await page!.locator(".bloommd-ink-surface").boundingBox())!;
      const second = (await strokes.nth(1).boundingBox())!;
      const pad = 14;
      const [left, top, right, bottom] = [second.x - surface.x - pad, second.y - surface.y - pad, second.x - surface.x + second.width + pad, second.y - surface.y + second.height + pad];
      await penStroke(cdp, page!, [[left, top, 0.5], [right, top, 0.5], [right, bottom, 0.5], [left, bottom, 0.5], [left, top + 2, 0.5]]);
      const box = await page!.locator(".bloommd-ink-selection > rect").first().boundingBox();
      expect(Boolean(box), "No selection box after lassoing a word.");
      // Drag the selection 60 px down, then shrink it to half via its bottom-right handle.
      const center: Point = [box!.x - surface.x + box!.width / 2, box!.y - surface.y + box!.height / 2, 0.5];
      await penStroke(cdp, page!, [center, [center[0], center[1] + 30, 0.5], [center[0], center[1] + 60, 0.5]]);
      const moved = (await page!.locator(".bloommd-ink-selection > rect").first().boundingBox())!;
      expect(Math.abs(moved.y - box!.y - 60) < 2, `Selection moved ${moved.y - box!.y}px instead of 60px.`);
      const handle: Point = [moved.x - surface.x + moved.width, moved.y - surface.y + moved.height, 0.5];
      const target: Point = [moved.x - surface.x + moved.width / 2, moved.y - surface.y + moved.height / 2, 0.5];
      await penStroke(cdp, page!, [handle, [(handle[0] + target[0]) / 2, (handle[1] + target[1]) / 2, 0.5], target]);
      const scaled = (await page!.locator(".bloommd-ink-selection > rect").first().boundingBox())!;
      const ratio = scaled.width / moved.width;
      expect(Math.abs(ratio - 0.5) < 0.05, `Selection scaled to ${ratio.toFixed(2)} instead of 0.5.`);
      await page!.waitForTimeout(1_200);
      const saved = storedInk((await vaultState(page!)).svgs[0]!.content);
      expect(saved.strokes.length === 3, "Lasso edits changed the number of strokes.");
      return `moved 60 px and scaled to ${ratio.toFixed(2)}×, saved`;
    });

    await step("Link handwriting to a note", page, async () => {
      // The lasso step leaves the moved word selected; link it to an existing vault note.
      await toolbar.getByRole("button", { name: "Link to note", exact: true }).click();
      await page!.locator(".prompt-input").fill("Graphentheorie");
      await page!.locator(".suggestion-item").first().waitFor();
      await page!.keyboard.press("Enter");
      await page!.locator(".bloommd-ink-link-chip").first().waitFor();
      const chip = (await page!.locator(".bloommd-ink-link-chip").first().innerText()).trim();
      await page!.waitForTimeout(1_500);
      const state = await vaultState(page!);
      const ink = storedInk(state.svgs[0]!.content);
      expect(ink.links.length === 1 && ink.links[0]!.target === "Graphentheorie", `Unexpected links: ${JSON.stringify(ink.links)}`);
      expect(state.markdown.includes("[[Graphentheorie]]"), "Wikilink was not added to the node Markdown.");
      return `chip "${chip}", link stored in SVG, [[Graphentheorie]] added to the node`;
    });

    await step("Done shows the drawing in the node", page, async () => {
      await toolbar.getByRole("button", { name: "Done" }).click();
      await page!.waitForTimeout(800);
      expect((await page!.locator(".bloommd-ink-thumb .bloommd-ink-preview").count()) === 1, "Interactive drawing preview missing in the Text tab.");
      const svg = (await vaultState(page!)).svgs[0]!;
      expect(storedInk(svg.content).strokes.length === 3, "Saved file lost strokes after undo.");
      await page!.evaluate(async () => {
        const plugin = (window as unknown as { app: ObsidianApp }).app.plugins.plugins.bloommd;
        if (!plugin) throw new Error("BloomMD is not loaded.");
        plugin.settings.showNodeContent = true;
        await plugin.saveSettings();
      });
      await page!.getByRole("button", { name: "Exit full screen" }).click();
      await page!.getByRole("button", { name: "Close inspector" }).click();
      await page!.locator(".bloommd-node-drawing").first().waitFor();
      return "thumbnail in inspector, drawing preview on the map node";
    });

    await step("Hover preview and open linked note", page, async () => {
      const openInspector = page!.locator(".bloommd-open-inspector");
      if (await openInspector.count()) await openInspector.click();
      const link = page!.locator(".bloommd-ink-thumb .bloommd-ink-link").first();
      await link.waitFor();
      await link.hover();
      await page!.locator(".popover.hover-popover").first().waitFor({ timeout: 5_000 });
      const preview = (await page!.locator(".popover.hover-popover").first().innerText()).slice(0, 40).replace(/\s+/g, " ");
      await page!.screenshot({ path: path.join(artifacts, "hover-preview.png") });
      await page!.mouse.move(5, 5);
      await link.click();
      await page!.waitForFunction(() => (window as unknown as { app: { workspace: { getActiveFile(): { basename: string } | null } } }).app.workspace.getActiveFile()?.basename === "Graphentheorie", undefined, { timeout: 5_000 });
      await openDemoMap(page!);
      return `page preview shows "${preview}…", click opens Graphentheorie`;
    });

    await step("Renaming a linked note updates the drawing", page, async () => {
      await page!.evaluate(async () => {
        type RenameApp = ObsidianApp & {
          fileManager: { renameFile(file: ObsidianFile, path: string): Promise<void> };
          vault: { setConfig(key: string, value: unknown): void };
        };
        const obsidian = (window as unknown as { app: RenameApp }).app;
        // Without this vault setting Obsidian asks whether to update links and the rename waits for a click.
        obsidian.vault.setConfig("alwaysUpdateLinks", true);
        const note = obsidian.vault.getAbstractFileByPath("Konzepte/Graphentheorie.md");
        if (!note) throw new Error("Konzepte/Graphentheorie.md is missing.");
        await obsidian.fileManager.renameFile(note, "Konzepte/Graphen.md");
      });
      await page!.waitForTimeout(1_500);
      const state = await vaultState(page!);
      const targets = storedInk(state.svgs[0]!.content).links.map((link) => link.target);
      expect(targets.length === 1 && targets[0] === "Graphen", `Drawing still links to ${JSON.stringify(targets)}.`);
      expect(state.markdown.includes("[[Graphen]]"), "Obsidian did not update the node wikilink.");
      return "SVG link and [[Graphen]] follow the rename";
    });

    await step("Reopen drawing", page, async () => {
      const openInspector = page!.locator(".bloommd-open-inspector");
      if (await openInspector.count()) await openInspector.click();
      await page!.locator(".bloommd-ink-thumb").first().click();
      await strokes.first().waitFor();
      expect((await strokes.count()) === 3, "Reopened drawing does not show all strokes.");
      await toolbar.getByRole("button", { name: "Done" }).click();
      return "3 strokes restored from the SVG";
    });

    await step("Ink: dark paper swaps the palette", page, async () => {
      const openInspector = page!.locator(".bloommd-open-inspector");
      if (await openInspector.count()) await openInspector.click();
      await page!.locator(".bloommd-ink-thumb .bloommd-ink-thumb-edit").first().click();
      await strokes.first().waitFor();
      await toolbar.getByRole("button", { name: "Dark paper", exact: true }).click();
      await page!.waitForTimeout(1_200);
      const svg = (await vaultState(page!)).svgs[0]!.content;
      expect(svg.includes('fill="#1c1c1e"'), "Dark paper was not saved.");
      expect(storedInk(svg).strokes.some((entry) => (entry as unknown as { color: string }).color === "#f3f4f6"), "Black ink was not swapped for light ink.");
      const surface = await page!.locator(".bloommd-ink-surface").evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(surface === "rgb(28, 28, 30)", `Editor paper is ${surface}.`);
      return "dark paper saved, black ink → light ink, editor matches";
    });

    await step("Ink: paper, transparent, colour and width", page, async () => {
      const saved = async () => {
        await page!.waitForTimeout(1_200);
        return (await vaultState(page!)).svgs[0]!.content;
      };
      await toolbar.getByRole("button", { name: "Transparent", exact: true }).click();
      expect(!/<rect [^>]*fill=/.test(await saved()), "Transparent drawing still has a background.");
      await toolbar.getByRole("button", { name: "Paper", exact: true }).click();
      const paper = await saved();
      expect(/<rect [^>]*fill="#(?:fff|ffffff)"/i.test(paper), "Paper background was not saved.");
      await toolbar.getByRole("button", { name: "Pen", exact: true }).click();
      const swatches = toolbar.locator(".bloommd-ink-swatch");
      const color = (await swatches.nth(2).getAttribute("aria-label"))!.replace("Color ", "");
      await swatches.nth(2).click();
      await toolbar.getByRole("button", { name: "Bold stroke" }).click();
      const before = storedInk(paper).strokes.length;
      await penStroke(cdp, page!, wave(80, 200, 140, 16));
      const bold = storedInk(await saved()).strokes as unknown as Array<{ color: string; size: number }>;
      expect(bold.length === before + 1, `Strokes ${before} → ${bold.length}.`);
      const added = bold[bold.length - 1]!;
      expect(added.color.toLowerCase() === color.toLowerCase(), `New stroke is ${added.color}, picked ${color}.`);
      const thinnest = Math.min(...bold.slice(0, -1).map((entry) => entry.size));
      expect(added.size > thinnest, `Bold stroke (${added.size}) is not wider than earlier ones (${thinnest}).`);
      await toolbar.getByRole("button", { name: "Undo", exact: true }).click();
      await toolbar.getByRole("button", { name: "Medium stroke" }).click();
      await toolbar.getByRole("button", { name: "Dark paper", exact: true }).click();
      expect(storedInk(await saved()).strokes.length === before, "Undo did not remove the bold stroke.");
      return `transparent → no background, paper → white, ${color} bold stroke wider, undone`;
    });

    await step("Ink: text field on the drawing", page, async () => {
      await toolbar.getByRole("button", { name: "Text", exact: true }).click();
      const surface = (await page!.locator(".bloommd-ink-surface").boundingBox())!;
      await page!.mouse.click(surface.x + surface.width * 0.3, surface.y + surface.height * 0.8);
      const field = page!.getByRole("textbox", { name: "Text on drawing" });
      await field.waitFor();
      await field.fill("Arbeit");
      await page!.keyboard.press("Escape");
      await page!.locator(".bloommd-ink-surface text[data-text-id]").first().waitFor();
      await page!.waitForTimeout(1_200);
      const svg = (await vaultState(page!)).svgs[0]!.content;
      expect(/<text data-text-id="[^"]+"[^>]*><tspan[^>]*>Arbeit<\/tspan><\/text>/.test(svg), "Typed text is not in the SVG.");
      return "text field placed, \"Arbeit\" saved as SVG text";
    });

    await step("Ink: selection becomes a new node", page, async () => {
      await toolbar.getByRole("button", { name: "Lasso", exact: true }).click();
      const surface = (await page!.locator(".bloommd-ink-surface").boundingBox())!;
      const word = (await page!.locator(".bloommd-ink-surface text[data-text-id]").first().boundingBox())!;
      const pad = 12;
      const [left, top, right, bottom] = [word.x - surface.x - pad, word.y - surface.y - pad, word.x - surface.x + word.width + pad, word.y - surface.y + word.height + pad];
      await penStroke(cdp, page!, [[left, top, 0.5], [right, top, 0.5], [right, bottom, 0.5], [left, bottom, 0.5], [left, top + 2, 0.5]]);
      await toolbar.getByRole("button", { name: "New node from selection" }).click();
      await page!.waitForTimeout(1_500);
      const state = await vaultState(page!);
      const heading = /^(#{2,}) Arbeit <!-- bloommd:id=[0-9a-f]+ -->[\s\S]*?!\[\[([^\]]+ ink[^\]]*\.svg)\]\]/m.exec(state.markdown);
      expect(Boolean(heading), "No new child node \"Arbeit\" with its own drawing in the Markdown.");
      expect(state.svgs.length >= 2, "The new node has no drawing file.");
      const original = storedInk(state.svgs.find((entry) => !entry.path.endsWith(`${heading![2]}`) && entry.content.includes('"strokes"'))!.content);
      expect(!JSON.stringify(original).includes('"text":"Arbeit"'), "The text was copied instead of moved.");
      await toolbar.getByRole("button", { name: "Done" }).click();
      await closeInspectorIfOpen();
      await page!.locator(".bloommd-node-label", { hasText: /^Arbeit$/ }).waitFor();
      return `child node "${heading![1]} Arbeit" with ${heading![2]}, text moved out of the sketch`;
    });

    const nodeByTitle = (title: string) => page!.locator(".react-flow__node").filter({ has: page!.locator(".bloommd-node-label", { hasText: new RegExp(`^${title}$`) }) });
    const selectNode = async (title: string) => {
      await nodeByTitle(title).locator(".bloommd-node-label").click();
      const openInspector = page!.locator(".bloommd-open-inspector");
      if (await openInspector.count()) await openInspector.click();
      await page!.locator(".bloommd-inspector h3", { hasText: title }).waitFor();
    };
    const closeInspector = async () => {
      const exit = page!.getByRole("button", { name: "Exit full screen" });
      if (await exit.count()) await exit.click();
      const close = page!.getByRole("button", { name: "Close inspector" });
      if (await close.count()) await close.click();
    };

    await step("Concept map: link a node to a note", page, async () => {
      await closeInspector();
      await selectNode("Zielgruppe");
      await page!.getByRole("button", { name: "Link a note" }).click();
      await page!.locator(".prompt-input").fill("Speicherung");
      await page!.locator(".suggestion-item").first().waitFor();
      await page!.keyboard.press("Enter");
      await page!.locator(".bloommd-linked-note-open", { hasText: "Speicherung" }).waitFor();
      await page!.waitForTimeout(600);
      const markdown = (await vaultState(page!)).markdown;
      expect(markdown.includes('"note":"Speicherung"'), "Linked note is not stored in the node metadata.");
      expect(/### Zielgruppe[\s\S]*\[\[Speicherung\]\][\s\S]*## Quellen/.test(markdown), "[[Speicherung]] was not added to the node content.");
      await closeInspector();
      await nodeByTitle("Zielgruppe").locator(".bloommd-node-note", { hasText: "Speicherung" }).waitFor();
      return "note stored in metadata, [[Speicherung]] in the node, badge on the map";
    });

    await step("Concept map: node hover preview and open note", page, async () => {
      const badge = nodeByTitle("Zielgruppe").locator(".bloommd-node-note");
      await badge.hover();
      await page!.locator(".popover.hover-popover").first().waitFor({ timeout: 5_000 });
      const preview = (await page!.locator(".popover.hover-popover").first().innerText()).slice(0, 40).replace(/\s+/g, " ");
      await page!.screenshot({ path: path.join(artifacts, "node-hover-preview.png") });
      await page!.mouse.move(5, 5);
      await badge.click();
      await page!.waitForFunction(() => (window as unknown as { app: { workspace: { getActiveFile(): { basename: string } | null } } }).app.workspace.getActiveFile()?.basename === "Speicherung", undefined, { timeout: 5_000 });
      await openDemoMap(page!);
      return `preview "${preview}…", badge opens Speicherung`;
    });

    await step("Concept map: connect two nodes with a label", page, async () => {
      await page!.mouse.move(5, 5);
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      await nodeByTitle("Map").waitFor();
      await selectNode("Map");
      await page!.getByLabel("Connect to node").selectOption({ label: "Quellen" });
      await page!.getByLabel("Connection label").fill("belegt durch");
      await page!.getByRole("button", { name: "Add connection" }).click();
      await page!.waitForTimeout(600);
      await closeInspector();
      await page!.locator(".react-flow__edge-path.bloommd-relation-edge").first().waitFor();
      const label = (await page!.locator(".bloommd-relation-label").first().innerText()).trim();
      expect(label === "belegt durch", `Edge label is "${label}".`);
      const markdown = (await vaultState(page!)).markdown;
      expect(/### Map[^\n]*"relations":\[\{"target":"[0-9a-f]+","label":"belegt durch"\}\]/.test(markdown), "Connection is not stored in the Map node metadata.");
      return "dashed edge Map → Quellen labelled \"belegt durch\", stored in Markdown";
    });

    await step("Concept map: moving a node keeps it and its connections after reload", page, async () => {
      const node = nodeByTitle("Map");
      const before = (await node.boundingBox())!;
      await page!.mouse.move(before.x + 30, before.y + 12);
      await page!.mouse.down();
      await page!.mouse.move(before.x + 30, before.y + 90, { steps: 8 });
      await page!.mouse.move(before.x + 30, before.y + 160, { steps: 8 });
      await page!.mouse.up();
      await page!.waitForTimeout(400);
      const moved = (await node.boundingBox())!;
      expect(moved.y - before.y > 100, `Node moved only ${Math.round(moved.y - before.y)} px.`);
      const markdownBefore = (await vaultState(page!)).markdown;
      await openDemoMap(page!);
      const reloaded = (await nodeByTitle("Map").boundingBox())!;
      expect(Math.abs(reloaded.y - moved.y) < 2 && Math.abs(reloaded.x - moved.x) < 2, "Node position was not restored after reload.");
      expect((await page!.locator(".react-flow__edge-path.bloommd-relation-edge").count()) === 1, "Connection lost after moving the node.");
      expect((await vaultState(page!)).markdown === markdownBefore, "Moving a node changed the Markdown.");
      return `moved ${Math.round(moved.y - before.y)} px, position and connection restored, Markdown untouched`;
    });

    const focusOn = async (title: string) => {
      await nodeByTitle(title).locator(".bloommd-node-label").click();
      // Work at a readable zoom like a user would; at the fitted overview handles and action bars overlap.
      await page!.getByRole("button", { name: "Focus selected node" }).click();
      await page!.waitForTimeout(400);
    };

    await step("Concept map: resize a node, keep the size, reset it", page, async () => {
      await focusOn("Quellen");
      const node = nodeByTitle("Quellen");
      // Measure the visible card, not React Flow's wrapper: a stale card inside a resized wrapper is the bug to catch.
      const card = () => nodeByTitle("Quellen").locator(".bloommd-flow-node");
      const before = (await card().boundingBox())!;
      const handle = node.locator(".react-flow__resize-control.handle.bottom.right");
      const grip = (await handle.boundingBox())!;
      await page!.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page!.mouse.down();
      await page!.mouse.move(grip.x + 60, grip.y + 40, { steps: 6 });
      await page!.mouse.move(grip.x + 120, grip.y + 80, { steps: 6 });
      await page!.mouse.up();
      await page!.waitForTimeout(400);
      const resized = (await card().boundingBox())!;
      expect(resized.width - before.width > 100 && resized.height - before.height > 60, `Node grew only ${Math.round(resized.width - before.width)}×${Math.round(resized.height - before.height)} px.`);
      await openDemoMap(page!);
      const reloaded = (await card().boundingBox())!;
      expect(Math.abs(reloaded.width - resized.width) < 2 && Math.abs(reloaded.height - resized.height) < 2, "Node size was not restored after reload.");
      expect((await page!.locator(".react-flow__edge-path.bloommd-relation-edge").count()) === 1, "Connection lost after resizing.");
      await focusOn("Quellen");
      await nodeByTitle("Quellen").getByRole("button", { name: "Reset size" }).click();
      await page!.waitForTimeout(400);
      const reset = (await card().boundingBox())!;
      const zoom = await page!.evaluate(() => {
        const transform = document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform ?? "";
        return Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? "1");
      });
      // The default node is 236 px wide in map coordinates.
      expect(Math.abs(reset.width - 236 * zoom) < 3, `Reset width ${Math.round(reset.width)} px, expected ${Math.round(236 * zoom)} px.`);
      return `grew ${Math.round(before.width)}×${Math.round(before.height)} → ${Math.round(resized.width)}×${Math.round(resized.height)} px, kept after reload, reset restores`;
    });

    await step("Node menu by right click; action column clear of siblings", page, async () => {
      await focusOn("Projekt");
      const card = (await nodeByTitle("Projekt").locator(".bloommd-flow-node").boundingBox())!;
      const column = (await nodeByTitle("Projekt").locator(".bloommd-node-actions").boundingBox())!;
      expect(column.x >= card.x + card.width, "The action column overlaps the node.");
      const siblings = await page!.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map((rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })));
      const covered = siblings.filter((rect) => rect.x < column.x + column.width && rect.x + rect.width > column.x && rect.y < column.y + column.height && rect.y + rect.height > column.y);
      expect(covered.length === 0, `The action column covers ${covered.length} node(s).`);
      await nodeByTitle("Projekt").locator(".bloommd-node-label").click({ button: "right" });
      const menu = page!.locator(".menu").last();
      await menu.waitFor();
      const items = (await menu.locator(".menu-item-title").allInnerTexts()).map((item) => item.trim());
      for (const expected of ["Edit content", "Add child", "Add sibling", "Link a note", "Delete branch"]) {
        expect(items.includes(expected), `Menu lacks "${expected}": ${items.join(", ")}`);
      }
      await menu.locator(".menu-item", { hasText: "Edit content" }).click();
      await page!.locator(".bloommd-inspector h3", { hasText: "Projekt" }).waitFor();
      await closeInspectorIfOpen();
      return `menu: ${items.join(" · ")}; column right of the node, no overlap`;
    });

    await step("Study mode covers and reveals node contents", page, async () => {
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      const before = (await vaultState(page!)).markdown;
      await page!.getByRole("button", { name: "Study mode" }).click();
      const covers = page!.locator(".bloommd-study-cover");
      const total = await covers.count();
      expect(total >= 5, `Only ${total} nodes are covered.`);
      const status = page!.locator(".bloommd-study-bar");
      expect((await status.innerText()).includes(`0/${total} revealed`), `Status: ${await status.innerText()}`);
      await nodeByTitle("Quellen").locator(".bloommd-study-cover").click();
      await nodeByTitle("Quellen").locator(".bloommd-node-preview").waitFor();
      expect((await status.innerText()).includes(`1/${total} revealed`), `Status after one reveal: ${await status.innerText()}`);
      await page!.screenshot({ path: path.join(artifacts, "study-mode.png") });
      await status.getByRole("button", { name: /Reveal all/ }).click();
      expect((await covers.count()) === 0, "Reveal all left covered nodes.");
      await status.getByRole("button", { name: /Reset/ }).click();
      expect((await covers.count()) === total, "Reset did not cover the nodes again.");
      await page!.getByRole("button", { name: "Study mode" }).click();
      expect((await covers.count()) === 0 && (await status.count()) === 0, "Leaving study mode kept covers.");
      expect((await vaultState(page!)).markdown === before, "Study mode changed the note.");
      return `${total} cards covered, reveal one / all / reset, note untouched`;
    });

    const learnLevel = async (title: string) => nodeByTitle(title).locator(".bloommd-flow-node").getAttribute("data-learn-level");
    const setLearning = (patch: Record<string, unknown>) => page!.evaluate(async (next) => {
      const plugin = (window as unknown as { app: ObsidianApp }).app.plugins.plugins.bloommd!;
      Object.assign(plugin.settings.learning, next);
      await plugin.saveSettings();
    }, patch);
    let learningCards = 0;
    const studyButton = () => page!.getByRole("button", { name: "Study mode" });
    const leaveStudy = async () => {
      await page!.keyboard.press("Escape").catch(() => undefined);
      if ((await studyButton().getAttribute("aria-pressed")) === "true") await studyButton().click();
    };
    /** Selects a node without hit-testing (the study bar may cover it) and centres it like a user would. */
    const showNode = async (title: string) => {
      await nodeByTitle(title).locator(".bloommd-node-label").dispatchEvent("click");
      await page!.getByRole("button", { name: "Focus selected node" }).click();
      await page!.waitForTimeout(400);
    };

    await step("Learning: rate revealed nodes by pen, mouse and keys", page, async () => { try {
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      const before = (await vaultState(page!)).markdown;
      await page!.getByRole("button", { name: "Study mode" }).click();
      const bar = page!.locator(".bloommd-study-bar");
      learningCards = await page!.locator(".bloommd-study-cover").count();
      expect((await bar.innerText()).includes(`0/${learningCards} mastered · 0 due`), `Study bar: ${await bar.innerText()}`);
      // Apple Pencil reveals and rates "Quellen", the mouse "Projekt", the keyboard "Map" (fingers: mobile step).
      await showNode("Quellen");
      await tapOn(cdp, nodeByTitle("Quellen").locator(".bloommd-study-cover"), "pen");
      await tapOn(cdp, nodeByTitle("Quellen").getByRole("button", { name: "Got it" }), "pen");
      await showNode("Projekt");
      await nodeByTitle("Projekt").locator(".bloommd-study-cover").click();
      await nodeByTitle("Projekt").getByRole("button", { name: "Unsure" }).click();
      await showNode("Map");
      await page!.keyboard.press("Space");
      await nodeByTitle("Map").getByRole("button", { name: "New" }).waitFor();
      await page!.keyboard.press("1");
      await page!.waitForTimeout(800);
      const levels = [await learnLevel("Quellen"), await learnLevel("Projekt"), await learnLevel("Map")];
      expect(levels.join() === "2,1,0", `Levels on the map: ${levels.join()}`);
      const outline = await nodeByTitle("Quellen").locator(".bloommd-flow-node").evaluate((node) => getComputedStyle(node).outlineColor);
      expect(outline === "rgb(48, 164, 108)", `"Got it" border is ${outline}.`);
      expect((await nodeByTitle("Quellen").getByRole("button", { name: "Got it" }).getAttribute("aria-pressed")) === "true", "The chosen rating is not marked.");
      expect((await bar.innerText()).includes(`1/${learningCards} mastered · 1 due`), `Study bar after rating: ${await bar.innerText()}`);
      await page!.screenshot({ path: path.join(artifacts, "learning-rating.png") });
      const files = await learningFiles(page!);
      expect(files.length === 1 && Object.keys(files[0]!.data.entries).length === 3, `Progress files: ${JSON.stringify(files)}`);
      expect((await vaultState(page!)).markdown === before, "Rating changed the note.");
      return `pen, mouse and keys Space/1 rated 3 of ${learningCards} nodes, green border, ${files[0]!.path}, note untouched`;
    } finally { await leaveStudy(); } });

    await step("Learning: progress survives a plugin reload, settings change the display", page, async () => {
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      await page!.evaluate(async () => {
        const plugins = (window as unknown as { app: { plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<void> } } }).app.plugins;
        await plugins.disablePlugin("bloommd");
        await plugins.enablePlugin("bloommd");
      });
      await page!.waitForFunction(() => Boolean((window as unknown as { app: ObsidianApp }).app.plugins.plugins.bloommd), undefined, { timeout: 10_000 });
      await openDemoMap(page!);
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      await nodeByTitle("Quellen").locator(".bloommd-flow-node.learn-border").waitFor();
      const levels = [await learnLevel("Quellen"), await learnLevel("Projekt"), await learnLevel("Map")];
      expect(levels.join() === "2,1,0", `Levels after reload: ${levels.join()}`);
      expect((await nodeByTitle("Map").locator(".bloommd-learn-due").count()) === 1, "The node rated New is not marked due.");
      await page!.screenshot({ path: path.join(artifacts, "learning-map-border.png") });
      await setLearning({ display: "badge" });
      await nodeByTitle("Quellen").locator(".bloommd-learn-badge", { hasText: "Got it" }).waitFor();
      expect((await page!.locator(".bloommd-flow-node.learn-border").count()) === 0, "Badge display still draws borders.");
      await setLearning({ display: "fill", levels: 5 });
      await nodeByTitle("Projekt").locator(".bloommd-flow-node.learn-fill").waitFor();
      const five = [await learnLevel("Quellen"), await learnLevel("Projekt"), await learnLevel("Map")];
      expect(five.join() === "4,2,0", `Levels on a 5-level scale: ${five.join()}`);
      await page!.screenshot({ path: path.join(artifacts, "learning-map-fill.png") });
      await setLearning({ display: "border", levels: 3 });
      // The settings tab declares the Learning section (Obsidian 1.13 declarative settings).
      const learningSettings = await page!.evaluate(() => {
        type Item = { name?: string; heading?: string; items?: Item[] };
        const tabs = (window as unknown as { app: { setting: { pluginTabs: Array<{ id: string; getSettingDefinitions(): Item[] }> } } }).app.setting.pluginTabs;
        const group = tabs.find((tab) => tab.id === "bloommd")?.getSettingDefinitions().find((item) => item.heading === "Learning");
        return group?.items?.map((item) => item.name ?? "") ?? [];
      });
      for (const name of ["Learning progress", "Levels", "Show on the map", "Spaced repetition", "Default study order", "Reset progress for the current map"]) {
        expect(learningSettings.includes(name), `Settings lack "${name}": ${learningSettings.join(", ")}`);
      }
      return `levels restored from .bloommd/learning after reload, due marker, border → badge → fill, 3 → 5 levels; Learning settings: ${learningSettings.length} rows`;
    });

    await step("Learning: only due nodes, exam plan, reset", page, async () => { try {
      await page!.getByRole("button", { name: "Study mode" }).click();
      await page!.getByLabel("Study order").selectOption("onlyDue");
      // The session is rebuilt on the next render; give React that frame.
      await page!.waitForFunction(() => document.querySelectorAll(".bloommd-study-cover").length === 1, undefined, { timeout: 5_000 }).catch(() => undefined);
      const covers = await page!.locator(".bloommd-study-cover").count();
      expect(covers === 1, `Only due should cover 1 node, covers ${covers}.`);
      expect((await nodeByTitle("Map").locator(".bloommd-study-cover").count()) === 1, "The due node is not part of the session.");
      expect((await page!.locator(".bloommd-flow-node.is-out-of-session").count()) === learningCards - 1, "Nodes outside the session are not dimmed.");
      const inFour = await page!.evaluate(() => {
        const date = new Date();
        date.setDate(date.getDate() + 4);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      });
      await page!.getByRole("button", { name: "Set exam date" }).click();
      await page!.getByLabel("Exam date").fill(inFour);
      const perDay = Math.ceil((learningCards - 1) / 5);
      const bar = page!.locator(".bloommd-study-bar");
      await bar.getByText(`4 d left · ${perDay}/day`).waitFor();
      await page!.screenshot({ path: path.join(artifacts, "learning-exam-plan.png") });
      await page!.waitForTimeout(500);
      expect((await learningFiles(page!))[0]?.data.examDate === inFour, "The exam date is not stored with the progress.");
      await leaveStudy();
      await page!.evaluate(() => { void (window as unknown as { app: ObsidianApp }).app.plugins.plugins.bloommd!.resetLearning(); });
      await page!.locator(".modal button", { hasText: "Reset progress" }).click();
      await page!.waitForTimeout(600);
      expect((await page!.locator(".bloommd-flow-node[data-learn-level]").count()) === 0, "Reset left levels on the map.");
      const after = (await learningFiles(page!))[0]?.data;
      expect(Boolean(after) && Object.keys(after!.entries).length === 0 && !after!.examDate, `Progress after reset: ${JSON.stringify(after)}`);
      return `only due covers 1 node, exam in 4 d → ${perDay}/day, reset clears ratings and exam date after confirmation`;
    } finally { await leaveStudy(); } });

    const flowPoint = async (clientX: number, clientY: number) => page!.evaluate(({ x, y }) => {
      const pane = document.querySelector<HTMLElement>(".react-flow__viewport")!;
      const matrix = new DOMMatrix(getComputedStyle(pane).transform);
      const rect = pane.parentElement!.getBoundingClientRect();
      return { x: (x - rect.left - matrix.e) / matrix.a, y: (y - rect.top - matrix.f) / matrix.a };
    }, { x: clientX, y: clientY });
    const mapInkFile = async () => (await page!.evaluate(async () => {
      const obsidian = (window as unknown as { app: ObsidianApp }).app;
      const file = obsidian.vault.getFiles().find((entry) => entry.path.endsWith("map ink.svg"));
      return file ? { path: file.path, content: await obsidian.vault.read(file) } : null;
    }));
    const emptySpot = async () => {
      const pane = (await page!.locator(".react-flow__pane").boundingBox())!;
      const spot = await page!.evaluate(({ x, y, width, height }) => {
        for (let fy = 0.2; fy < 0.9; fy += 0.05) for (let fx = 0.15; fx < 0.9; fx += 0.05) {
          const px = x + width * fx; const py = y + height * fy;
          const hit = document.elementFromPoint(px, py);
          const clear = [[0, 0], [90, 0], [90, 40], [0, 40]].every(([dx, dy]) => document.elementFromPoint(px + dx!, py + dy!)?.classList.contains("react-flow__pane"));
          if (hit?.classList.contains("react-flow__pane") && clear) return [px, py] as [number, number];
        }
        return null;
      }, pane);
      if (!spot) throw new Error("No free spot on the map.");
      return spot;
    };
    const penAt = async (points: Array<[number, number, number]>) => {
      const send = (type: "mousePressed" | "mouseMoved" | "mouseReleased", [x, y, force]: [number, number, number]) => cdp.send("Input.dispatchMouseEvent", {
        type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "pen", force,
      });
      await send("mousePressed", points[0]!);
      for (const point of points.slice(1)) await send("mouseMoved", point);
      await send("mouseReleased", points[points.length - 1]!);
    };

    await step("New nodes never cover nodes placed by hand", page, async () => {
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      await page!.waitForTimeout(300);
      const before = await page!.locator(".react-flow__node").count();
      await nodeByTitle("Obsidian Demo").locator(".bloommd-node-label").click({ button: "right" });
      await page!.locator(".menu").last().locator(".menu-item", { hasText: "Add child" }).click();
      await page!.waitForFunction((count) => document.querySelectorAll(".react-flow__node").length === count + 1, before, { timeout: 10_000 });
      // #192: a new node is named right away, whether inline on the card or in the inspector.
      await page!.waitForTimeout(200);
      const focused = await page!.evaluate(() => {
        const active = document.activeElement as HTMLInputElement | null;
        return active && /^(INPUT|TEXTAREA)$/.test(active.tagName) ? `${active.id || active.className}=${active.value}` : null;
      });
      expect(focused?.endsWith("=New node") === true, `The new node's title field is not focused (${focused ?? "no text field"}).`);
      await page!.keyboard.press("Escape");
      await page!.waitForTimeout(400);
      const boxes = await page!.locator(".react-flow__node .bloommd-flow-node").evaluateAll((cards) => cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { title: card.querySelector(".bloommd-node-label")?.textContent ?? "", x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }));
      const overlaps: string[] = [];
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => {
        if (a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1) overlaps.push(`${a.title} × ${b.title}`);
      }));
      expect(overlaps.length === 0, `Overlapping nodes: ${overlaps.join(", ")}`);
      return `${boxes.length} nodes after adding a child, none overlapping; title field ${focused} focused`;
    });

    await step("Map drawing: pen writes on the map, kept in map coordinates", page, async () => {
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      await page!.waitForTimeout(300);
      await page!.getByRole("button", { name: "Draw on map" }).click();
      await page!.getByRole("toolbar", { name: "Map drawing tools" }).waitFor();
      const [x, y] = await emptySpot();
      await penAt(Array.from({ length: 16 }, (_, index): [number, number, number] => [x + index * 6, y + Math.sin(index / 2.5) * 14, 0.3 + index / 30]));
      await page!.waitForTimeout(1_500);
      const file = await mapInkFile();
      expect(Boolean(file), "No map drawing file was created.");
      expect(storedInk(file!.content).strokes.length === 1, "The map drawing does not hold the stroke.");
      const markdown = (await vaultState(page!)).markdown;
      expect(/^bloommd-map-ink: "?\[\[[^\]]+map ink\.svg\]\]"?$/m.test(markdown), "The note frontmatter does not link the map drawing.");
      const drawnAt = await flowPoint(x, y);
      await page!.keyboard.press("Escape");
      expect((await page!.getByRole("toolbar", { name: "Map drawing tools" }).count()) === 0, "Escape did not leave draw mode.");
      await openDemoMap(page!);
      const path = page!.locator(".bloommd-map-ink path[data-stroke-id]").first();
      await path.waitFor();
      const bounds = (await path.boundingBox())!;
      const reloadedAt = await flowPoint(bounds.x, bounds.y + bounds.height / 2);
      expect(Math.abs(reloadedAt.x - drawnAt.x) < 8 && Math.abs(reloadedAt.y - drawnAt.y) < 20, `Stroke moved from ${JSON.stringify(drawnAt)} to ${JSON.stringify(reloadedAt)} in map coordinates.`);
      return `${file!.path} linked in frontmatter; stroke back at the same map position after reload`;
    });

    await step("Map drawing: a stroke from node to node connects them", page, async () => {
      await page!.getByRole("button", { name: "Draw on map" }).click();
      const from = (await nodeByTitle("Recording Check").locator(".bloommd-node-label").boundingBox())!;
      const to = (await nodeByTitle("Markdown").locator(".bloommd-node-label").boundingBox())!;
      const start: [number, number, number] = [from.x + from.width / 2, from.y + from.height / 2, 0.5];
      const end: [number, number, number] = [to.x + to.width / 2, to.y + to.height / 2, 0.5];
      await penAt(Array.from({ length: 12 }, (_, index): [number, number, number] => [start[0] + ((end[0] - start[0]) * index) / 11, start[1] + ((end[1] - start[1]) * index) / 11, 0.5]));
      await page!.locator(".bloommd-map-notice", { hasText: "Connected Recording Check → Markdown" }).waitFor();
      await page!.waitForTimeout(1_200);
      const markdown = (await vaultState(page!)).markdown;
      expect(/## Recording Check[^\n]*"relations":\[\{"target":"[0-9a-f]+"\}\]/.test(markdown), "The connection is not stored on Recording Check.");
      expect(storedInk((await mapInkFile())!.content).strokes.length === 1, "The connecting stroke was kept as ink.");
      // Clicking tools and Done must not leave ink behind.
      const bar = page!.getByRole("toolbar", { name: "Map drawing tools" });
      await bar.getByRole("button", { name: "Highlighter", exact: true }).click();
      await bar.getByRole("button", { name: "Pen", exact: true }).click();
      await bar.getByRole("button", { name: "Done" }).click();
      await page!.waitForTimeout(1_200);
      expect(storedInk((await mapInkFile())!.content).strokes.length === 1, "Clicking the drawing tools left ink on the map.");
      return "stroke turned into a connection Recording Check → Markdown, no ink kept, tool clicks leave no ink";
    });

    await step("Export the map as PNG and PDF", page, async () => {
      const exported = async (label: string, extension: string) => {
        await page!.getByRole("button", { name: "Export map" }).click();
        await page!.locator(".menu").last().locator(".menu-item", { hasText: label }).click();
        await page!.waitForFunction((ext) => (window as unknown as { app: ObsidianApp }).app.vault.getFiles().some((file) => file.path.endsWith(`map.${ext}`)), extension, { timeout: 20_000 });
        return page!.evaluate(async (ext) => {
          const obsidian = (window as unknown as { app: ObsidianApp & { vault: { readBinary(file: ObsidianFile): Promise<ArrayBuffer> } } }).app;
          const file = obsidian.vault.getFiles().find((entry) => entry.path.endsWith(`map.${ext}`))!;
          const bytes = new Uint8Array(await obsidian.vault.readBinary(file));
          const view = new DataView(bytes.buffer);
          return {
            path: file.path,
            size: bytes.length,
            head: Array.from(bytes.slice(0, 8)),
            // PNG IHDR width/height live at bytes 16..23.
            width: ext === "png" ? view.getUint32(16) : 0,
            height: ext === "png" ? view.getUint32(20) : 0,
            tail: new TextDecoder("latin1").decode(bytes.slice(-7)),
            // Edges are light grey lines; count their pixels to prove connections made it into the image.
            edgePixels: ext === "png" ? await (async () => {
              const image = document.createElement("img");
              image.src = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
              await image.decode();
              const canvas = document.createElement("canvas");
              canvas.width = image.width;
              canvas.height = image.height;
              const context = canvas.getContext("2d")!;
              context.drawImage(image, 0, 0);
              const pixels = context.getImageData(0, 0, image.width, image.height).data;
              const edge = getComputedStyle(document.querySelector(".react-flow__edges path")!).stroke.match(/\d+/g)!.map(Number);
              let count = 0;
              for (let index = 0; index < pixels.length; index += 4) {
                if (Math.abs(pixels[index]! - edge[0]!) < 4 && Math.abs(pixels[index + 1]! - edge[1]!) < 4 && Math.abs(pixels[index + 2]! - edge[2]!) < 4) count += 1;
              }
              return count;
            })() : 0,
            handles: 0,
          };
        }, extension);
      };
      const png = await exported("Export as PNG", "png");
      expect(png.head.join(",") === "137,80,78,71,13,10,26,10", `Not a PNG: ${png.head.join(",")}`);
      expect(png.width > 600 && png.height > 300 && png.size > 20_000, `PNG is ${png.width}×${png.height}, ${png.size} bytes.`);
      expect(png.edgePixels > 2_000, `Only ${png.edgePixels} edge-coloured pixels: connections are missing from the PNG.`);
      const pdf = await exported("Export as PDF", "pdf");
      expect(String.fromCharCode(...pdf.head.slice(0, 5)) === "%PDF-" && pdf.tail.includes("%%EOF"), "Not a PDF.");
      return `${png.path} ${png.width}×${png.height} (${Math.round(png.size / 1024)} KB, ${png.edgePixels} edge pixels), ${pdf.path} (${Math.round(pdf.size / 1024)} KB)`;
    });

    await step("Presentation renders drawings and Markdown", page, async () => {
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      await page!.waitForTimeout(400);
      await nodeByTitle("Obsidian Demo").locator(".bloommd-node-label").click();
      await page!.getByRole("button", { name: /Present/ }).click();
      const slide = page!.locator(".bloommd-presentation-markdown");
      await slide.locator("img").first().waitFor({ timeout: 10_000 });
      const text = await slide.innerText();
      expect(!text.includes("![["), "Presentation still shows embed syntax.");
      const src = (await slide.locator("img").first().getAttribute("src")) ?? "";
      expect(src.includes("ink.svg"), `Presentation image is ${src}.`);
      await page!.screenshot({ path: path.join(artifacts, "presentation-with-drawing.png") });
      await page!.getByRole("button", { name: /^Map( mode)?/ }).click();
      return "drawing rendered as image, no embed syntax";
    });

    await step("Open app hands the note and selected node to BloomMD Desktop", page, async () => {
      await rm(desktopHandoff, { force: true });
      const received: string[] = [];
      const server = createServer((socket) => socket.on("data", (chunk) => received.push(String(chunk))));
      await new Promise<void>((resolve) => server.listen(desktopHandoff, resolve));
      try {
        await nodeByTitle("Quellen").locator(".bloommd-node-label").click();
        await page!.keyboard.press("Escape").catch(() => undefined);
        await nodeByTitle("Quellen").locator(".bloommd-node-label").click();
        await page!.getByRole("button", { name: "Open app" }).click();
        for (let attempt = 0; attempt < 20 && received.length === 0; attempt += 1) await sleep(150);
        const message = JSON.parse(received.join("").trim()) as { type: string; target: string; nodeId?: string };
        const markdown = (await vaultState(page!)).markdown;
        const quellenId = /^## Quellen <!-- bloommd:id=([A-Za-z0-9_-]+) -->/m.exec(markdown)?.[1];
        expect(message.type === "open", `Unexpected handoff ${JSON.stringify(message)}.`);
        expect(message.target === path.join(vault, DEMO_NOTE), `Handed over ${message.target}.`);
        expect(Boolean(quellenId) && message.nodeId === quellenId, `Node ${message.nodeId} instead of Quellen (${quellenId}).`);
        await page!.locator(".notice", { hasText: "Opened in BloomMD Desktop" }).first().waitFor({ timeout: 3_000 });
        return `running app received ${path.basename(message.target)} at node Quellen (${quellenId})`;
      } finally {
        server.close();
      }
    });

    await step("Focus mode covers the window", page, async () => {
      const shell = page!.locator(".bloommd-react-shell");
      const before = (await shell.boundingBox())!;
      const windowSize = await page!.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
      await page!.getByRole("button", { name: "Focus mode" }).click();
      const focused = (await shell.boundingBox())!;
      expect(focused.x === 0 && focused.y === 0 && Math.abs(focused.width - windowSize.width) < 1 && Math.abs(focused.height - windowSize.height) < 1, `Focus mode covers ${JSON.stringify(focused)}.`);
      await page!.screenshot({ path: path.join(artifacts, "focus-mode.png") });
      await page!.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
      await page!.keyboard.press("Escape");
      const left = (await shell.boundingBox())!;
      expect(Math.abs(left.width - before.width) < 1 && Math.abs(left.x - before.x) < 1, "Escape did not leave focus mode.");
      await page!.evaluate(() => (window as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("bloommd:toggle-focus-mode"));
      expect((await page!.locator(".bloommd-react-shell.is-focus").count()) === 1, "The command did not enter focus mode.");
      await page!.evaluate(() => (window as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("bloommd:toggle-focus-mode"));
      expect((await page!.locator(".bloommd-react-shell.is-focus").count()) === 0, "The command did not leave focus mode.");
      return `${Math.round(before.width)}×${Math.round(before.height)} → ${windowSize.width}×${windowSize.height}, Escape and command toggle it`;
    });

    // Agent panel (#535): the agent's proposals, history, rights and requests in `.bloommd/`.
    type AgentQaApp = ObsidianApp & {
      vault: { adapter: { exists(path: string): Promise<boolean>; mkdir(path: string): Promise<void>; read(path: string): Promise<string>; write(path: string, text: string): Promise<void>; list(path: string): Promise<{ files: string[] }> } };
      commands: { executeCommandById(id: string): boolean };
      plugins: { plugins: Record<string, (QaPlugin & { agent: { documents: { read(path: string): Promise<{ markdown: string; version: string } | null> }; refresh(): Promise<void> } }) | undefined> };
    };
    const seedProposal = (title: string, stale = false) => page!.evaluate(async ({ note, title, stale }) => {
      const obsidian = (window as unknown as { app: AgentQaApp }).app;
      const current = (await obsidian.plugins.plugins.bloommd!.agent.documents.read(note))!;
      const id = `psmoke${Date.now().toString(36)}`;
      const proposal = {
        id, at: new Date().toISOString(), agent: "OpenClaw", tool: "bloommd_update_map", target: "vault", path: note, area: note.split("/")[0],
        baseVersion: stale ? "0000000000000000" : current.version,
        markdown: `${current.markdown.trimEnd()}\n\n## ${title} <!-- bloommd:id=${id} -->\n\nFrom the agent.\n`,
        summary: "1 node(s) created, 0 updated", reason: "Smoke test", source: "QA",
      };
      const adapter = obsidian.vault.adapter;
      for (const dir of [".bloommd", ".bloommd/proposals"]) if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.write(`.bloommd/proposals/${id}.json`, JSON.stringify(proposal, null, 2));
      return id;
    }, { note: DEMO_NOTE, title, stale });
    const agentState = (dir: string) => page!.evaluate(async (folder) => {
      const adapter = (window as unknown as { app: AgentQaApp }).app.vault.adapter;
      if (!(await adapter.exists(`.bloommd/${folder}`))) return [] as string[];
      return Promise.all((await adapter.list(`.bloommd/${folder}`)).files.map((file) => adapter.read(file)));
    }, dir);
    const agentLog = async () => (await page!.evaluate(() => (window as unknown as { app: AgentQaApp }).app.vault.adapter.read(".bloommd/agent-log.jsonl"))).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    const agentPanel = page.locator(".bloommd-agent");
    const agentTab = (name: string) => agentPanel.locator(`.bloommd-agent-tabs button[data-tab="${name}"]`).click();

    await step("Agent: a new proposal shows up with notice, badge and outline", page, async () => {
      await page!.evaluate(() => (window as unknown as { app: AgentQaApp }).app.commands.executeCommandById("bloommd:open-agent-panel"));
      await agentPanel.locator(".bloommd-agent-tabs").waitFor();
      const id = await seedProposal("Agent idea");
      // `.bloommd` is a dot folder: Obsidian reports it only as raw event (desktop) or by polling.
      await page!.locator(".notice", { hasText: "new agent proposal" }).first().waitFor({ timeout: 25_000 });
      const card = agentPanel.locator(`.bloommd-agent-card[data-proposal="${id}"]`);
      await card.waitFor();
      await card.locator('.bloommd-agent-diff li[data-mark="+"]', { hasText: "Agent idea" }).waitFor();
      const badge = await page!.locator(".bloommd-agent-ribbon.has-badge").getAttribute("data-count");
      expect(badge === "1", `Ribbon badge shows ${badge}.`);
      await page!.screenshot({ path: path.join(artifacts, "agent-proposal.png") });
      return `proposal ${id} listed by OpenClaw with "+ Agent idea", notice and badge 1`;
    });

    await step("Agent: approve applies the proposal and records it for undo", page, async () => {
      await agentPanel.locator(".bloommd-agent-card").first().getByRole("button", { name: "Approve" }).click();
      await page!.locator(".notice", { hasText: `Applied to ${DEMO_NOTE}` }).first().waitFor();
      expect((await vaultState(page!)).markdown.includes("## Agent idea"), "The note does not contain the approved node.");
      expect((await agentState("proposals")).length === 0, "The proposal file was not removed.");
      const history = (await agentState("history")).map((text) => JSON.parse(text) as { origin: string; tool: string });
      expect(history.some((entry) => entry.origin === "approved" && /approved by/.test(entry.tool)), "No approved history entry.");
      const last = (await agentLog()).at(-1)!;
      expect(last.event === "approved" && typeof last.reviewer === "string", `Last log line: ${JSON.stringify(last)}`);
      // Reopened, the map marks the node the agent's proposal added since it was last opened.
      await page!.evaluate(() => (window as unknown as { app: ObsidianApp }).app.workspace.getLeavesOfType("bloommd-mindmap-view").forEach((leaf) => leaf.detach()));
      await openDemoMap(page!);
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      const marked = page!.locator(".bloommd-flow-node.is-agent-changed");
      await marked.first().waitFor({ state: "attached", timeout: 10_000 }).catch(async () => {
        const seen = await page!.evaluate((note) => (window as unknown as { app: { loadLocalStorage(key: string): unknown } }).app.loadLocalStorage(`bloommd-agent-seen:${note}`), DEMO_NOTE);
        throw new Error(`No marked node; seen ${String(seen)}, approved at ${String(last.at)}.`);
      });
      const titles = await marked.locator(".bloommd-node-label").allInnerTexts();
      expect(titles.map((title) => title.trim()).includes("Agent idea"), `Marked nodes: ${titles.join(", ")}`);
      await page!.screenshot({ path: path.join(artifacts, "agent-marker.png") });
      return `note changed, history origin "approved", log: approved by ${String(last.reviewer)}; map marks ${titles.length} node(s)`;
    });

    await step("Agent: undo from the history restores the note", page, async () => {
      await agentTab("history");
      const card = agentPanel.locator(".bloommd-agent-card", { has: page!.getByRole("button", { name: "Undo" }) }).first();
      await card.getByRole("button", { name: "Undo" }).click();
      await page!.locator(".modal button", { hasText: /^Undo$/ }).click();
      await page!.locator(".notice", { hasText: "Change undone" }).first().waitFor();
      expect(!(await vaultState(page!)).markdown.includes("## Agent idea"), "Undo left the approved node in the note.");
      await page!.screenshot({ path: path.join(artifacts, "agent-history.png") });
      return "confirmed, note restored, history entry removed";
    });

    await step("Agent: a changed note is shown as conflict; reject with a reason", page, async () => {
      const id = await seedProposal("Stale idea", true);
      await page!.evaluate(() => (window as unknown as { app: AgentQaApp }).app.plugins.plugins.bloommd!.agent.refresh());
      await agentTab("proposals");
      const card = agentPanel.locator(`.bloommd-agent-card[data-proposal="${id}"]`);
      await card.getByRole("button", { name: "Approve" }).click();
      await card.locator(".bloommd-agent-conflict").waitFor();
      await agentPanel.locator(`.bloommd-agent-card[data-proposal="${id}"]`).getByRole("button", { name: "Apply anyway" }).waitFor();
      expect(!(await vaultState(page!)).markdown.includes("Stale idea"), "A conflicting proposal was applied.");
      await page!.screenshot({ path: path.join(artifacts, "agent-conflict.png") });
      await agentPanel.locator(`.bloommd-agent-card[data-proposal="${id}"]`).getByRole("button", { name: "Reject" }).click();
      await page!.locator(".bloommd-agent-modal textarea").fill("Not needed");
      await page!.locator(".bloommd-agent-modal button", { hasText: "Reject" }).click();
      await page!.locator(".notice", { hasText: "Proposal rejected" }).first().waitFor();
      expect((await agentState("proposals")).length === 0, "The rejected proposal is still there.");
      const last = (await agentLog()).at(-1)!;
      expect(last.event === "rejected" && last.reason === "Not needed", `Last log line: ${JSON.stringify(last)}`);
      return "conflict box with Apply anyway, nothing written; rejected with reason";
    });

    await step("Agent: rights edits persist in agent.json", page, async () => {
      await agentTab("rights");
      // The row whose own name matches; its single dropdown.
      const setting = (name: string) => agentPanel.locator(".setting-item-name", { hasText: new RegExp(`^${name}$`) }).locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' setting-item ')][1]").locator("select").first();
      await setting("Default").selectOption("write");
      await page!.locator(".notice", { hasText: "Agent rights saved" }).first().waitFor();
      await setting("Aufnahmen").selectOption("propose");
      await page!.waitForTimeout(300);
      const rights = JSON.parse(await page!.evaluate(() => (window as unknown as { app: AgentQaApp }).app.vault.adapter.read(".bloommd/agent.json"))) as { access: string; areas: Record<string, string> };
      expect(rights.access === "write" && rights.areas.Aufnahmen === "propose", `agent.json: ${JSON.stringify(rights)}`);
      await page!.screenshot({ path: path.join(artifacts, "agent-rights.png") });
      return `agent.json ${JSON.stringify(rights)}`;
    });

    await step("Agent: Ask agent… on a node leaves a request; the answer shows in the panel", page, async () => {
      await openDemoMap(page!);
      await nodeByTitle("Projekt").locator(".bloommd-node-label").click({ button: "right" });
      await page!.locator(".menu").last().locator(".menu-item", { hasText: "Ask agent…" }).click();
      await page!.locator(".bloommd-agent-modal textarea").fill("Expand this node with next steps");
      await page!.locator(".bloommd-agent-modal button", { hasText: "Send to agent" }).click();
      await page!.locator(".notice", { hasText: "Request saved" }).first().waitFor();
      const [stored] = (await agentState("requests")).map((text) => JSON.parse(text) as { id: string; nodeId?: string; nodeTitle?: string; status: string; path: string });
      expect(Boolean(stored?.nodeId) && stored?.nodeTitle === "Projekt" && stored.status === "open" && stored.path === DEMO_NOTE, `Request: ${JSON.stringify(stored)}`);
      // The agent answers through bloommd_answer_request; here the file is updated the same way.
      await page!.evaluate(async (request) => {
        const obsidian = (window as unknown as { app: AgentQaApp }).app;
        await obsidian.vault.adapter.write(`.bloommd/requests/${request.id}.json`, JSON.stringify({ ...request, status: "answered", answer: "Next: pilot with two classes.", agent: "OpenClaw", answeredAt: new Date().toISOString() }));
        await obsidian.plugins.plugins.bloommd!.agent.refresh();
      }, stored!);
      await page!.evaluate(() => (window as unknown as { app: AgentQaApp }).app.commands.executeCommandById("bloommd:open-agent-panel"));
      await agentTab("requests");
      await agentPanel.locator(".bloommd-agent-answer", { hasText: "pilot with two classes" }).waitFor();
      await page!.screenshot({ path: path.join(artifacts, "agent-requests.png") });
      return `request ${stored!.id} on node Projekt, answer shown`;
    });

    await step("Mobile: plugin loads in Obsidian mobile mode", page, async () => {
      await page!.evaluate(() => (window as unknown as { app: ObsidianApp }).app.emulateMobile?.(true));
      await page!.waitForLoadState("domcontentloaded");
      await page!.waitForFunction(() => document.body.classList.contains("is-mobile") && Boolean((window as unknown as { app?: Partial<ObsidianApp> }).app?.workspace?.layoutReady), undefined, { timeout: 30_000 });
      // iPad Air landscape with touch input.
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1180, height: 820, deviceScaleFactor: 2, mobile: false });
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await page!.waitForTimeout(1_000);
      const loaded = await page!.evaluate(() => Boolean((window as unknown as { app: ObsidianApp }).app.plugins.plugins.bloommd));
      expect(loaded, "Obsidian did not load BloomMD in mobile mode (isDesktopOnly?).");
      await openDemoMap(page!);
      return "is-mobile, BloomMD loaded, map rendered at 1180×820";
    });

    await step("Mobile: touch targets and layout", page, async () => {
      const report = await page!.evaluate(() => {
        const shell = document.querySelector(".bloommd-react-shell");
        if (!shell) throw new Error("BloomMD view missing.");
        const small = [...shell.querySelectorAll<HTMLElement>(".bloommd-app-toolbar button, .bloommd-app-toolbar select, .bloommd-open-inspector, .react-flow__controls-button")]
          .filter((element) => element.offsetParent !== null)
          .map((element) => ({ label: element.getAttribute("aria-label") ?? element.title ?? element.textContent ?? element.className, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.height < 43.5)
          .map(({ label, rect }) => `${label} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        // Obsidian's tablet theme once squeezed icons to a dot; every visible icon must stay legible.
        // Icons inside the zoomable map scale with the map zoom and are excluded.
        const squeezed = [...shell.querySelectorAll<SVGElement>("svg.lucide")]
          .filter((icon) => !icon.closest(".react-flow__viewport"))
          .map((icon) => ({ name: icon.getAttribute("class") ?? "", rect: icon.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && rect.width < 12)
          .map(({ name, rect }) => `${name.replace("lucide ", "")} ${rect.width.toFixed(1)}px`);
        // Every toolbar control must be inside the visible pane, not clipped or scrolled away.
        const shellRect = shell.getBoundingClientRect();
        const clipped = [...shell.querySelectorAll<HTMLElement>(".bloommd-app-toolbar button, .bloommd-app-toolbar select")]
          .filter((element) => element.offsetParent !== null)
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < shellRect.left - 0.5 || rect.right > shellRect.right + 0.5;
          })
          .map((element) => element.getAttribute("aria-label") ?? element.title);
        return { small, overflow: shell.scrollWidth - shell.clientWidth, squeezed, clipped };
      });
      expect(report.squeezed.length === 0, `Icons narrower than 12 px: ${report.squeezed.join(", ")}`);
      expect(report.clipped.length === 0, `Toolbar controls outside the pane: ${report.clipped.join(", ")}`);
      expect(report.overflow <= 0, `BloomMD view overflows horizontally by ${report.overflow}px.`);
      expect(report.small.length === 0, `Tap targets below 44 px: ${report.small.join(", ")}`);
      expect((await page!.getByRole("button", { name: "Open app" }).count()) === 0, "Open app is offered on mobile, where no BloomMD app can open the note.");
      return "all map toolbar targets ≥ 44 px, no horizontal overflow, no Open app on mobile";
    });

    await step("Mobile: study bar and rating buttons are touch-sized", page, async () => { try {
      await page!.getByRole("button", { name: "Study mode" }).click();
      await showNode("Quellen");
      await tapOn(cdp, nodeByTitle("Quellen").locator(".bloommd-study-cover"), "touch");
      const rate = nodeByTitle("Quellen").getByRole("button", { name: "Got it" });
      await rate.waitFor();
      // Sizes in CSS pixels: the map zoom scales them on screen like everything else on the map.
      const heights = await nodeByTitle("Quellen").locator(".bloommd-rate button").evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).offsetHeight));
      const bar = await page!.locator(".bloommd-study-bar button, .bloommd-study-bar select, .bloommd-study-bar input").evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height));
      expect(heights.length === 3 && heights.every((height) => height >= 44), `Rating buttons: ${heights.join(", ")} px.`);
      expect(bar.every((height) => height >= 43.5), `Study bar controls: ${bar.map(Math.round).join(", ")} px.`);
      await tapOn(cdp, rate, "touch");
      await page!.waitForTimeout(400);
      expect((await learnLevel("Quellen")) === "2", "A finger tap on the rating did not rate the node.");
      await page!.screenshot({ path: path.join(artifacts, "learning-mobile.png") });
      return `rating buttons ${heights.join("/")} px, study bar controls ≥ 44 px, finger rating saved`;
    } finally { await leaveStudy(); } });

    await step("Mobile: finger pans the map without opening sidebars", page, async () => {
      const pane = (await page!.locator(".react-flow__pane").boundingBox())!;
      const viewport = page!.locator(".react-flow__viewport");
      const before = await viewport.getAttribute("style");
      const sidebarsBefore = await sidebarState(page!);
      // Start on empty canvas: a finger on a node drags the node instead of panning.
      const empty = await page!.evaluate(({ x, y, width, height }) => {
        // Search from the top left, away from the zoom controls and minimap in the bottom corners.
        for (let fy = 0.1; fy < 0.9; fy += 0.05) {
          for (let fx = 0.1; fx < 0.9; fx += 0.05) {
            const px = x + width * fx;
            const py = y + height * fy;
            if (document.elementFromPoint(px, py)?.classList.contains("react-flow__pane")) return [px, py] as [number, number];
          }
        }
        return null;
      }, pane);
      if (!empty) throw new Error("No empty spot on the map to pan from.");
      const start: [number, number] = empty;
      await touchDrag(cdp, start, [start[0] + 120, start[1] + 40]);
      await page!.waitForTimeout(300);
      expect((await viewport.getAttribute("style")) !== before, `Finger drag from ${start.map(Math.round).join(",")} did not pan the map.`);
      expect(await sidebarState(page!) === sidebarsBefore, "Finger pan on the map opened an Obsidian sidebar.");
      return `map panned, sidebars unchanged (${sidebarsBefore})`;
    });

    await step("Mobile: drag a node by touch, position survives reload", page, async () => {
      const label = nodeByTitle("Struktur").locator(".bloommd-node-label");
      const before = (await nodeByTitle("Struktur").boundingBox())!;
      const grip = (await label.boundingBox())!;
      const from: [number, number] = [grip.x + grip.width / 2, grip.y + grip.height / 2];
      await touchDrag(cdp, from, [from[0] + 20, from[1] + 140]);
      await page!.waitForTimeout(400);
      const moved = (await nodeByTitle("Struktur").boundingBox())!;
      expect(moved.y - before.y > 80, `Touch drag moved the node ${Math.round(moved.y - before.y)} px.`);
      await openDemoMap(page!);
      const reloaded = (await nodeByTitle("Struktur").boundingBox())!;
      expect(Math.abs(reloaded.y - moved.y) < 2 && Math.abs(reloaded.x - moved.x) < 2, "Touch-dragged position was not kept after reload.");
      expect((await page!.locator(".react-flow__edge").count()) >= 8, "Edges disappeared after moving the node.");
      return `moved ${Math.round(moved.y - before.y)} px by finger, kept after reload`;
    });

    await step("Mobile: in draw mode fingers pan and the pen writes", page, async () => {
      await tap(cdp, page!, 'button[aria-label="Draw on map"]');
      await page!.getByRole("toolbar", { name: "Map drawing tools" }).waitFor();
      const before = storedInk((await mapInkFile())!.content).strokes.length;
      const viewport = page!.locator(".react-flow__viewport");
      const transform = await viewport.getAttribute("style");
      // Start on empty canvas: a finger on a node would drag that node instead of the map.
      const origin = await emptySpot();
      await touchDrag(cdp, origin, [origin[0] + 100, origin[1] - 40]);
      await page!.waitForTimeout(300);
      expect((await viewport.getAttribute("style")) !== transform, "A finger did not pan the map in draw mode.");
      const [x, y] = await emptySpot();
      await penAt(Array.from({ length: 10 }, (_, index): [number, number, number] => [x + index * 8, y + (index % 2) * 10, 0.5]));
      await page!.waitForTimeout(1_500);
      const after = storedInk((await mapInkFile())!.content).strokes.length;
      expect(after === before + 1, `Strokes ${before} → ${after}: the finger drew or the pen did not.`);
      await tap(cdp, page!, ".bloommd-map-ink-bar button.bloommd-ink-done");
      return `finger panned, pen added a stroke (${before} → ${after})`;
    });

    await step("Mobile: drawing tools move smoothly, dock at the edge and fold", page, async () => {
      await tap(cdp, page!, 'button[aria-label="Draw on map"]');
      const bar = page!.getByRole("toolbar", { name: "Map drawing tools" });
      try {
        await bar.waitFor();
        const map = (await page!.locator(".react-flow").first().boundingBox())!;
        const start = (await bar.boundingBox())!;
        // However narrow the map, Done stays fully visible; only the tools in between scroll.
        const done = (await bar.locator("button.bloommd-ink-done").boundingBox())!;
        expect(done.x >= start.x && done.x + done.width <= start.x + start.width + 1 && done.x + done.width <= map.x + map.width, "Done is cut off.");
        const grip = (await page!.getByRole("button", { name: "Move drawing tools" }).boundingBox())!;
        const gripAt: [number, number] = [grip.x + grip.width / 2, grip.y + grip.height / 2];
        // A finger on the grip carries the tools; the map underneath must not pan.
        const viewport = await page!.locator(".react-flow__viewport").getAttribute("style");
        await touchDrag(cdp, gripAt, [gripAt[0] + 60, gripAt[1] + 180]);
        await page!.waitForTimeout(400);
        const moved = (await bar.boundingBox())!;
        // The tools stay inside the map: a bar as wide as the map can only move up and down.
        const expectedX = Math.min(start.x + 60, map.x + map.width - start.width - 12);
        expect(Math.abs(moved.y - start.y - 180) < 4 && Math.abs(moved.x - expectedX) < 4, `The tools did not follow the finger: ${Math.round(moved.x - start.x)},${Math.round(moved.y - start.y)}.`);
        expect((await page!.locator(".react-flow__viewport").getAttribute("style")) === viewport, "Dragging the tools panned the map.");
        expect((await bar.getAttribute("aria-orientation")) === "horizontal", "The tools docked although they were dropped in the middle.");
        expect((await page!.locator(".modal-container, .suggestion-container").count()) === 0, "Dragging the tools down opened Obsidian's command palette or clicked something underneath.");
        // Dropped near the left edge they stand upright along it.
        const grip2 = (await page!.getByRole("button", { name: "Move drawing tools" }).boundingBox())!;
        await touchDrag(cdp, [grip2.x + grip2.width / 2, grip2.y + grip2.height / 2], [map.x + 10, map.y + map.height / 2]);
        await page!.waitForTimeout(500);
        const docked = (await bar.boundingBox())!;
        expect((await bar.getAttribute("aria-orientation")) === "vertical", "The tools did not dock at the left edge.");
        expect(docked.x - map.x < 20 && docked.height > docked.width, `Docked tools are at ${Math.round(docked.x - map.x)} px, ${Math.round(docked.width)}×${Math.round(docked.height)}.`);
        await page!.screenshot({ path: path.join(artifacts, "tools-docked-left.png") });
        // Folded, only the grip, the current tool and colour, undo and Done remain.
        await tap(cdp, page!, 'button[aria-label="Fold drawing tools"]');
        await page!.waitForTimeout(300);
        const folded = (await bar.boundingBox())!;
        expect(folded.height < docked.height * 0.7, `Folding kept the tools ${Math.round(folded.height)} px tall (was ${Math.round(docked.height)}).`);
        expect((await bar.locator('button[aria-label="Eraser"], button[aria-label="Highlighter"]').count()) === 0, "Folded tools still show every tool.");
        expect((await bar.locator("button.bloommd-ink-done").count()) === 1, "Done is gone when the tools are folded.");
        await page!.screenshot({ path: path.join(artifacts, "tools-folded.png") });
        // The next time drawing starts, the tools are where they were left.
        await tap(cdp, page!, ".bloommd-map-ink-bar button.bloommd-ink-done");
        await tap(cdp, page!, 'button[aria-label="Draw on map"]');
        await bar.waitFor();
        await page!.waitForTimeout(300);
        expect((await bar.getAttribute("aria-orientation")) === "vertical" && (await bar.getAttribute("class"))!.includes("is-collapsed"), "The tools forgot where they were.");
        return `followed the finger (60,180 px) without panning the map; docked upright at the left edge (${Math.round(docked.width)}×${Math.round(docked.height)}); folded to ${Math.round(folded.height)} px; place remembered`;
      } finally {
        // Later steps expect the tools at their default place and draw mode off.
        await page!.evaluate(() => window.localStorage.removeItem("bloommd:map-ink-bar:v1"));
        if (await bar.count()) await tap(cdp, page!, ".bloommd-map-ink-bar button.bloommd-ink-done");
      }
    });

    await step("Mobile: long press opens the node menu", page, async () => {
      expect((await page!.locator(".bloommd-node-actions:visible").count()) === 0, "The floating action bar is shown on touch.");
      const label = (await nodeByTitle("Quellen").locator(".bloommd-node-label").boundingBox())!;
      const point = { x: label.x + label.width / 2, y: label.y + label.height / 2, id: 1 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await page!.waitForTimeout(750);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const menu = page!.locator(".menu").last();
      await menu.waitFor({ timeout: 5_000 });
      const items = (await menu.locator(".menu-item-title").allInnerTexts()).map((item) => item.trim());
      expect(items.includes("Add child") && items.includes("Edit content"), `Menu items: ${items.join(", ")}`);
      await page!.keyboard.press("Escape");
      return `long press → ${items.length} actions, no floating bar`;
    });

    await step("Mobile: focus mode fills the iPad screen", page, async () => {
      await tap(cdp, page!, 'button[aria-label="Focus mode"]');
      const box = (await page!.locator(".bloommd-react-shell.is-focus").boundingBox())!;
      expect(Math.round(box.width) === 1180 && Math.round(box.height) === 820, `Focus mode covers ${Math.round(box.width)}×${Math.round(box.height)}.`);
      // In the wide focus layout labels are visible: no button may squeeze its icon and label together.
      const overflowing = await page!.locator(".bloommd-app-toolbar button").evaluateAll((buttons) => buttons
        .filter((button) => button.offsetParent !== null && button.scrollWidth > button.clientWidth + 1)
        .map((button) => `${button.getAttribute("aria-label") ?? button.title} ${button.clientWidth}/${button.scrollWidth}`));
      expect(overflowing.length === 0, `Toolbar buttons overflow: ${overflowing.join(", ")}`);
      await page!.screenshot({ path: path.join(artifacts, "mobile-focus-mode.png") });
      await tap(cdp, page!, 'button[aria-label="Leave focus mode"]');
      return "covers 1180×820, toggles by tap";
    });

    await step("Mobile: handwriting with pen, finger pans", page, async () => {
      await tap(cdp, page!, ".react-flow__node .bloommd-level-1 .bloommd-node-label");
      const openInspector = page!.locator(".bloommd-open-inspector");
      if (await openInspector.count()) await tap(cdp, page!, ".bloommd-open-inspector");
      const tabHeights = await page!.locator(".bloommd-content-tabs > button").evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().height));
      expect(tabHeights.every((height) => height >= 43.5), `Inspector tabs are ${tabHeights.join("/")} px high.`);
      await page!.locator(".bloommd-ink-thumb .bloommd-ink-thumb-edit").first().scrollIntoViewIfNeeded();
      await tap(cdp, page!, ".bloommd-ink-thumb .bloommd-ink-thumb-edit");
      await strokes.first().waitFor();
      const before = await strokes.count();
      await penStroke(cdp, page!, wave(40, 60, 120, 20));
      expect((await strokes.count()) === before + 1, "Pen did not draw in mobile mode.");
      const surface = (await page!.locator(".bloommd-ink-surface").boundingBox())!;
      const center: [number, number] = [surface.x + surface.width / 2, surface.y + surface.height / 2];
      const sidebarsBefore = await sidebarState(page!);
      await touchDrag(cdp, center, [center[0] - 60, center[1] + 30]);
      expect((await strokes.count()) === before + 1, "Finger drew in mobile mode.");
      expect(await sidebarState(page!) === sidebarsBefore, "Finger pan on the drawing opened an Obsidian sidebar.");
      const small = await toolbar.locator("button").evaluateAll((buttons) => buttons
        .filter((button) => !button.classList.contains("bloommd-ink-swatch"))
        .map((button) => button.getBoundingClientRect().height)
        .filter((height) => height < 43.5));
      expect(small.length === 0, `Handwriting tools below 44 px: ${small.join(", ")}`);
      await tap(cdp, page!, ".bloommd-ink-editor button.bloommd-ink-done");
      return `pen added a stroke (${before} → ${before + 1}), finger panned, tools ≥ 44 px`;
    });

    /** Apple Pencil as iPadOS reports it: pen pointer events plus touch events with touchType "stylus". */
    const stylusTouch = (type: "touchstart" | "touchmove" | "touchend", x: number, y: number) => page!.evaluate(({ type, x, y }) => {
      const qa = window as unknown as { qaPencilTarget?: Element };
      if (type === "touchstart") qa.qaPencilTarget = document.elementFromPoint(x, y) ?? document.body;
      const target = qa.qaPencilTarget ?? document.body;
      const touch = new Touch({ identifier: 99, target, clientX: x, clientY: y, pageX: x, pageY: y, touchType: "stylus" } as TouchInit);
      const list = type === "touchend" ? [] : [touch];
      target.dispatchEvent(new TouchEvent(type, { touches: list, targetTouches: list, changedTouches: [touch], bubbles: true, cancelable: true, composed: true }));
    }, { type, x, y });
    const pen = (type: "mousePressed" | "mouseMoved" | "mouseReleased", [x, y, force]: [number, number, number]) => cdp.send("Input.dispatchMouseEvent", {
      type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "pen", force,
    });
    const pencil = async (points: Array<[number, number, number]>, options: { holdMs?: number; during?: (index: number) => Promise<void> } = {}) => {
      await pen("mousePressed", points[0]!);
      await stylusTouch("touchstart", points[0]![0], points[0]![1]);
      if (options.holdMs) await page!.waitForTimeout(options.holdMs);
      for (const [index, point] of points.slice(1).entries()) {
        await pen("mouseMoved", point);
        await stylusTouch("touchmove", point[0], point[1]);
        await options.during?.(index);
      }
      const last = points[points.length - 1]!;
      await pen("mouseReleased", last);
      await stylusTouch("touchend", last[0], last[1]);
    };
    const line = (from: [number, number], to: [number, number], steps = 12): Array<[number, number, number]> =>
      Array.from({ length: steps + 1 }, (_, index) => [from[0] + ((to[0] - from[0]) * index) / steps, from[1] + ((to[1] - from[1]) * index) / steps, 0.5]);
    const palmTouch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) => cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 5, radiusX: 30, radiusY: 30 }],
    });
    const mapViewport = () => page!.locator(".react-flow__viewport").getAttribute("style");
    const mapInkCount = async () => storedInk((await mapInkFile())?.content ?? "<metadata id=\"bloommd-ink\">{\"strokes\":[],\"links\":[]}</metadata>").strokes.length;
    const enterDrawMode = async (focus = "Quellen") => {
      if (await page!.getByRole("toolbar", { name: "Map drawing tools" }).count()) await tap(cdp, page!, ".bloommd-map-ink-bar button.bloommd-ink-done");
      // Writing happens in focus mode on the iPad: the whole screen is paper.
      if (!(await page!.locator(".bloommd-react-shell.is-focus").count())) await tap(cdp, page!, 'button[aria-label="Focus mode"]');
      await page!.waitForTimeout(300);
      // Earlier steps pan the map; every gesture test starts with its node centred at reading size.
      await page!.getByRole("button", { name: "Fit view" }).first().click();
      await page!.waitForTimeout(300);
      const label = (await nodeByTitle(focus).locator(".bloommd-node-label").boundingBox())!;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: label.x + label.width / 2, y: label.y + label.height / 2, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page!.getByRole("button", { name: "Focus selected node" }).click();
      await page!.waitForTimeout(500);
      await tap(cdp, page!, 'button[aria-label="Draw on map"]');
      await page!.getByRole("toolbar", { name: "Map drawing tools" }).waitFor();
      await tap(cdp, page!, '.bloommd-map-ink-bar button[aria-label="Pen"]');
    };
    const labelCenter = async (title: string): Promise<[number, number]> => {
      const box = (await nodeByTitle(title).locator(".bloommd-node-label").boundingBox())!;
      return [box.x + box.width / 2, box.y + box.height / 2];
    };
    /** A point `distance` px away from `from` in a direction where the map is empty. */
    const freeEnd = async (from: [number, number], distance: number) => {
      const end = await page!.evaluate(({ from, distance }) => {
        const pane = document.querySelector(".react-flow__pane")!.getBoundingClientRect();
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const) {
          const x = from[0] + dx * distance;
          const y = from[1] + dy * distance;
          if (x < pane.left + 40 || x > pane.right - 160 || y < pane.top + 80 || y > pane.bottom - 160) continue;
          const clear = [[0, 0], [-70, -30], [70, -30], [-70, 30], [70, 30]].every(([ox, oy]) => document.elementFromPoint(x + ox!, y + oy!)?.classList.contains("react-flow__pane"));
          if (clear) return [x, y] as [number, number];
        }
        return null;
      }, { from, distance });
      if (!end) throw new Error("No free direction next to the node.");
      return end;
    };

    await step("Mobile: resting hand does not move a drawing while the pen writes", page, async () => {
      await tap(cdp, page!, ".react-flow__node .bloommd-level-1 .bloommd-node-label");
      const openInspector = page!.locator(".bloommd-open-inspector");
      if (await openInspector.count()) await tap(cdp, page!, ".bloommd-open-inspector");
      await page!.locator(".bloommd-ink-thumb .bloommd-ink-thumb-edit").first().scrollIntoViewIfNeeded();
      await tap(cdp, page!, ".bloommd-ink-thumb .bloommd-ink-thumb-edit");
      await strokes.first().waitFor();
      const view = page!.locator(".bloommd-ink-surface svg > g").first();
      // The first ResizeObserver pass fits the opened drawing after its strokes appear.
      await page!.waitForFunction(() => document.querySelector(".bloommd-ink-surface svg > g")?.getAttribute("transform") !== "translate(0 0) scale(1)");
      const before = await view.getAttribute("transform");
      const count = await strokes.count();
      const surface = (await page!.locator(".bloommd-ink-surface").boundingBox())!;
      const palm: [number, number] = [surface.x + surface.width * 0.6, surface.y + surface.height * 0.7];
      // The hand lands a moment before the tip and drags a little: that must not move the paper.
      await palmTouch("touchStart", palm[0], palm[1]);
      await palmTouch("touchMove", palm[0] + 40, palm[1] + 20);
      const panned = await view.getAttribute("transform");
      const points = wave(surface.width * 0.2, surface.height * 0.3, 140, 18).map(([x, y, force]): [number, number, number] => [surface.x + x, surface.y + y, force]);
      await pen("mousePressed", points[0]!);
      for (const [index, point] of points.slice(1).entries()) {
        await pen("mouseMoved", point);
        if (index % 4 === 0) await palmTouch("touchMove", palm[0] + 40 + index * 3, palm[1] + 20 + index);
      }
      await pen("mouseReleased", points[points.length - 1]!);
      await palmTouch("touchMove", palm[0] + 120, palm[1] + 60);
      await palmTouch("touchEnd", palm[0] + 120, palm[1] + 60);
      const after = await view.getAttribute("transform");
      expect(panned !== before, "The simulated palm did not pan before the pen (test setup).");
      expect(after === before, `The drawing moved while writing: ${before} → ${after}.`);
      expect((await strokes.count()) === count + 1, `Strokes ${count} → ${await strokes.count()}.`);
      await page!.waitForTimeout(PEN_COOLDOWN + 100);
      const center: [number, number] = [surface.x + surface.width / 2, surface.y + surface.height / 2];
      await touchDrag(cdp, center, [center[0] - 60, center[1] + 30]);
      expect((await view.getAttribute("transform")) !== after, "A finger no longer pans after writing.");
      await tap(cdp, page!, ".bloommd-ink-editor button.bloommd-ink-done");
      const close = page!.getByRole("button", { name: "Close inspector" });
      if (await close.count()) await tap(cdp, page!, 'button[aria-label="Close inspector"]');
      return "palm pan undone when the pen landed, palm ignored while writing, fingers pan again afterwards";
    });

    await step("Mobile: Apple Pencil on the map moves neither the map nor nodes", page, async () => {
      await enterDrawMode();
      const before = await mapViewport();
      const inkBefore = await mapInkCount();
      const [spotX, spotY] = await emptySpot();
      const [x, y] = [spotX + 45, spotY + 20];
      await pencil(Array.from({ length: 14 }, (_, index): [number, number, number] => [x - 45 + index * 7, y + Math.sin(index / 2) * 12, 0.5]));
      expect((await mapViewport()) === before, "The map moved while the pencil wrote on empty map.");
      const node = (await nodeByTitle("Quellen").boundingBox())!;
      const [cx, cy] = await labelCenter("Quellen");
      await pencil(Array.from({ length: 14 }, (_, index): [number, number, number] => [cx - 30 + index * 4, cy + Math.sin(index) * 6, 0.5]));
      const nodeAfter = (await nodeByTitle("Quellen").boundingBox())!;
      expect(Math.abs(nodeAfter.x - node.x) < 1 && Math.abs(nodeAfter.y - node.y) < 1, `The node moved under the pencil by ${Math.round(nodeAfter.x - node.x)},${Math.round(nodeAfter.y - node.y)}.`);
      expect((await mapViewport()) === before, "The map moved while the pencil wrote on a node.");
      await page!.waitForTimeout(1_500);
      expect((await mapInkCount()) === inkBefore + 2, `Map ink ${inkBefore} → ${await mapInkCount()}.`);
      return "two pencil strokes (empty map and over a node): map and node stayed put, both kept as ink";
    });

    await step("Mobile: resting hand before the pen does not move the map", page, async () => {
      await enterDrawMode();
      const before = await mapViewport();
      const [spotX, spotY] = await emptySpot();
      const [x, y] = [spotX + 45, spotY + 20];
      const palm = await freeEnd([x, y], 100);
      await palmTouch("touchStart", palm[0], palm[1]);
      await palmTouch("touchMove", palm[0] + 20, palm[1] + 10);
      await palmTouch("touchMove", palm[0] + 40, palm[1] + 20);
      const panned = await mapViewport();
      await pencil(Array.from({ length: 12 }, (_, index): [number, number, number] => [x + index * 7, y + (index % 3) * 4, 0.5]), {
        during: async (index) => { if (index % 3 === 0) await palmTouch("touchMove", palm[0] + 40 + index * 4, palm[1] + 20 + index * 2); },
      });
      await palmTouch("touchMove", palm[0] + 140, palm[1] + 70);
      await palmTouch("touchEnd", palm[0] + 140, palm[1] + 70);
      await page!.waitForTimeout(200);
      const after = await mapViewport();
      expect(panned !== before, "The simulated palm did not pan before the pen (test setup).");
      expect(after === before, `The map moved while writing: ${before} → ${after}.`);
      await page!.waitForTimeout(PEN_COOLDOWN + 100);
      const origin = await emptySpot();
      await touchDrag(cdp, origin, [origin[0] + 80, origin[1] + 30]);
      expect((await mapViewport()) !== after, "A finger no longer pans the map after writing.");
      return "palm pan undone when the pen landed, palm ignored during and after the stroke, fingers pan again";
    });

    await step("Pen gestures: tap selects a node, double tap opens it, no ink", page, async () => {
      await enterDrawMode();
      const inkBefore = await mapInkCount();
      const [cx, cy] = await labelCenter("Quellen");
      await pencil([[cx, cy, 0.5], [cx + 1, cy, 0.5]]);
      await nodeByTitle("Quellen").locator(".bloommd-flow-node.is-selected").waitFor({ timeout: 3_000 });
      expect((await page!.locator(".bloommd-inspector").count()) === 0, "A single tap opened the inspector.");
      await pencil([[cx, cy, 0.5], [cx + 1, cy, 0.5]]);
      await pencil([[cx, cy, 0.5], [cx + 1, cy, 0.5]]);
      await page!.locator(".bloommd-inspector h3", { hasText: "Quellen" }).waitFor({ timeout: 3_000 });
      await page!.waitForTimeout(1_200);
      expect((await mapInkCount()) === inkBefore, "Tapping nodes left ink on the map.");
      await closeInspector();
      return "tap → selected, double tap → inspector, no ink dots";
    });

    await step("Pen gestures: hold opens the menu, hold and drag moves the node", page, async () => {
      await enterDrawMode();
      const [cx, cy] = await labelCenter("Quellen");
      await pencil([[cx, cy, 0.5], [cx + 1, cy + 1, 0.5]], { holdMs: 700 });
      const menu = page!.locator(".menu").last();
      await menu.waitFor({ timeout: 3_000 });
      const items = (await menu.locator(".menu-item-title").allInnerTexts()).map((item) => item.trim());
      expect(items.includes("Add child"), `Menu items: ${items.join(", ")}`);
      expect((await page!.locator(".bloommd-react-shell.is-focus").count()) === 1, "Focus mode ended before the menu was closed.");
      await page!.keyboard.press("Escape");
      await page!.waitForTimeout(200);
      expect((await page!.locator(".menu").count()) === 0, "Escape did not close the menu.");
      expect((await page!.locator(".bloommd-react-shell.is-focus").count()) === 1, "Closing the menu with Escape also left focus mode.");
      expect((await page!.getByRole("toolbar", { name: "Map drawing tools" }).count()) === 1, "Closing the menu with Escape also left draw mode.");
      const inkBefore = await mapInkCount();
      const before = (await nodeByTitle("Quellen").boundingBox())!;
      const end = await freeEnd([cx, cy], 240);
      await pencil(line([cx, cy], end, 10), { holdMs: 700 });
      await page!.waitForTimeout(400);
      const moved = (await nodeByTitle("Quellen").boundingBox())!;
      const shift = Math.hypot(moved.x - before.x, moved.y - before.y);
      expect(shift > 120, `Held pen moved the node only ${Math.round(shift)} px.`);
      await page!.waitForTimeout(1_000);
      expect((await mapInkCount()) === inkBefore, "Moving a node left ink.");
      await tap(cdp, page!, ".bloommd-map-ink-bar button.bloommd-ink-done");
      await openDemoMap(page!);
      const reloaded = (await nodeByTitle("Quellen").boundingBox())!;
      expect(Math.abs(reloaded.x - moved.x) < 2 && Math.abs(reloaded.y - moved.y) < 2, "The pen-moved position was not kept after reload.");
      return `hold → menu (${items.length} actions); hold + drag moved the node ${Math.round(shift)} px, kept after reload`;
    });

    await step("Pen gestures: a line from a node's edge into free space adds a child there", page, async () => {
      await enterDrawMode();
      const count = await page!.locator(".react-flow__node").count();
      const ids = await page!.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")));
      // Striking through the title, on past the node, is writing: ink, no new node.
      const label = (await nodeByTitle("Quellen").locator(".bloommd-node-label").boundingBox())!;
      const nodeBox = (await nodeByTitle("Quellen").boundingBox())!;
      const strikeY = label.y + label.height / 2;
      const strikeInk = await mapInkCount();
      await pencil(line([label.x + 2, strikeY], [nodeBox.x + nodeBox.width + 120, strikeY]));
      await page!.waitForTimeout(1_200);
      expect((await page!.locator(".react-flow__node").count()) === count, "Striking through a node title added a node.");
      expect((await mapInkCount()) === strikeInk + 1, "Striking through a node title was not kept as ink.");
      const inkBefore = await mapInkCount();
      const center = await labelCenter("Quellen");
      const end = await freeEnd(center, 240);
      // The branch is pulled out of the node from its border: start where the line to `end` leaves the node.
      const exit = Math.min(
        ...[[end[0] - center[0], nodeBox.x, nodeBox.x + nodeBox.width, center[0]], [end[1] - center[1], nodeBox.y, nodeBox.y + nodeBox.height, center[1]]]
          .map(([delta, low, high, origin]) => delta! === 0 ? Infinity : ((delta! > 0 ? high! : low!) - origin!) / delta!),
      );
      const from: [number, number] = [center[0] + (end[0] - center[0]) * exit, center[1] + (end[1] - center[1]) * exit];
      const inward = Math.hypot(end[0] - from[0], end[1] - from[1]);
      from[0] -= ((end[0] - from[0]) / inward) * 4;
      from[1] -= ((end[1] - from[1]) / inward) * 4;
      await pencil(line(from, end));
      await page!.waitForFunction((expected) => document.querySelectorAll(".react-flow__node").length === expected, count + 1, { timeout: 10_000 });
      await page!.locator(".bloommd-map-notice", { hasText: "Added a child to Quellen" }).getByRole("button", { name: "Undo" }).waitFor({ timeout: 3_000 });
      const title = page!.locator(".bloommd-flow-node input, .bloommd-flow-node textarea").first();
      if (await title.count()) {
        await title.fill("Stift-Idee");
        await page!.keyboard.press("Enter");
      }
      await page!.waitForTimeout(800);
      const newId = await page!.evaluate((known) => [...document.querySelectorAll(".react-flow__node")].map((node) => node.getAttribute("data-id")).find((id) => id && !known.includes(id)), ids);
      expect(Boolean(newId), "The new node was not found.");
      const box = (await page!.locator(`.react-flow__node[data-id="${newId}"]`).boundingBox())!;
      const distance = Math.hypot(box.x + box.width / 2 - end[0], box.y + box.height / 2 - end[1]);
      expect(distance < 60, `The new node is ${Math.round(distance)} px from where the pen lifted.`);
      await page!.waitForTimeout(800);
      const markdown = (await vaultState(page!)).markdown;
      expect(/## Quellen[\s\S]*### /.test(markdown), "No child heading was added under Quellen.");
      expect((await mapInkCount()) === inkBefore, "The branching line was kept as ink.");
      return `strike-through kept as ink; child created under Quellen from its edge, centred ${Math.round(distance)} px from the pen's end, undo offered, no ink`;
    });

    await step("Pen gestures: scratching out ink erases it", page, async () => {
      await enterDrawMode("Struktur");
      const [x, y] = await freeEnd(await labelCenter("Struktur"), 200);
      await pencil(Array.from({ length: 14 }, (_, index): [number, number, number] => [x + index * 6, y + 10 + Math.sin(index / 2) * 8, 0.5]));
      await page!.waitForTimeout(1_200);
      const before = await mapInkCount();
      const zigzag = Array.from({ length: 11 }, (_, index): [number, number, number] => [x - 5 + (index % 2 === 0 ? 0 : 95), y + index * 2, 0.5]);
      await pencil(zigzag);
      await page!.waitForTimeout(1_200);
      const after = await mapInkCount();
      // The zigzag erases what it crosses, which may include ink earlier steps left nearby.
      expect(after < before && after >= before - 3, `Map ink ${before} → ${after}: the scratch-out should remove the stroke and add none.`);
      return `scratch-out removed the stroke (${before} → ${after}), no zigzag left`;
    });

    await step("Pen gestures: lassoed map ink becomes a node", page, async () => {
      await enterDrawMode("Struktur");
      const [x, y] = await freeEnd(await labelCenter("Struktur"), 260);
      await pencil(Array.from({ length: 14 }, (_, index): [number, number, number] => [x + 10 + index * 5, y + 20 + Math.sin(index / 2) * 8, 0.5]));
      await page!.waitForTimeout(1_200);
      const inkBefore = await mapInkCount();
      const count = await page!.locator(".react-flow__node").count();
      await tap(cdp, page!, '.bloommd-map-ink-bar button[aria-label="Lasso"]');
      await pencil([[x - 5, y - 5, 0.5], [x + 100, y - 5, 0.5], [x + 100, y + 45, 0.5], [x - 5, y + 45, 0.5], [x - 5, y - 4, 0.5]]);
      await tap(cdp, page!, '.bloommd-map-ink-bar button[aria-label="New node from selection"]');
      await page!.waitForFunction((expected) => document.querySelectorAll(".react-flow__node").length === expected, count + 1, { timeout: 10_000 });
      await page!.waitForTimeout(1_500);
      expect((await mapInkCount()) < inkBefore, "The lassoed ink stayed on the map.");
      const state = await vaultState(page!);
      const sketch = /(#{2,6}) Sketch[^\n]*\n([\s\S]*?)(?=\n#{1,6} |$)/.exec(state.markdown);
      expect(Boolean(sketch && /!\[\[[^\]]* ink[^\]]*\.svg\]\]/.test(sketch[2]!)), `The new node does not embed the drawing: ${sketch?.[0].slice(0, 160) ?? "no Sketch heading"}`);
      const created = (await nodeByTitle("Sketch").boundingBox())!;
      const [sx, sy] = [created.x, created.y];
      expect(Math.hypot(sx - x, sy - y) < 80, `The new node is ${Math.round(Math.hypot(sx - x, sy - y))} px from the lassoed ink.`);
      await tap(cdp, page!, '.bloommd-map-ink-bar button[aria-label="Pen"]');
      await tap(cdp, page!, ".bloommd-map-ink-bar button.bloommd-ink-done");
      await tap(cdp, page!, 'button[aria-label="Leave focus mode"]');
      return "lassoed ink → node \"Sketch\" with the drawing, placed where the ink was, ink removed from the map";
    });

    await step("Mobile: agent panel has 44 px targets", page, async () => {
      await page!.evaluate(() => (window as unknown as { app: AgentQaApp }).app.commands.executeCommandById("bloommd:open-agent-panel"));
      await agentTab("proposals");
      await agentTab("requests");
      const small = await agentPanel.evaluate((panel) => [...panel.querySelectorAll<HTMLElement>("button, select, input")]
        .filter((element) => element.offsetParent !== null)
        .map((element) => ({ label: element.textContent || element.getAttribute("aria-label") || element.tagName, height: element.getBoundingClientRect().height }))
        .filter(({ height }) => height < 43.5)
        .map(({ label, height }) => `${label} ${Math.round(height)}px`));
      expect(small.length === 0, `Agent panel targets below 44 px: ${small.join(", ")}`);
      await page!.screenshot({ path: path.join(artifacts, "mobile-agent-panel.png") });
      return "panel opens in mobile mode, all visible controls ≥ 44 px";
    });

    await step("Mobile: shared mode explains it is desktop-only", page, async () => {
      await page!.evaluate(async (note) => {
        const obsidian = (window as unknown as { app: ObsidianApp & { workspace: { getLeaf(newLeaf: boolean): { openFile(file: ObsidianFile): Promise<void> } } } }).app;
        const file = obsidian.vault.getAbstractFileByPath(note);
        if (file) await obsidian.workspace.getLeaf(false).openFile(file);
        await (obsidian as unknown as { commands: { executeCommandById(id: string): boolean } }).commands.executeCommandById("bloommd:share-current-note");
      }, DEMO_NOTE);
      const notice = page!.locator(".notice", { hasText: "Shared mode is not available in Obsidian mobile" });
      await notice.first().waitFor({ timeout: 5_000 });
      await page!.evaluate(() => (window as unknown as { app: ObsidianApp }).app.emulateMobile?.(false));
      return "notice shown, no network request attempted";
    });

    if (consoleErrors.length > 0) {
      results.push({ name: "No console errors", ok: false, detail: consoleErrors.slice(0, 3).join(" | ") });
      console.error(`✗ Console errors: ${consoleErrors.join(" | ")}`);
    }
  } finally {
    await browser?.close().catch(() => undefined);
    if (!options.keepOpen) await stopObsidian(obsidian);
  }

  const failed = results.filter((result) => !result.ok);
  const summary = [
    `# Obsidian ink smoke`,
    ``,
    `Date: ${new Date().toISOString()}`,
    ``,
    ...results.map((result) => `- ${result.ok ? "✅" : "❌"} **${result.name}** — ${result.detail}`),
    ``,
  ].join("\n");
  await writeFile(path.join(artifacts, "summary.md"), summary);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed. Screenshots: ${path.relative(root, artifacts)}`);
  // Exit explicitly: a lingering DevTools socket must not keep the run alive after the summary.
  process.exit(failed.length > 0 ? 1 : 0);
}

await main();
