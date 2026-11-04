import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import React, { createRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { buildWorkspaceMindMap, parseFile } from "@bloommd/core/browser";
import { Toolbar, type ToolbarHandle } from "./Toolbar";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { translations } from "../i18n/translations";

let root: Root | null = null;

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  root = null;
  useMindMapStore.getState().setDocument(null);
});

test("@t19 saving a workspace neither writes nor shows a success check", async () => {
  const win = new Window({ url: "https://bloommd.test/desktop" });
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.localStorage = win.localStorage;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const ref = createRef<ToolbarHandle>();
  let saves = 0;
  useMindMapStore.getState().setDocument(buildWorkspaceMindMap([
    { path: "digitaler-avatar.md", markdown: "# Digitaler Avatar\n" },
  ], { source: "/temporary-vault" }));
  root = createRoot(container);
  flushSync(() => root!.render(<Toolbar ref={ref} onSaveFile={() => { saves += 1; }} />));
  await ref.current!.triggerSave();
  await new Promise((resolve) => setTimeout(resolve, 20));
  flushSync(() => {});
  expect(saves).toBe(0);
  expect(container.querySelector(".lucide-check")).toBeNull();
  expect(useMindMapStore.getState().statusMessage).toBe(translations.de.derivedWorkspaceSave);

  flushSync(() => useMindMapStore.getState().setDocument(parseFile("digitaler-avatar.md", "# Digitaler Avatar\n")));
  await ref.current!.triggerSave();
  await new Promise((resolve) => setTimeout(resolve, 20));
  flushSync(() => {});
  expect(saves).toBe(1);
  expect(container.querySelector(".lucide-check")).not.toBeNull();
});

test("@t19 workspace save hint disappears when a file is opened and the file stays saveable", async () => {
  const win = new Window({ url: "https://bloommd.test/desktop" });
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.localStorage = win.localStorage;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const ref = createRef<ToolbarHandle>();
  let saves = 0;
  useMindMapStore.getState().setDocument(buildWorkspaceMindMap([
    { path: "digitaler-avatar.md", markdown: "# Digitaler Avatar\n" },
  ], { source: "/temporary-vault" }));
  root = createRoot(container);
  flushSync(() => root!.render(<Toolbar ref={ref} onSaveFile={() => { saves += 1; }} />));
  await ref.current!.triggerSave();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(useMindMapStore.getState().statusMessage).toBe(translations.de.derivedWorkspaceSave);

  flushSync(() => useMindMapStore.getState().setDocument(parseFile("digitaler-avatar.md", "# Digitaler Avatar\n")));
  expect(useMindMapStore.getState().statusMessage).toBeNull();
  await ref.current!.triggerSave();
  await new Promise((resolve) => setTimeout(resolve, 20));
  flushSync(() => {});
  expect(saves).toBe(1);
  expect(useMindMapStore.getState().statusMessage).toBeNull();
  expect(container.querySelector(".lucide-check")).not.toBeNull();
});

test("#3 the history button is offered only when the host supports it, and needs an open note", () => {
  const win = new Window({ url: "https://bloommd.test/desktop" });
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.localStorage = win.localStorage;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let opened = 0;

  flushSync(() => root!.render(<Toolbar />));
  expect(container.querySelector("[data-testid='toolbar-history']")).toBeNull();

  flushSync(() => root!.render(<Toolbar onOpenHistory={() => { opened += 1; }} />));
  const button = container.querySelector<HTMLButtonElement>("[data-testid='toolbar-history']")!;
  expect(button.disabled).toBe(true);

  flushSync(() => useMindMapStore.getState().setDocument(parseFile("note.md", "# Note\n")));
  expect(button.disabled).toBe(false);
  button.click();
  expect(opened).toBe(1);
});

