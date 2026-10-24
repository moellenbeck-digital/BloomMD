/**
 * Captures the App Store screenshots from the iOS simulator with the real app and a demo vault.
 *
 *   cd packages/mobile
 *   bunx vite build --config store/screenshots/harness/vite.config.ts && bunx cap sync ios
 *   (cd ios/App && xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator \
 *     -destination 'generic/platform=iOS Simulator' -derivedDataPath <dd> CODE_SIGNING_ALLOWED=NO build)
 *   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
 *     bun store/screenshots/harness/capture.ts --app <dd>/Build/Products/Debug-iphonesimulator/App.app \
 *       --iphone <simulator udid> --ipad <simulator udid> [--only iphone|ipad] [--locale de|en]
 *
 * Needs python3 with Pillow (alpha channel is removed for App Store Connect) and a Debug build: the demo vault is opened through the debug-only test folder access.
 * Writes `store/screenshots/ios/<de-DE|en-US>/<iphone-6.9|ipad-13>/NN-<scene>.png`.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeDemoVault, type DemoLocale, type DemoScenes } from "./demo-vault";

const BUNDLE_ID = "app.bloommd.mobile";
const OUT_ROOT = resolve(import.meta.dirname, "..", "ios");

interface Shot {
  name: string;
  open: (scenes: DemoScenes) => { path: string; node?: string };
  mode?: "map" | "outline" | "presentation";
  editor?: boolean;
  drawer?: boolean;
  ink?: boolean;
  settleMs?: number;
  locales?: DemoLocale[];
}

const SHOTS: Shot[] = [
  { name: "map", open: (s) => ({ path: s.study.path }) },
  { name: "handwriting", open: (s) => ({ path: s.study.path, node: s.study.inkNode }), editor: true, ink: true, settleMs: 3500 },
  { name: "vault", open: (s) => ({ path: s.study.path }), drawer: true },
  { name: "outline", open: (s) => ({ path: s.study.path }), mode: "outline" },
  { name: "tasks", open: (s) => ({ path: s.project.path, node: s.project.taskNode }), editor: true, settleMs: 3500 },
  { name: "presentation", open: (s) => ({ path: s.study.path, node: s.study.presentNode }), mode: "presentation" },
];

const DEVICES = {
  iphone: { folder: "iphone-6.9" },
  ipad: { folder: "ipad-13" },
} as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(cmd: string[], allowFail = false): string {
  const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0 && !allowFail) {
    throw new Error(`${cmd.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

const simctl = (...args: string[]) => run(["xcrun", "simctl", ...args]);

async function waitFor(path: string, timeoutMs: number): Promise<string> {
  const start = Date.now();
  while (!existsSync(path)) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${path}`);
    await Bun.sleep(250);
  }
  await Bun.sleep(150);
  return readFileSync(path, "utf8");
}

function prepareDevice(udid: string, app: string, locale: DemoLocale): string {
  // System language for the status bar date (iPad) and the web view; takes effect after a reboot.
  run(["xcrun", "simctl", "shutdown", udid], true);
  run(["xcrun", "simctl", "boot", udid], true);
  simctl("bootstatus", udid, "-b");
  simctl("spawn", udid, "defaults", "write", "-g", "AppleLanguages", "-array", locale === "de" ? "de-DE" : "en-US");
  simctl("spawn", udid, "defaults", "write", "-g", "AppleLocale", locale === "de" ? "de_DE" : "en_US");
  run(["xcrun", "simctl", "shutdown", udid], true);
  run(["xcrun", "simctl", "boot", udid], true);
  simctl("bootstatus", udid, "-b");
  simctl("ui", udid, "appearance", "light");
  simctl("status_bar", udid, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100", "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--dataNetwork", "wifi");
  simctl("install", udid, app);
  return simctl("get_app_container", udid, BUNDLE_ID, "data");
}

async function captureDevice(device: keyof typeof DEVICES, udid: string, app: string, locales: DemoLocale[]): Promise<string[]> {
  const written: string[] = [];
  for (const locale of locales) {
    const documents = join(prepareDevice(udid, app, locale), "Documents");
    const demoDir = join(documents, "demo", locale);
    rmSync(demoDir, { recursive: true, force: true });
    const { vault } = writeDemoVault(demoDir, locale);
    const outDir = join(OUT_ROOT, locale === "de" ? "de-DE" : "en-US", DEVICES[device].folder);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    let number = 0;
    for (const shot of SHOTS) {
      if (shot.locales && !shot.locales.includes(locale)) continue;
      number += 1;
      // Fresh vault per shot, so nothing a previous shot changed shows up (node ids are new each time).
      rmSync(demoDir, { recursive: true, force: true });
      const scenes = writeDemoVault(demoDir, locale);
      run(["xcrun", "simctl", "terminate", udid, BUNDLE_ID], true);
      const ready = join(documents, "screenshot-ready.json");
      rmSync(ready, { force: true });
      writeFileSync(join(documents, "screenshot-scene.json"), JSON.stringify({
        folder: join(demoDir, vault),
        locale,
        ...shot.open(scenes),
        ...(shot.mode ? { mode: shot.mode } : {}),
        ...(shot.editor ? { editor: true } : {}),
        ...(shot.drawer ? { drawer: true } : {}),
        ...(shot.ink ? { ink: true } : {}),
        ...(shot.settleMs ? { settleMs: shot.settleMs } : {}),
      }));
      simctl("launch", udid, BUNDLE_ID);
      const result = JSON.parse(await waitFor(ready, 45_000)) as { ok: boolean; error?: string };
      if (!result.ok) throw new Error(`${device}/${locale}/${shot.name}: ${result.error}`);
      await Bun.sleep(400);
      const file = join(outDir, `${String(number).padStart(2, "0")}-${shot.name}.png`);
      simctl("io", udid, "screenshot", "--type=png", file);
      // App Store Connect rejects screenshots with an alpha channel; the simulator writes one.
      run(["python3", "-c", "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[1], optimize=True)", file]);
      written.push(file);
      console.log(file);
    }
  }
  run(["xcrun", "simctl", "terminate", udid, BUNDLE_ID], true);
  return written;
}

const app = arg("app");
if (!app || !existsSync(app)) throw new Error("--app <path to Debug-iphonesimulator/App.app> is required");
const only = arg("only");
const localeArg = arg("locale");
const locales: DemoLocale[] = localeArg === "de" || localeArg === "en" ? [localeArg] : ["de", "en"];
for (const device of ["iphone", "ipad"] as const) {
  if (only && only !== device) continue;
  const udid = arg(device);
  if (!udid) throw new Error(`--${device} <simulator udid> is required`);
  await captureDevice(device, udid, app, locales);
}
