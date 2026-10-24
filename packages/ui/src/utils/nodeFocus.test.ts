import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  focusNodeElement,
  isNodeVisibleInViewport,
  isCurrentNodeFocusRequest,
  requestNodeFocus,
} from "./nodeFocus";

const globals = globalThis as unknown as {
  window: Window;
  document: Document;
  HTMLElement: typeof HTMLElement;
};
let originalWindow: unknown;
let originalDocument: unknown;
let originalHTMLElement: unknown;
let frames: FrameRequestCallback[];

beforeEach(() => {
  originalWindow = globalThis.window;
  originalDocument = globalThis.document;
  originalHTMLElement = globalThis.HTMLElement;
  const win = new Window({ url: "https://bloommd.test/app" });
  frames = [];
  Object.defineProperty(win, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    },
  });
  Object.defineProperty(win, "cancelAnimationFrame", {
    configurable: true,
    value: () => undefined,
  });
  globals.window = win;
  globals.document = win.document as unknown as Document;
  globals.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
});

afterEach(() => {
  globalThis.window = originalWindow as typeof globalThis.window;
  globalThis.document = originalDocument as typeof globalThis.document;
  globalThis.HTMLElement = originalHTMLElement as typeof HTMLElement;
});

function addNode(nodeId: string, tabIndex: number): HTMLElement {
  const node = document.createElement("div");
  node.dataset.nodeId = nodeId;
  node.tabIndex = tabIndex;
  document.body.appendChild(node);
  return node;
}

function flushFrames(): void {
  const pending = frames.splice(0);
  pending.forEach((callback) => callback(0));
}

describe("node focus coordination", () => {
  test("only the latest request may focus and inactive nodes are deferred", () => {
    const first = addNode("first", 0);
    const second = addNode("second", -1);

    requestNodeFocus("first");
    requestNodeFocus("second");
    flushFrames();

    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement).not.toBe(second);
    expect(isCurrentNodeFocusRequest(1)).toBe(false);

    second.tabIndex = 0;
    // A new request represents the selection/layout transition that made the node active.
    requestNodeFocus("second");
    flushFrames();

    expect(document.activeElement).toBe(second);
  });

  test("focusNodeElement does not focus an unselected node", () => {
    const node = addNode("inactive", -1);

    expect(focusNodeElement("inactive")).toBe(false);
    expect(document.activeElement).not.toBe(node);
  });
});


test("visible navigation targets stay still across zoom and pan; clipped targets need revealing", () => {
  const node = { x: 100, y: 100, width: 180, height: 54 };
  const canvas = { width: 800, height: 600 };
  expect(isNodeVisibleInViewport(node, { x: 0, y: 0, zoom: 1 }, canvas)).toBe(true);
  expect(isNodeVisibleInViewport(node, { x: 100, y: 100, zoom: 2 }, canvas)).toBe(true);
  expect(isNodeVisibleInViewport(node, { x: -100, y: 0, zoom: 1 }, canvas)).toBe(false);
  expect(isNodeVisibleInViewport(node, { x: 600, y: 0, zoom: 1 }, canvas)).toBe(false);
  expect(isNodeVisibleInViewport(node, { x: 0, y: 500, zoom: 1 }, canvas)).toBe(false);
});

test("pointer selection requests focus without moving the viewport", () => {
  let reveal: boolean | undefined;
  window.addEventListener("bloommd:focus-node", (event: Event) => {
    reveal = (event as CustomEvent<{ reveal: boolean }>).detail.reveal;
  });
  const node = addNode("clicked", 0);
  requestNodeFocus("clicked", false);
  flushFrames();
  expect(reveal).toBe(false);
  expect(document.activeElement).toBe(node);
});
