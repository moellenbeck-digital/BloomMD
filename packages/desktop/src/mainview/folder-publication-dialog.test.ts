import { afterEach, beforeEach, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import type { SharedFolderPlanItem } from "@bloommd/core/shared-folder-publication";
import type { DesktopFolderPublicationPreview, DesktopWorkspaceInfo } from "../shared/rpc-types";
import { FolderPublicationDialog, type FolderPublicationApi } from "./FolderPublicationDialog";

const editor: DesktopWorkspaceInfo = { id: "ws-editor", name: "Team", slug: "team", kind: "team", role: "editor" };
const viewer: DesktopWorkspaceInfo = { id: "ws-viewer", name: "Read only", slug: "ro", kind: "team", role: "viewer" };

const item = (relativePath: string, patch: Partial<SharedFolderPlanItem> = {}): SharedFolderPlanItem => ({
  relativePath,
  sizeBytes: 1024,
  status: "upload",
  cloudFilename: relativePath.split("/").join("__"),
  uploadFilename: relativePath.split("/").join("__"),
  ...patch,
});

function previewFor(strategy: "keep-cloud" | "suffix"): DesktopFolderPublicationPreview {
  const items = [
    item("a.md"),
    item("docs/b.md"),
    item("docs/c.md"),
    item("big.md", { sizeBytes: 5 * 1024 * 1024, status: "blocked", uploadFilename: null, reason: "too-large" }),
    item("bad?.md", { status: "blocked", cloudFilename: null, uploadFilename: null, reason: "name-not-portable" }),
    item("taken.md", { status: "conflict", uploadFilename: null }),
  ];
  return {
    folderPath: "/Users/me/Notes",
    workspace: editor,
    strategy,
    items,
    totals: { fileCount: 6, uploadCount: 3, uploadBytes: 3072, conflictCount: 1, excludedCount: 0, blockedCount: 2 },
    alreadyPublished: 0,
    alreadyShared: 0,
  };
}

let win: Window;
let container: HTMLDivElement;
let root: Root | null = null;
let calls: { select: number; choose: number; preview: Array<{ strategy: string; excluded: string[] }>; publish: Array<{ workspaceId: string; strategy: string; excluded: string[]; confirmedUploads: string[] }> };
let closed = 0;

const api: FolderPublicationApi = {
  getConnectionMode: async () => ({ type: "local", dir: "/Users/me/Notes" }),
  listProfileWorkspaces: async () => ({ workspace: viewer, workspaces: [viewer, editor] }),
  selectOpenFolderForPublication: async () => { calls.select += 1; return { path: "/Users/me/Notes" }; },
  choosePublicationFolder: async () => { calls.choose += 1; return { path: "/Users/me/Other" }; },
  previewFolderPublication: async ({ strategy, excluded }) => {
    calls.preview.push({ strategy, excluded });
    return { success: true, preview: previewFor(strategy) };
  },
  publishFolderAsWorkspace: async ({ workspaceId, strategy, excluded, confirmedUploads }) => {
    calls.publish.push({ workspaceId, strategy, excluded, confirmedUploads });
    return { success: true, published: confirmedUploads.length, skipped: [], failed: [], rollbackFailures: [] };
  },
};

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the folder publication dialog");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const byId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (element: Element | null) => {
  expect(element).not.toBeNull();
  flushSync(() => (element as HTMLElement).click());
};
const text = () => container.textContent ?? "";

async function openPreview() {
  click(byId("folder-publication-use-current"));
  await waitFor(() => Boolean(byId("folder-publication-workspace")) && (byId("folder-publication-workspace") as HTMLSelectElement).value === "ws-editor");
  click(byId("folder-publication-preview"));
  await waitFor(() => Boolean(byId("folder-publication-summary")));
}

beforeEach(async () => {
  calls = { select: 0, choose: 0, preview: [], publish: [] };
  closed = 0;
  win = new Window({ url: "https://bloommd.test/desktop" });
  globalThis.window = win as unknown as typeof window;
  globalThis.document = win.document as unknown as Document;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root!.render(React.createElement(FolderPublicationDialog, {
    profiles: [{ id: "server-1", name: "BloomMD", url: "https://bloommd.app", hasToken: true }],
    locale: "de",
    api,
    onClose: () => { closed += 1; },
  })));
  await waitFor(() => Boolean(byId("folder-publication-suggestion")));
});

afterEach(async () => {
  if (root) flushSync(() => root?.unmount());
  root = null;
  await win.happyDOM.close();
});