function mountToolbar(props: React.ComponentProps<typeof Toolbar> = {}) {
  const win = new Window({ url: "https://bloommd.test/app" });
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.localStorage = win.localStorage;
  globalThis.FileReader = win.FileReader as unknown as typeof FileReader;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const ref = createRef<ToolbarHandle>();
  root = createRoot(container);
  flushSync(() => root!.render(<Toolbar ref={ref} {...props} />));
  return { win, container, ref };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test("@t6 the export button opens a menu with all five formats in a fixed order, none locked", async () => {
  const { container } = mountToolbar();
  flushSync(() => useMindMapStore.getState().setDocument(parseFile("reise.md", "# Reise\n")));
  expect(container.querySelector("[data-testid='export-menu']")).toBeNull();
  container.querySelector<HTMLButtonElement>("[data-testid='toolbar-export']")!.click();
  await settle();
  const menu = container.querySelector("[data-testid='export-menu']")!;
  expect(menu).not.toBeNull();
  const items = Array.from(menu.querySelectorAll<HTMLElement>("[role='menuitem']"));
  expect(items.map((item) => item.getAttribute("data-testid"))).toEqual(["export-markdown", "export-opml", "export-pdf", "export-png", "export-svg"]);
  expect(items.map((item) => item.textContent)).toEqual(["Markdown (.md)", "OPML (.opml)", "PDF (.pdf)", "PNG (.png)", "SVG (.svg)"]);
  for (const item of items) {
    expect(item.hasAttribute("disabled")).toBe(false);
    expect(item.getAttribute("aria-disabled")).toBeNull();
  }
  expect(menu.textContent).not.toMatch(/\b(Pro|Abo|Upgrade|Premium)\b/i);
});

test("@t6 Cmd+E (triggerExport) toggles the export menu and Escape closes it", async () => {
  const { container, ref } = mountToolbar();
  flushSync(() => useMindMapStore.getState().setDocument(parseFile("reise.md", "# Reise\n")));
  ref.current!.triggerExport();
  await settle();
  expect(container.querySelector("[data-testid='export-menu']")).not.toBeNull();
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  await settle();
  expect(container.querySelector("[data-testid='export-menu']")).toBeNull();
});

test("@t6 Markdown and OPML entries hand <Title>.md / <Title>.opml to the platform", async () => {
  const delivered: Array<{ filename: string; mimeType: string; text: string }> = [];
  const { container } = mountToolbar({ onDeliverExport: (file) => { delivered.push({ filename: file.filename, mimeType: file.mimeType, text: new TextDecoder().decode(file.data) }); } });
  flushSync(() => useMindMapStore.getState().setDocument(parseFile("reise.md", "---\ntitle: Reise\n---\n# Reise\n\n## Hotel\n")));
  for (const format of ["markdown", "opml"]) {
    container.querySelector<HTMLButtonElement>("[data-testid='toolbar-export']")!.click();
    await settle();
    container.querySelector<HTMLButtonElement>(`[data-testid='export-${format}']`)!.click();
    await settle();
    expect(container.querySelector("[data-testid='export-menu']")).toBeNull();
  }
  expect(delivered.map((file) => file.filename)).toEqual(["Reise.md", "Reise.opml"]);
  expect(delivered[0]!.text).toContain("## Hotel");
  expect(delivered[1]!.text).toContain('<outline text="Hotel"/>');
});

test("@t6 the workspace map keeps its message and exports nothing", async () => {
  const delivered: string[] = [];
  const { container } = mountToolbar({ onDeliverExport: (file) => { delivered.push(file.filename); } });
  flushSync(() => useMindMapStore.getState().setDocument(buildWorkspaceMindMap([{ path: "a.md", markdown: "# A\n" }], { source: "/vault" })));
  container.querySelector<HTMLButtonElement>("[data-testid='toolbar-export']")!.click();
  await settle();
  container.querySelector<HTMLButtonElement>("[data-testid='export-opml']")!.click();
  await settle();
  expect(delivered).toEqual([]);
  expect(useMindMapStore.getState().statusMessage).toBe(translations.de.derivedWorkspaceExport);
});

test("@t6 a map export without a mounted map reports it instead of failing silently", async () => {
  const delivered: string[] = [];
  const { container } = mountToolbar({ onDeliverExport: (file) => { delivered.push(file.filename); } });
  flushSync(() => useMindMapStore.getState().setDocument(parseFile("reise.md", "# Reise\n")));
  container.querySelector<HTMLButtonElement>("[data-testid='toolbar-export']")!.click();
  await settle();
  container.querySelector<HTMLButtonElement>("[data-testid='export-png']")!.click();
  await settle();
  expect(delivered).toEqual([]);
  expect(useMindMapStore.getState().statusMessage).toBe(translations.de.exportNoMap);
});

test("@t6 import accepts .opml and opens a new map titled by the file name", async () => {
  const created: string[] = [];
  const { win, container } = mountToolbar({ onNewFile: (doc) => { created.push(doc.filePath); } });
  const input = container.querySelector<HTMLInputElement>("input[type='file']")!;
  expect(input.getAttribute("accept")).toContain(".opml");
  const file = new win.File([`<opml version="2.0"><head><title>Plan</title></head><body><outline text="Root"><outline text="Kind" _note="Notiz"/></outline></body></opml>`], "Wechsel.opml");
  Object.defineProperty(input, "files", { value: [file] });
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  await settle();
  const doc = useMindMapStore.getState().document!;
  expect(doc.frontmatter.title).toBe("Wechsel");
  expect([...doc.nodes.values()].map((node) => node.title)).toEqual(["Root", "Kind"]);
  expect(created).toEqual(["Wechsel.md"]);
});

test("@t6 a broken OPML file shows a clear message and opens nothing", async () => {
  const created: string[] = [];
  const { win, container } = mountToolbar({ onNewFile: (doc) => { created.push(doc.filePath); } });
  flushSync(() => useMindMapStore.getState().setDocument(parseFile("alt.md", "# Alt\n")));
  const input = container.querySelector<HTMLInputElement>("input[type='file']")!;
  Object.defineProperty(input, "files", { value: [new win.File(["<opml><body><outline text='x'>"], "kaputt.opml")] });
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  await settle();
  expect(created).toEqual([]);
  expect(useMindMapStore.getState().document!.frontmatter.title).toBe("alt");
  expect(useMindMapStore.getState().statusMessage).toContain(translations.de.importOpmlFailed);
});
