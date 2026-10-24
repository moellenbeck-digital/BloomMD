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

test("saving a workspace neither writes nor shows a success check", async () => {
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