test("suggests the open folder but reads and uploads nothing before the person confirms", async () => {
  expect(byId("folder-publication-suggestion")?.textContent).toBe("/Users/me/Notes");
  expect(text()).toContain("Ordner als gemeinsamen Workspace veröffentlichen");
  expect(text()).toContain("Es wird nichts gelesen oder hochgeladen, bevor du in der Vorschau bestätigst.");
  expect(calls).toEqual({ select: 0, choose: 0, preview: [], publish: [] });
});

test("offers only writable workspaces and shows target, count, size and strategy in the preview", async () => {
  click(byId("folder-publication-use-current"));
  await waitFor(() => Boolean(byId("folder-publication-workspace")) && (byId("folder-publication-workspace") as HTMLSelectElement).value === "ws-editor");
  const options = [...container.querySelectorAll<HTMLOptionElement>('[data-testid="folder-publication-workspace"] option')];
  expect(options.find((option) => option.value === "ws-viewer")?.disabled).toBe(true);
  expect(calls.preview).toEqual([]);

  click(byId("folder-publication-preview"));
  await waitFor(() => Boolean(byId("folder-publication-summary")));
  expect(calls.preview).toEqual([{ strategy: "keep-cloud", excluded: [] }]);
  expect(byId("folder-publication-target")?.textContent).toContain("Team");
  expect(byId("folder-publication-count")?.textContent).toBe("3");
  expect(byId("folder-publication-size")?.textContent).toBe("3.0 KB");
  expect(byId("folder-publication-strategy-label")?.textContent).toContain("Vorhandene Cloud-Datei nicht anfassen, als Konflikt melden");
  expect(calls.publish).toEqual([]);
});

test("marks blocked and conflicting files with a reason and does not let them be included", async () => {
  await openPreview();
  const row = (path: string) => container.querySelector<HTMLElement>(`[data-testid="folder-publication-file"][data-path="${path}"]`)!;
  expect(row("big.md").querySelector<HTMLInputElement>("input")?.disabled).toBe(true);
  expect(row("big.md").textContent).toContain("größer als 1 MB");
  expect(row("bad?.md").querySelector<HTMLInputElement>("input")?.disabled).toBe(true);
  expect(row("bad?.md").textContent).toContain("passt nicht in einen Cloud-Namen");
  expect(row("taken.md").textContent).toContain("bleibt unberührt");
  expect(row("docs/b.md").textContent).toContain("→ docs__b.md");
});

test("excluding a whole sub-folder updates the summary and the confirmed upload list", async () => {
  await openPreview();
  const folderCheckbox = container.querySelector<HTMLInputElement>('[data-testid="folder-publication-folder"][data-path="docs"] input[type="checkbox"]');
  click(folderCheckbox);
  expect(byId("folder-publication-count")?.textContent).toBe("1");
  expect(byId("folder-publication-size")?.textContent).toBe("1.0 KB");
  expect(calls.publish).toEqual([]);

  click(byId("folder-publication-confirm"));
  await waitFor(() => Boolean(byId("folder-publication-result")));
  expect(calls.publish).toEqual([{
    workspaceId: "ws-editor",
    strategy: "keep-cloud",
    excluded: ["docs/b.md", "docs/c.md"],
    confirmedUploads: ["a.md"],
  }]);
  expect(byId("folder-publication-result")?.textContent).toContain("1 Datei(en) in „Team“ veröffentlicht.");
  expect(byId("folder-publication-result")?.textContent).toContain("Deine lokalen Dateien wurden nicht verändert.");
});

test("changing the strategy reloads the preview without uploading and keeps the exclusions", async () => {
  await openPreview();
  click(container.querySelector('[data-testid="folder-publication-folder"][data-path="docs"] input[type="checkbox"]'));
  const suffixRadio = container.querySelector<HTMLInputElement>('input[name="folder-publication-preview-strategy"]:not(:checked)');
  click(suffixRadio);
  await waitFor(() => calls.preview.length === 2);
  expect(calls.preview[1]).toEqual({ strategy: "suffix", excluded: [] });
  await waitFor(() => !(byId("folder-publication-confirm") as HTMLButtonElement).disabled);
  expect(byId("folder-publication-count")?.textContent).toBe("1");
  expect(calls.publish).toEqual([]);
});

test("the publish button stays disabled while nothing is selected", async () => {
  await openPreview();
  for (const path of ["docs"]) click(container.querySelector(`[data-testid="folder-publication-folder"][data-path="${path}"] input[type="checkbox"]`));
  click(container.querySelector('[data-testid="folder-publication-file"][data-path="a.md"] input[type="checkbox"]'));
  expect(byId("folder-publication-count")?.textContent).toBe("0");
  expect((byId("folder-publication-confirm") as HTMLButtonElement).disabled).toBe(true);
  expect(calls.publish).toEqual([]);
  expect(closed).toBe(0);
});
