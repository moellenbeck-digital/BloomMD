import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { parseFile } from "@bloommd/core/browser";
import type { LinkPreview, PlatformAdapter } from "../platform/platform-adapter";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

const DOM_GLOBALS = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "KeyboardEvent", "localStorage", "Event", "CustomEvent", "requestAnimationFrame"];
const globalsBefore = Object.fromEntries(DOM_GLOBALS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]));
const win = new Window({ url: "https://bloommd.test/app" });
globalThis.window = win as unknown as Window & typeof globalThis.window;
globalThis.document = win.document as unknown as Document;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.localStorage = win.localStorage as unknown as Storage;
globalThis.Event = win.Event as unknown as typeof Event;
globalThis.CustomEvent = win.CustomEvent as unknown as typeof CustomEvent;

// The rich-text editor is not what is tested here, and its bundle does not load outside a browser.
mock.module("@mdxeditor/editor", () => {
  const plugin = () => ({});
  const nothing = () => null;
  return {
    MDXEditor: nothing,
    headingsPlugin: plugin,
    listsPlugin: plugin,
    quotePlugin: plugin,
    thematicBreakPlugin: plugin,
    markdownShortcutPlugin: plugin,
    tablePlugin: plugin,
    codeBlockPlugin: plugin,
    codeMirrorPlugin: plugin,
    imagePlugin: plugin,
    linkPlugin: plugin,
    linkDialogPlugin: plugin,
    toolbarPlugin: plugin,
    BoldItalicUnderlineToggles: nothing,
    ListsToggle: nothing,
    BlockTypeSelect: nothing,
    CreateLink: nothing,
    InsertTable: nothing,
    InsertCodeBlock: nothing,
    InsertImage: nothing,
    useCodeBlockEditorContext: () => ({ setCode: () => {} }),
  };
});

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../i18n/LocaleContext");
const { PlatformProvider } = await import("../platform/PlatformContext");
const { useMindMapStore } = await import("../hooks/useMindMapStore");
const { NodeEditor } = await import("./NodeEditor");

const IMAGE = "https://cdn.example.net/img/card.png";
const PAGE = "https://www.example.com/articles/42?ref=a";

const mapWith = (meta: Record<string, string>) =>
  ["# Review", "", `## Quelle <!-- bloommd:id=quelle --> <!-- bloommd:meta=${JSON.stringify({ kind: "web", ...meta })} -->`, "", "Text.", ""].join("\n");

