import { afterEach, beforeEach, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import type { DesktopFolderActivityEntry, DesktopFolderDecision, DesktopFolderShareInfo } from "../shared/rpc-types";
import { FolderSharesDialog, type FolderSharesApi } from "./FolderSharesDialog";

const share = (patch: Partial<DesktopFolderShareInfo> = {}): DesktopFolderShareInfo => ({
  id: "folder-1",
  folderPath: "/Users/me/Notes",
  folderName: "Notes",
  profileId: "server-1",
  profileName: "BloomMD",
  workspaceId: "ws-1",
  strategy: "keep-cloud",
  state: "connected",
  fileCount: 3,
  publishedAt: "2026-11-04T10:00:00.000Z",
  pendingCount: 5,
  folderAvailable: true,
  ...patch,
});

const entries: DesktopFolderActivityEntry[] = [
  { kind: "removed", relativePath: "gone.md", cloudFilename: "gone.md" },
  { kind: "renamed", from: "old.md", to: "docs/new.md", sizeBytes: 1024, cloudFilename: "old.md" },
  { kind: "new", relativePath: "fresh.md", sizeBytes: 2048, status: "upload", cloudFilename: "fresh.md", uploadFilename: "fresh.md" },
  { kind: "new", relativePath: "taken.md", sizeBytes: 10, status: "conflict", cloudFilename: "taken.md", uploadFilename: null },
  { kind: "new", relativePath: "bad?.md", sizeBytes: 10, status: "blocked", cloudFilename: null, uploadFilename: null, reason: "name-not-portable" },
];

let win: Window;
let container: HTMLDivElement;
let root: Root | null = null;
let current: { share: DesktopFolderShareInfo; entries: DesktopFolderActivityEntry[]; unreachable?: boolean };
let calls: { decisions: DesktopFolderDecision[]; disconnects: string[]; activityLoads: number; changed: number; closed: number };
let resolveResult: { success: boolean; error?: string };

const api: FolderSharesApi = {
  listFolderShares: async () => ({ shares: [current.share] }),
  getFolderActivity: async () => {
    calls.activityLoads += 1;
    return { success: true, share: current.share, entries: current.entries, ...(current.unreachable ? { unreachable: true } : {}) };
  },
  resolveFolderActivity: async (_folderId, decision) => {
    calls.decisions.push(decision);
    if (resolveResult.success) current = { ...current, entries: current.entries.filter((entry) => !(entry.kind === decision.kind && (entry.kind === "renamed" ? decision.kind === "renamed" && entry.from === decision.from : decision.kind !== "renamed" && entry.relativePath === decision.relativePath))) };
    return resolveResult;
  },
  disconnectFolderShare: async (folderId) => { calls.disconnects.push(folderId); return { success: true }; },
};

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the folder shares dialog");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const all = (id: string) => [...container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const entry = (kind: string, path: string) => container.querySelector<HTMLElement>(`[data-testid="folder-activity-entry"][data-kind="${kind}"][data-path="${path}"]`)!;
const within = (element: HTMLElement, id: string) => element.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
const click = (element: Element | null) => {
  expect(element).not.toBeNull();
  flushSync(() => (element as HTMLElement).click());
};

async function mount() {
  flushSync(() => root!.render(React.createElement(FolderSharesDialog, {
    locale: "de",
    api,
    onChanged: () => { calls.changed += 1; },
    onClose: () => { calls.closed += 1; },
  })));
  await waitFor(() => all("folder-activity-entry").length > 0 || all("folder-activity-empty").length > 0);
}

beforeEach(() => {
  current = { share: share(), entries: [...entries] };
  calls = { decisions: [], disconnects: [], activityLoads: 0, changed: 0, closed: 0 };
  resolveResult = { success: true };
  win = new Window({ url: "https://bloommd.test/desktop" });
  globalThis.window = win as unknown as typeof window;
  globalThis.document = win.document as unknown as Document;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) flushSync(() => root?.unmount());
  root = null;
  await win.happyDOM.close();
});

test("lists new, removed and renamed files with their labels and decides nothing by itself", async () => {
  await mount();
  expect(entry("new", "fresh.md").querySelector('[data-testid="folder-activity-label"]')?.textContent).toBe("neu, noch nicht geteilt");
  expect(entry("removed", "gone.md").querySelector('[data-testid="folder-activity-label"]')?.textContent).toBe("lokal entfernt");
  expect(entry("renamed", "docs/new.md").querySelector('[data-testid="folder-activity-label"]')?.textContent).toBe("lokal umbenannt");
  expect(entry("renamed", "docs/new.md").textContent).toContain("old.md → docs/new.md");
  expect(entry("removed", "gone.md").textContent).toContain("Es wird nie automatisch gelöscht.");
  expect(container.querySelector('[data-testid="folder-share-state"]')?.textContent).toBe("Verbunden");
  expect(calls.decisions).toEqual([]);
  expect(calls.disconnects).toEqual([]);
});

test("a new file is uploaded only on the upload button; conflicts and blocked files can only be dismissed", async () => {
  await mount();
  expect(within(entry("new", "taken.md"), "folder-activity-upload")).toBeNull();
  expect(within(entry("new", "taken.md"), "folder-activity-ignore")).not.toBeNull();
  expect(entry("new", "taken.md").textContent).toContain("bleibt unberührt");
  expect(within(entry("new", "bad?.md"), "folder-activity-upload")).toBeNull();
  expect(entry("new", "bad?.md").textContent).toContain("passt nicht in einen Cloud-Namen");
  expect(entry("new", "fresh.md").textContent).toContain("erst nach deiner Bestätigung hochgeladen");

  click(within(entry("new", "fresh.md"), "folder-activity-upload"));
  await waitFor(() => calls.decisions.length === 1 && all("folder-activity-entry").length === 4);
  expect(calls.decisions).toEqual([{ kind: "new", relativePath: "fresh.md", action: "upload" }]);
  expect(calls.changed).toBe(1);
  expect(calls.activityLoads).toBe(2);
});

