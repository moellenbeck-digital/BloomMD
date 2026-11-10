import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { parseFile, type MindMapDocument, type MindMapListEntry } from "@bloommd/core/browser";
import type { PlatformAdapter, PlatformWriteResult } from "./platform-adapter";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

// React DOM reads the DOM at import time, so the globals are installed before the dynamic imports.
const DOM_GLOBALS = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "KeyboardEvent", "localStorage", "Event", "CustomEvent", "requestAnimationFrame"];
const globalsBefore = Object.fromEntries(DOM_GLOBALS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]));
const win = new Window({ url: "https://bloommd.test/app" });
globalThis.window = win as unknown as Window & typeof globalThis.window;
globalThis.document = win.document as unknown as Document;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.HTMLInputElement = win.HTMLInputElement as unknown as typeof HTMLInputElement;
globalThis.HTMLTextAreaElement = win.HTMLTextAreaElement as unknown as typeof HTMLTextAreaElement;
globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;
globalThis.localStorage = win.localStorage as unknown as Storage;
globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;

const React = await import("react");
const { act, createRef } = React;
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../i18n/LocaleContext");
const { useMindMapStore } = await import("../hooks/useMindMapStore");
const { PlatformProvider } = await import("./PlatformContext");
const { PlatformError } = await import("./platform-adapter");
const { FileBrowser } = await import("../components/FileBrowser");
const { CommandPalette } = await import("../components/CommandPalette");
const { Toolbar } = await import("../components/Toolbar");

type ToolbarHandle = import("../components/Toolbar").ToolbarHandle;

const ENTRIES: MindMapListEntry[] = [
  { filename: "alpha.md", frontmatter: { title: "Alpha", id: "a", created: "", updated: "" } },
  { filename: "beta.md", frontmatter: { title: "Beta", id: "b", created: "", updated: "" } },
];

/** An adapter that records every call and never touches `fetch`. */
function fakeAdapter() {
  const calls: string[] = [];
  const writes: Array<{ filename: string; markdown: string; version?: number }> = [];
  const adapter: PlatformAdapter = {
    files: {
      async list() {
        calls.push("list");
        return ENTRIES;
      },
      async read(filename) {
        calls.push(`read ${filename}`);
        return parseFile(filename, `# ${filename}\n`);
      },
      async create(filename) {
        calls.push(`create ${filename}`);
      },
      async write(filename, markdown, options): Promise<PlatformWriteResult> {
        calls.push(`write ${filename}`);
        writes.push({ filename, markdown, version: options?.storage?.version });
        return { storage: { mode: "database", documentId: "d", workspaceId: "w", version: 8 } };
      },
      async remove(filename) {
        calls.push(`remove ${filename}`);
      },
      async rename(filename, newFilename) {
        calls.push(`rename ${filename} ${newFilename}`);
        return { filename: newFilename };
      },
    },
    api: {
      async linkPreview() {
        throw new PlatformError("unsupported", "no preview");
      },
    },
  };
  return { adapter, calls, writes };
}

describe("components against the platform adapter contract", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  const originalFetch = globalThis.fetch;
  let globalFetchCalls = 0;

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    globalFetchCalls = 0;
    // A component that still reaches for the network would show up here.
    globalThis.fetch = (async () => {
      globalFetchCalls += 1;
      throw new Error("global fetch must not be used");
    }) as unknown as typeof fetch;
    win.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    globalThis.fetch = originalFetch;
    useMindMapStore.getState().setDocument(null);
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  afterAll(() => {
    for (const key of DOM_GLOBALS) {
      const before = globalsBefore[key];
      if (before === undefined) delete (globalThis as Record<string, unknown>)[key];
      else (globalThis as Record<string, unknown>)[key] = before;
    }
  });

  async function render(node: React.ReactNode, adapter: PlatformAdapter) {
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale="en">
          <PlatformProvider adapter={adapter}>{node}</PlatformProvider>
        </LocaleProvider>,
      );
    });
  }

  const click = async (element: Element | null | undefined) => {
    expect(element).toBeTruthy();
    await act(async () => {
      element!.dispatchEvent(new win.MouseEvent("click", { bubbles: true }) as unknown as Event);
    });
  };

  test("@t79 FileBrowser lists, opens and deletes through the adapter", async () => {
    const { adapter, calls } = fakeAdapter();
    let closed = 0;
    await render(<FileBrowser open onClose={() => { closed += 1; }} />, adapter);

    const items = [...container.querySelectorAll('[data-testid="file-drawer-item"]')];
    expect(items).toHaveLength(2);
    expect(calls).toContain("list");

    await click(container.querySelector('[data-testid="file-drawer-open-file"]'));
    await act(async () => {});
    expect(calls).toContain("read alpha.md");
    expect(useMindMapStore.getState().document?.filePath).toBe("alpha.md");
    expect(closed).toBe(1);
    expect(globalFetchCalls).toBe(0);
  });

  test("@t79 FileBrowser delete uses files.remove when the host passes no onDelete", async () => {
    const { adapter, calls } = fakeAdapter();
    await render(<FileBrowser open onClose={() => undefined} />, adapter);
    const item = container.querySelector('[data-testid="file-drawer-item"]');
    await act(async () => {
      item!.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, clientX: 5, clientY: 5 }) as unknown as Event);
    });
    await click(container.querySelector('[data-testid="file-context-delete"]'));
    await click(container.querySelector('[data-testid="file-context-confirm-delete"]'));
    await act(async () => {});
    expect(calls.some((call) => call.startsWith("remove "))).toBe(true);
    expect(globalFetchCalls).toBe(0);
  });

  test("@t79 CommandPalette lists maps through the adapter and opens one without onOpenMindmap", async () => {
    const { adapter, calls } = fakeAdapter();
    await render(
      <CommandPalette open onClose={() => undefined} onNew={() => undefined} onSave={() => undefined} onImport={() => undefined} onExport={() => undefined} onReload={() => undefined} />,
      adapter,
    );
    expect(calls).toContain("list");
    const input = container.querySelector("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "beta");
      input.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
    });
    await act(async () => {
      input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }) as unknown as Event);
    });
    await act(async () => {});
    expect(calls).toContain("read beta.md");
    expect(globalFetchCalls).toBe(0);
  });

  test("@t79 Toolbar save writes through the adapter with the stored version and takes the new storage metadata", async () => {
    const { adapter, writes } = fakeAdapter();
    const doc: MindMapDocument = {
      ...parseFile("plan.md", "# Plan\n"),
      storage: { mode: "database", documentId: "d", workspaceId: "w", version: 7 },
    };
    useMindMapStore.getState().setDocument(doc);
    const ref = createRef<ToolbarHandle>();
    await render(<Toolbar ref={ref} />, adapter);
    await act(async () => {
      await ref.current!.triggerSave();
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ filename: "plan.md", version: 7 });
    expect(writes[0]!.markdown).toContain("# Plan");
    expect(useMindMapStore.getState().document?.storage?.version).toBe(8);
    expect(globalFetchCalls).toBe(0);
  });
});
