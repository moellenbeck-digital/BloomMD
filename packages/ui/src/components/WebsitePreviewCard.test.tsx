import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { parseFile } from "@bloommd/core/browser";

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

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../i18n/LocaleContext");
const { useMindMapStore } = await import("../hooks/useMindMapStore");
const { WebsitePreviewCard } = await import("./WebsitePreviewCard");

const IMAGE = "https://cdn.example.net/img/card.png";
const META = { kind: "web", url: "https://www.example.com/page", previewTitle: "Artikel", previewDescription: "Kurz", previewImage: IMAGE };
const MAP = ["# Review", "", `## Quelle <!-- bloommd:id=quelle --> <!-- bloommd:meta=${JSON.stringify(META)} -->`, "", "Text.", ""].join("\n");

describe("presentation view: website preview card", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  const originalFetch = globalThis.fetch;
  let networkCalls: string[];

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    networkCalls = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      networkCalls.push(String(input));
      throw new Error("no network in this test");
    }) as unknown as typeof fetch;
    const doc = parseFile("review.md", MAP);
    useMindMapStore.getState().setDocument(doc);
    useMindMapStore.getState().setSelectedNodeId([...doc.nodes.values()].find((node) => node.title === "Quelle")!.id);
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

  async function open() {
    const doc = useMindMapStore.getState().document!;
    const node = [...doc.nodes.values()].find((entry) => entry.title === "Quelle")!;
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale="de">
          <WebsitePreviewCard node={node} />
        </LocaleProvider>,
      );
    });
  }

  const query = <T extends HTMLElement>(testId: string) => container.querySelector<T>(`[data-testid='${testId}']`);

  test("@t91 opening the view shows title and description but loads no remote image", async () => {
    await open();
    const card = query("presentation-website-preview")!;
    expect(card.textContent).toContain("Artikel");
    expect(card.textContent).toContain("Kurz");
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(query("node-preview-image-request")?.textContent).toBe("Vorschaubild von cdn.example.net laden");
    expect(networkCalls).toEqual([]);
  });

  test("@t91 the button loads the image without referrer", async () => {
    await open();
    await act(async () => { query<HTMLButtonElement>("node-preview-image-request")!.click(); });
    const image = query<HTMLImageElement>("node-preview-image")!;
    expect(image.getAttribute("src")).toBe(IMAGE);
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(query("node-preview-image-request")).toBeNull();
  });

  test("@t91 a fresh render asks again", async () => {
    await open();
    await act(async () => { query<HTMLButtonElement>("node-preview-image-request")!.click(); });
    act(() => root?.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await open();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(query("node-preview-image-request")).not.toBeNull();
  });
});

afterAll(() => {
  for (const key of DOM_GLOBALS) {
    if (globalsBefore[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = globalsBefore[key];
  }
});