test("ignoring a new file sends only the ignore decision", async () => {
  await mount();
  click(within(entry("new", "fresh.md"), "folder-activity-ignore"));
  await waitFor(() => calls.decisions.length === 1);
  expect(calls.decisions).toEqual([{ kind: "new", relativePath: "fresh.md", action: "ignore" }]);
});

test("keeping the cloud document is one click, removing it needs a second explicit confirmation", async () => {
  await mount();
  click(within(entry("removed", "gone.md"), "folder-activity-remove-cloud"));
  expect(calls.decisions).toEqual([]);
  expect(entry("removed", "gone.md").textContent).toContain("Cloud-Dokument wirklich entfernen?");

  click(within(entry("removed", "gone.md"), "folder-activity-remove-cloud-confirm"));
  await waitFor(() => calls.decisions.length === 1);
  expect(calls.decisions).toEqual([{ kind: "removed", relativePath: "gone.md", action: "remove-cloud" }]);
});

test("keep cloud document sends the keep decision and never a removal", async () => {
  await mount();
  click(within(entry("removed", "gone.md"), "folder-activity-keep-cloud"));
  await waitFor(() => calls.decisions.length === 1);
  expect(calls.decisions).toEqual([{ kind: "removed", relativePath: "gone.md", action: "keep-cloud" }]);
});

test("a rename is reassigned or treated as a new file by explicit choice", async () => {
  await mount();
  click(within(entry("renamed", "docs/new.md"), "folder-activity-reassign"));
  await waitFor(() => calls.decisions.length === 1);
  expect(calls.decisions[0]).toEqual({ kind: "renamed", from: "old.md", to: "docs/new.md", action: "reassign" });
});

test("a removed file can be assigned by hand to a new file when the rename was not certain", async () => {
  await mount();
  const row = entry("removed", "gone.md");
  expect(within(row, "folder-activity-assign")?.disabled).toBe(true);
  const select = row.querySelector<HTMLSelectElement>('[data-testid="folder-activity-assign-target"]')!;
  expect([...select.options].map((option) => option.value)).toEqual(["", "fresh.md", "taken.md", "bad?.md"]);
  select.value = "fresh.md";
  flushSync(() => select.dispatchEvent(new win.Event("change", { bubbles: true }) as unknown as Event));
  expect(within(row, "folder-activity-assign")?.disabled).toBe(false);
  click(within(row, "folder-activity-assign"));
  await waitFor(() => calls.decisions.length === 1);
  expect(calls.decisions).toEqual([{ kind: "renamed", from: "gone.md", to: "fresh.md", action: "reassign" }]);
});

test("a revoked share offers no manual assignment", async () => {
  current = { share: share({ state: "revoked" }), entries: [...entries] };
  await mount();
  expect(entry("removed", "gone.md").querySelector('[data-testid="folder-activity-assign-target"]')).toBeNull();
});

test("a rejected decision shows its reason and the list is reloaded", async () => {
  resolveResult = { success: false, error: "FOLDER_FILE_STILL_PRESENT" };
  await mount();
  click(within(entry("removed", "gone.md"), "folder-activity-keep-cloud"));
  await waitFor(() => all("folder-share-error").length === 1);
  expect(container.querySelector('[data-testid="folder-share-error"]')?.textContent).toContain("Die Datei ist inzwischen wieder vorhanden.");
  expect(calls.activityLoads).toBe(2);
});

test("a revoked share shows the status, blocks uploads and cloud removal and stays disconnectable", async () => {
  current = { share: share({ state: "revoked" }), entries: [...entries] };
  await mount();
  expect(container.querySelector('[data-testid="folder-share-state"]')?.textContent).toBe("Zugriff entzogen");
  expect(container.querySelector('[data-testid="folder-share-revoked"]')?.textContent).toContain("Deine lokalen Dateien bleiben unverändert");
  expect(within(entry("new", "fresh.md"), "folder-activity-upload")?.disabled).toBe(true);
  expect(within(entry("removed", "gone.md"), "folder-activity-remove-cloud")?.disabled).toBe(true);
  expect(within(container, "folder-share-disconnect")?.disabled).toBe(false);
});

test("disconnecting needs a confirmation, then reports that nothing was deleted", async () => {
  await mount();
  click(within(container, "folder-share-disconnect"));
  expect(calls.disconnects).toEqual([]);
  expect(container.textContent).toContain("Beendet nur die lokale Bindung.");

  click(within(container, "folder-share-disconnect-confirm"));
  await waitFor(() => calls.disconnects.length === 1);
  await waitFor(() => all("folder-share").length === 0);
  expect(calls.disconnects).toEqual(["folder-1"]);
  expect(container.querySelector('[data-testid="folder-shares-message"]')?.textContent).toContain("Lokale Dateien und Cloud-Dokumente wurden nicht gelöscht.");
  expect(calls.changed).toBe(1);
});

test("an unreachable server is shown without ending the share", async () => {
  current = { share: share(), entries: [], unreachable: true };
  await mount();
  expect(container.querySelector('[data-testid="folder-share-state"]')?.textContent).toBe("Server nicht erreichbar");
  expect(container.querySelector('[data-testid="folder-activity-empty"]')?.textContent).toContain("Keine Änderungen");
});
