import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import React, { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { AboutDialog, type AboutBuildInfo } from "./AboutDialog";

const buildInfo: AboutBuildInfo = {
  product: "BloomMD",
  package: "@bloommd/desktop",
  deployment: "desktop",
  version: "0.2.0",
  sha: "1234567890abcdef",
  shortSha: "1234567",
  tag: "v0.2.0",
  buildTime: "2026-08-23T10:00:00.000Z",
  channel: "stable",
  displayVersion: "BloomMD 0.2.0 (1234567)",
};

function installDom() {
  const win = new Window({ url: "https://bloommd.test/desktop" });
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.navigator = win.navigator as unknown as Navigator;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
  globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;
  globalThis.MouseEvent = win.MouseEvent as unknown as typeof MouseEvent;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
  globalThis.cancelAnimationFrame = () => undefined;
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="origin" onClick={() => setOpen(true)}>Open About</button>
      <AboutDialog open={open} onClose={() => setOpen(false)} buildInfo={buildInfo} />
    </>
  );
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for the dialog state to settle.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("AboutDialog accessibility", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    installDom();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root!.render(<Harness />));
  });

  afterEach(() => {
    root?.unmount();
    root = null;
    document.body.innerHTML = "";
  });

  test("traps focus and restores it after Escape", async () => {
    const origin = container.querySelector<HTMLElement>("[data-testid='origin']")!;
    origin.focus();
    origin.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    const dialog = container.querySelector<HTMLElement>("[role='dialog']")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("about-dialog-title");
    expect(container.querySelector("[data-testid='about-display-version']")?.textContent).toBe("BloomMD 0.2.0 (1234567)");

    const focusable = dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], summary, [tabindex]:not([tabindex='-1'])");
    const first = focusable.item(0);
    const last = focusable.item(focusable.length - 1);
    last.focus();
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await waitFor(
      () =>
        container.querySelector("[role='dialog']") === null &&
        document.activeElement === origin,
    );
  });

  test("uses web-specific content when rendered for the web app", async () => {
    flushSync(() => root!.render(<AboutDialog open onClose={() => undefined} buildInfo={buildInfo} platform="web" />));

    const dialog = container.querySelector<HTMLElement>("[data-testid='about-dialog']")!;
    expect(dialog.dataset.platform).toBe("web");
    expect(dialog.textContent).toContain("Next.js");
    expect(dialog.textContent).toContain("gehosteten Web-Anwendung");
    expect(dialog.textContent).not.toContain("Electrobun");
  });
  for (const path of ["patch", "full download"]) {
    test(`enables installation after the ${path} download completes`, () => {
      let installs = 0;
      flushSync(() => root!.render(<AboutDialog open onClose={() => undefined} buildInfo={buildInfo}
        update={{ currentVersion: "0.5.7", availableVersion: "0.5.8", updateAvailable: true,
          updateReady: true, status: "download-complete", message: `Update ready to install (used ${path} path)` }}
        onApplyUpdate={() => { installs += 1; }} />));
      const install = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Jetzt neu starten"))!;
      expect(install.disabled).toBe(false);
      expect(container.querySelector(".animate-spin")).toBeNull();
      install.click();
      expect(installs).toBe(1);
    });
  }

  for (const status of ["applying", "extracting", "replacing-app", "launching-new-version"]) {
    test(`blocks another installation while ${status}`, () => {
      let installs = 0;
      flushSync(() => root!.render(<AboutDialog open onClose={() => undefined} buildInfo={buildInfo}
        update={{ currentVersion: "0.5.7", availableVersion: "0.5.8", updateAvailable: true,
          updateReady: true, status }} onApplyUpdate={() => { installs += 1; }} />));
      const install = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Jetzt neu starten"))!;
      expect(install.disabled).toBe(true);
      expect(container.querySelector(".animate-spin")).not.toBeNull();
      install.click();
      expect(installs).toBe(0);
    });
  }

});
