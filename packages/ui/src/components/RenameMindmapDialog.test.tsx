import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { LocaleProvider } from "../i18n/LocaleContext";
import { RenameMindmapDialog } from "./RenameMindmapDialog";

function installDom() {
  const win = new Window({ url: "https://bloommd.test/app" });
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.navigator = win.navigator as unknown as Navigator;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
  globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;
}

describe("RenameMindmapDialog", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    installDom();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root?.unmount();
    root = null;
    document.body.innerHTML = "";
  });

  test("explains the coupled title and filename change", () => {
    flushSync(() => root!.render(
      <LocaleProvider initialLocale="de">
        <RenameMindmapDialog
          open
          filename="Buch/Teil-2/Kapitel 3.md"
          title="Kapitel 3"
          onSubmit={async () => true}
          onClose={() => undefined}
        />
      </LocaleProvider>,
    ));

    const dialog = container.querySelector<HTMLElement>("[data-testid='rename-mindmap-dialog']")!;
    expect(dialog.textContent).toContain("Titel und Dateiname werden gemeinsam geändert.");
    expect(dialog.textContent).toContain("Buch/Teil-2/Kapitel 3.md");
    expect(dialog.textContent).toContain("Buch/Teil-2/kapitel-3.md");
    expect(container.querySelector<HTMLInputElement>("[data-testid='rename-mindmap-input']")?.value).toBe("Kapitel 3");
  });
});
