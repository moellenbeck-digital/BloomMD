import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import type { CustomTheme } from "../utils/theme-custom";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

// React DOM decides at import time whether the browser supports `input` events, so the DOM has to
// exist before react-dom is loaded; hence the dynamic imports below.
const win = new Window({ url: "https://bloommd.test/app" });
globalThis.window = win as unknown as Window & typeof globalThis.window;
globalThis.document = win.document as unknown as Document;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.HTMLInputElement = win.HTMLInputElement as unknown as typeof HTMLInputElement;
globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../i18n/LocaleContext");
const { ThemeCustomDialog } = await import("./ThemeCustomDialog");
const { validateCustomTheme } = await import("../utils/theme-custom");

describe("ThemeCustomDialog", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let saved: CustomTheme[];
  let closed: number;
  let resets: number;

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    saved = [];
    closed = 0;
    resets = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function open(current: CustomTheme | null = null) {
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale="de">
          <ThemeCustomDialog
            open
            current={current}
            base="light"
            onSave={(input) => {
              const result = validateCustomTheme(input);
              if (result.ok) saved.push(result.theme);
              return result;
            }}
            onReset={() => { resets += 1; }}
            onClose={() => { closed += 1; }}
          />
        </LocaleProvider>,
      );
    });
  }

  // The dialog renders into a portal on `document.body`, not into the container.
  const query = <T extends HTMLElement>(testId: string) => document.body.querySelector<T>(`[data-testid='${testId}']`);

  async function setValue(element: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
      for (const type of ["input", "keyup"]) element.dispatchEvent(new window.Event(type, { bubbles: true }) as unknown as Event);
    });
  }

  async function click(testId: string) {
    await act(async () => {
      query<HTMLButtonElement>(testId)!.click();
    });
  }

  test("renders nothing while closed", async () => {
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale="de">
          <ThemeCustomDialog open={false} current={null} base="light" onSave={validateCustomTheme} onReset={() => undefined} onClose={() => undefined} />
        </LocaleProvider>,
      );
    });
    expect(query("theme-custom-dialog")).toBeNull();
  });

  test("a preset fills the form and saves as that exact theme", async () => {
    await open();
    expect(query("theme-custom-dialog")).not.toBeNull();
    await click("theme-custom-preset-ocean");
    expect(query<HTMLInputElement>("theme-custom-accent")!.value).toBe("#0B5FA5");
    expect(query<HTMLInputElement>("theme-custom-name")!.value).toBe("Ocean");
    await click("theme-custom-save");
    expect(saved).toEqual([{ name: "Ocean", base: "light", accent: "#0B5FA5", surface: "#F4F8FB", ink: "#12202B" }]);
    expect(closed).toBe(1);
  });

  test("text with too little contrast is refused with a message and the dialog stays open", async () => {
    await open();
    await setValue(query<HTMLInputElement>("theme-custom-surface")!, "#FFFFFF");
    await setValue(query<HTMLInputElement>("theme-custom-ink")!, "#CCCCCC");
    await click("theme-custom-save");
    expect(saved).toEqual([]);
    expect(closed).toBe(0);
    const error = query("theme-custom-error");
    expect(error?.textContent).toContain("4,5:1");
    expect(query("theme-custom-ink")!.getAttribute("aria-invalid")).toBe("true");
  });

  test("a value that is not a hex colour is refused", async () => {
    await open();
    await setValue(query<HTMLInputElement>("theme-custom-accent")!, "blau");
    await click("theme-custom-save");
    expect(saved).toEqual([]);
    expect(query("theme-custom-accent")!.getAttribute("aria-invalid")).toBe("true");
    expect(query("theme-custom-error")?.textContent).toContain("Hex");
  });

  test("shows the measured contrast of text and accent while editing", async () => {
    await open();
    await setValue(query<HTMLInputElement>("theme-custom-ink")!, "#CCCCCC");
    await setValue(query<HTMLInputElement>("theme-custom-surface")!, "#FFFFFF");
    const items = Array.from(query("theme-custom-contrast")!.querySelectorAll("li"));
    expect(items[0]?.getAttribute("data-ok")).toBe("false");
    expect(items[0]?.textContent).toContain("✗");
  });

  test("reset hands control back to the standard theme and closes", async () => {
    await open();
    await click("theme-custom-reset");
    expect(resets).toBe(1);
    expect(closed).toBe(1);
  });

  test("Escape closes without saving", async () => {
    await open();
    await act(async () => {
      query("theme-custom-dialog")!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event);
    });
    expect(closed).toBe(1);
    expect(saved).toEqual([]);
  });
});
