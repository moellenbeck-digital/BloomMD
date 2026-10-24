/**
 * Screenshot driver. The capture script writes `Documents/screenshot-scene.json`, launches the app
 * and waits for `Documents/screenshot-ready.json`. The app itself is unchanged: the driver opens the
 * demo vault (debug-only test folder access) before the app starts, then taps the note in the file
 * drawer and sets selection, view mode, editor and drawer like a user would.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider, requestNodeFocus, useMindMapStore, type Locale } from "@bloommd/ui";
import { BloomFolder } from "@bloommd/capacitor-folder";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { App } from "../../../src/App";
import "./harness.css";

interface Scene {
  /** Absolute path of the demo vault inside the simulator's app container. */
  folder: string;
  locale: Locale;
  /** Note to open, relative to the vault, and optionally the node to select. */
  path: string;
  node?: string;
  mode?: "map" | "outline" | "presentation";
  editor?: boolean;
  drawer?: boolean;
  /** Open the node's first drawing in the full-screen handwriting editor. */
  ink?: boolean;
  /** Extra wait before reporting ready, e.g. for the handwriting preview. */
  settleMs?: number;
}

const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms));

async function until(check: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for the app.");
    await wait(100);
  }
}

async function report(result: Record<string, unknown>): Promise<void> {
  await Filesystem.writeFile({ directory: Directory.Documents, path: "screenshot-ready.json", data: JSON.stringify(result), encoding: Encoding.UTF8 });
}

async function applyScene(scene: Scene): Promise<void> {
  // Open the file drawer and tap the note like a user.
  const toggle = () => document.querySelector<HTMLButtonElement>('[data-testid="mobile-files-toggle"]');
  const entry = () => [...document.querySelectorAll<HTMLButtonElement>("aside button[title]")].find((button) => button.title === scene.path);
  await until(() => Boolean(toggle()), 20_000);
  await wait(500);
  if (!entry()) toggle()!.click();
  await until(() => Boolean(entry()), 20_000);
  entry()!.click();
  await until(() => useMindMapStore.getState().document?.filePath === scene.path, 20_000);
  await wait(1200);
  const store = useMindMapStore.getState();
  store.setSelectedNodeId(scene.node ?? null);
  if (scene.mode) store.setCanvasMode(scene.mode);
  if (scene.editor) store.setEditorVisible(true);
  if (scene.node) {
    // Once the editor panel took its space, bring the node into view next to it.
    await wait(700);
    requestNodeFocus(scene.node);
  }
  if (scene.ink) {
    const pencil = () => document.querySelector<HTMLButtonElement>('[data-testid="node-handwriting"] button[aria-label*="ink.svg"]');
    await until(() => Boolean(pencil()), 20_000);
    pencil()!.click();
  }
  if (scene.drawer) {
    await wait(600);
    toggle()!.click();
  }
  // Let fonts, layout and lazy chunks (node editor, handwriting preview) settle.
  await wait(scene.settleMs ?? 2500);
  // Nothing should look selected or focused unless the scene asks for the editor.
  if (!scene.editor && !scene.drawer) (document.activeElement as HTMLElement | null)?.blur();
  await report({ ok: true, document: useMindMapStore.getState().document?.filePath ?? null, selected: useMindMapStore.getState().selectedNodeId });
}

async function start(): Promise<void> {
  const raw = await Filesystem.readFile({ directory: Directory.Documents, path: "screenshot-scene.json", encoding: Encoding.UTF8 });
  const scene = JSON.parse(raw.data as string) as Scene;
  await Filesystem.deleteFile({ directory: Directory.Documents, path: "screenshot-ready.json" }).catch(() => undefined);
  await BloomFolder.useTestFolder({ path: scene.folder });
  document.documentElement.lang = scene.locale;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <LocaleProvider initialLocale={scene.locale}>
        <App />
      </LocaleProvider>
    </StrictMode>,
  );
  await applyScene(scene).catch((error: unknown) => report({ ok: false, error: String(error) }));
}

void start();
