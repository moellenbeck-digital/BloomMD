/**
 * Ticket 140 (@t140): Handschrift-Editor eines Knotens, „Done“ direkt nach dem Strich.
 *
 * Die Handschrift gibt es nur in der iPad-App und im Obsidian-Plugin (Anbieter von `InkAttachmentsContext`),
 * nicht in der Web-App; Playwright (apps/app/e2e) kann sie nicht erreichen. Deshalb prüfen diese Fälle
 * die echte Komponente `NodeHandwriting` samt `InkEditor` und Vorschau in einer DOM-Umgebung.
 * Nicht prüfbar: ein Abbrechen-Knopf (die Oberfläche hat keinen; geschlossen wird nur über „Done“).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LocaleProvider } from "../i18n/LocaleContext";
import { InkAttachmentsContext, type InkAttachments } from "../ink/attachments";
import { NodeHandwriting } from "./NodeHandwriting";
import { installDom, waitFor } from "./test-dom";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe("Handschrift: Done speichert den sichtbaren Zeichenstand", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let writes: string[];

  const attachments: InkAttachments = {
    read: async () => { throw new Error("nicht benötigt"); },
    write: async (name, svg) => {
      writes.push(svg);
      return name ?? "Zeichnung ink.svg";
    },
  };

  beforeAll(() => {
    installDom();
    const prototype = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    prototype.setPointerCapture ??= () => undefined;
    prototype.releasePointerCapture ??= () => undefined;
  });

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    writes = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(LocaleProvider, { initialLocale: "en" },
      createElement(InkAttachmentsContext.Provider, { value: attachments },
        createElement(NodeHandwriting, { nodeId: "knoten", content: "", notePath: "karte.md", readOnly: false })))));
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  const open = () => act(() => (container.querySelector("[data-testid='node-handwriting-new']") as HTMLButtonElement).click());
  const surface = () => container.querySelector(".bloommd-ink-surface") as HTMLElement;
  const send = (type: string, x: number, y: number) => surface().dispatchEvent(
    new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "pen", clientX: x, clientY: y, button: 0, pressure: 0.5 }) as unknown as Event,
  );
  const stroke = (x: number) => act(() => { send("pointerdown", x, 10); send("pointermove", x + 30, 30); send("pointerup", x + 30, 30); });
  const done = () => (container.querySelector(".bloommd-ink-done") as HTMLButtonElement);
  const strokesIn = (svg: string) => (svg.match(/<path/g) ?? []).length;
  const previewStrokes = () => container.querySelectorAll("svg.bloommd-ink-preview path[data-stroke-id]").length;

  test("K1: ein Strich, sofort Done — gespeicherte SVG hat den Strich, Vorschau ist nicht leer @t140", async () => {
    open();
    stroke(10);
    act(() => done().click());
    await waitFor(() => writes.length === 1, "Speichern");
    expect(strokesIn(writes[0]!)).toBe(1);
    await waitFor(() => container.querySelector("[data-testid='node-handwriting-editor']") === null, "Editor geschlossen");
    expect(previewStrokes()).toBe(1);
  });

  test("K2: mehrere Striche, dann Done — alle Striche gespeichert und in der Vorschau @t140", async () => {
    open();
    stroke(10);
    stroke(60);
    stroke(110);
    act(() => done().click());
    await waitFor(() => writes.length === 1, "Speichern");
    expect(strokesIn(writes[0]!)).toBe(3);
    await waitFor(() => container.querySelector("[data-testid='node-handwriting-editor']") === null, "Editor geschlossen");
    expect(previewStrokes()).toBe(3);
  });
});