describe("node panel: privacy-aware website preview", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let previewCalls: string[];
  let nextPreview: () => Promise<LinkPreview>;

  const adapter = {
    files: { list: async () => [], read: async () => { throw new Error("not used"); } },
    api: {
      linkPreview: async (url: string) => {
        previewCalls.push(url);
        return nextPreview();
      },
    },
  } as unknown as PlatformAdapter;

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    previewCalls = [];
    nextPreview = async () => ({ url: PAGE, finalUrl: PAGE });
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    useMindMapStore.getState().setDocument(null);
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function open(meta: Record<string, string>) {
    const doc = parseFile("review.md", mapWith(meta));
    useMindMapStore.getState().setDocument(doc);
    useMindMapStore.getState().setSelectedNodeId([...doc.nodes.values()].find((node) => node.title === "Quelle")!.id);
    await mount();
  }

  async function mount() {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale="de">
          <PlatformProvider adapter={adapter}>
            <NodeEditor />
          </PlatformProvider>
        </LocaleProvider>,
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }

  async function remount() {
    act(() => root?.unmount());
    root = null;
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    await mount();
  }

  const query = <T extends HTMLElement>(testId: string) => container.querySelector<T>(`[data-testid='${testId}']`);
  const loadButton = () => container.querySelector<HTMLButtonElement>("[data-testid='node-url-panel'] button")!;
  const selectedId = () => useMindMapStore.getState().selectedNodeId!;
  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

  async function typeUrl(value: string) {
    const input = query<HTMLInputElement>("node-url-input")!;
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
  }

  async function clickLoad() {
    await act(async () => { loadButton().click(); });
    await flush();
  }

  test("@t91 the disclosure names the full URL and host, follows the field, and is absent without a URL", async () => {
    await open({});
    expect(query("node-preview-disclosure")).toBeNull();
    expect(loadButton().disabled).toBe(true);

    await typeUrl(PAGE);
    const text = query("node-preview-disclosure")!.textContent ?? "";
    expect(text).toContain(PAGE);
    expect(text).toContain("Host: example.com");
    expect(text).toContain("nur diese URL");
    expect(text).toContain("Inhalte, Dateinamen und Ordnernamen deiner Maps werden nicht gesendet");
    expect(text).toContain("Das Vorschaubild lädt dein Browser vom Host der Seite");
    expect(loadButton().disabled).toBe(false);

    await typeUrl("https://docs.other.org/guide");
    const updated = query("node-preview-disclosure")!.textContent ?? "";
    expect(updated).toContain("https://docs.other.org/guide");
    expect(updated).toContain("Host: docs.other.org");
    expect(updated).not.toContain("example.com");

    await typeUrl("");
    expect(query("node-preview-disclosure")).toBeNull();
    expect(loadButton().disabled).toBe(true);
    expect(previewCalls).toEqual([]);
  });

  test("@t91 render, URL input, blur and a change of the node kind never request a preview", async () => {
    await open({ url: PAGE });
    await typeUrl("https://docs.other.org/guide");
    await act(async () => { query<HTMLInputElement>("node-url-input")!.dispatchEvent(new win.Event("focusout", { bubbles: true })); });
    const select = query<HTMLSelectElement>("node-kind-select")!;
    const setter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(select, "source");
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
    });
    await flush();
    expect(query<HTMLSelectElement>("node-kind-select")!.value).toBe("source");
    expect(query("node-url-panel")).not.toBeNull();
    expect(previewCalls).toEqual([]);
  });

  test("@t91 one click sends one request with the URL only; there is no modal or second click", async () => {
    await open({ url: PAGE });
    nextPreview = async () => ({ url: PAGE, finalUrl: PAGE, title: "Artikel" });
    await clickLoad();
    expect(previewCalls).toEqual([PAGE]);
    expect(container.textContent).toContain("Artikel");
    expect(useMindMapStore.getState().document!.nodes.get(selectedId())?.metadata?.previewTitle).toBe("Artikel");
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(query("node-preview-empty")).toBeNull();
  });

  test("@t91 an answer without title, description and image shows 'Keine Metadaten gefunden'", async () => {
    await open({ url: PAGE });
    await clickLoad();
    expect(query("node-preview-empty")?.textContent).toBe("Keine Metadaten gefunden");
    expect(query("node-preview-error")).toBeNull();
  });

  test("@t91 an error keeps its message, and the next attempt clears the old error and the old empty hint", async () => {
    await open({ url: PAGE });
    const before = JSON.stringify(useMindMapStore.getState().document!.nodes.get(selectedId())?.metadata);
    nextPreview = async () => { throw new Error("The URL did not return an HTML page."); };
    await clickLoad();
    expect(query("node-preview-error")?.textContent).toBe("The URL did not return an HTML page.");
    expect(JSON.stringify(useMindMapStore.getState().document!.nodes.get(selectedId())?.metadata)).toBe(before);
    expect(query("node-preview-empty")).toBeNull();

    nextPreview = async () => ({ url: PAGE, finalUrl: PAGE });
    await clickLoad();
    expect(query("node-preview-error")).toBeNull();
    expect(query("node-preview-empty")).not.toBeNull();

    nextPreview = async () => { throw new Error("Website returned HTTP 500."); };
    await clickLoad();
    expect(query("node-preview-empty")).toBeNull();
    expect(query("node-preview-error")?.textContent).toBe("Website returned HTTP 500.");

    nextPreview = async () => ({ url: PAGE, finalUrl: PAGE, title: "Artikel" });
    await clickLoad();
    expect(query("node-preview-error")).toBeNull();
    expect(query("node-preview-empty")).toBeNull();
  });

  test("@t91 the image shows right after the user's own fetch, without referrer; a later render needs a click", async () => {
    await open({ url: PAGE });
    nextPreview = async () => ({ url: PAGE, finalUrl: PAGE, title: "Artikel", description: "Kurz", image: IMAGE });
    await clickLoad();
    const fresh = query<HTMLImageElement>("node-preview-image")!;
    expect(fresh.getAttribute("src")).toBe(IMAGE);
    expect(fresh.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(query("node-preview-image-request")).toBeNull();
    expect(container.textContent).toContain("Artikel");
    expect(container.textContent).toContain("Kurz");

    // Reopening the map: the stored image is still there, but nothing contacts its host by itself.
    await remount();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    const request = query<HTMLButtonElement>("node-preview-image-request")!;
    expect(request.textContent).toBe("Vorschaubild von cdn.example.net laden");
    expect(container.textContent).toContain("Artikel");
    expect(container.textContent).toContain("Kurz");
    expect(previewCalls).toEqual([PAGE]);

    await act(async () => { request.click(); });
    const loaded = query<HTMLImageElement>("node-preview-image")!;
    expect(loaded.getAttribute("src")).toBe(IMAGE);
    expect(loaded.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(query("node-preview-image-request")).toBeNull();
  });

  test("@t91 a stored preview shows its text without any request and without loading the image", async () => {
    await open({ url: PAGE, previewTitle: "Gespeichert", previewDescription: "Beschreibung", previewImage: IMAGE });
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.textContent).toContain("Gespeichert");
    expect(container.textContent).toContain("Beschreibung");
    expect(query("node-preview-image-request")).not.toBeNull();
    expect(previewCalls).toEqual([]);
  });
});

afterAll(() => {
  for (const key of DOM_GLOBALS) {
    const value = globalsBefore[key];
    if (value === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = value;
  }
});
