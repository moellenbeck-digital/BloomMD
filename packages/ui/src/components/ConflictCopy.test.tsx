import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { LocaleProvider } from "../i18n/LocaleContext";
import type { Locale } from "../i18n/translations";
import { CommandPalette } from "./CommandPalette";
import { ConflictCopyBadge } from "./ConflictCopyBadge";
import { ConflictCopyBanner } from "./ConflictCopyBanner";
import { FileBrowser } from "./FileBrowser";
import { installDom, waitFor } from "./test-dom";

const frontmatter = (title: string) => ({ title, id: title.toLowerCase(), created: "2026-11-01T00:00:00Z", updated: "2026-11-01T00:00:00Z" });
const FILES = [
  { filename: "Physik.md", frontmatter: frontmatter("Physik") },
  { filename: "Physik (iPad-Konflikt).md", frontmatter: frontmatter("Physik") },
  { filename: "Schule/Chemie (Android-Konflikt 2).md", frontmatter: frontmatter("Chemie") },
  { filename: "Notizen.md", frontmatter: frontmatter("Notizen") },
];

describe("conflict copies in the interface", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  const originalFetch = globalThis.fetch;

  function render(node: React.ReactNode, locale: Locale = "de") {
    flushSync(() => root!.render(<LocaleProvider key={locale} initialLocale={locale}>{node}</LocaleProvider>));
  }

  beforeEach(() => {
    installDom();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    globalThis.fetch = (async () => new Response(JSON.stringify({ files: FILES }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
  });

  afterEach(() => {
    root?.unmount();
    root = null;
    document.body.innerHTML = "";
    globalThis.fetch = originalFetch;
  });

  test("the badge marks conflict copies with a tooltip, in German and English, and nothing else", () => {
    render(<ConflictCopyBadge filename="Physik (iPad-Konflikt 2).md" />);
    const german = container.querySelector<HTMLElement>("[data-testid='conflict-copy-badge']")!;
    expect(german.textContent).toBe("Konfliktkopie");
    expect(german.getAttribute("title")).toContain("auf zwei Geräten gleichzeitig geändert");

    render(<ConflictCopyBadge filename="Physik (Android-Konflikt).md" />, "en");
    const english = container.querySelector<HTMLElement>("[data-testid='conflict-copy-badge']")!;
    expect(english.textContent).toBe("Conflict copy");
    expect(english.getAttribute("title")).toContain("changed on two devices at the same time");

    render(<ConflictCopyBadge filename="Physik.md" />);
    expect(container.querySelector("[data-testid='conflict-copy-badge']")).toBeNull();
  });

  test("the banner names the original and opens it", () => {
    const opened: string[] = [];
    render(<ConflictCopyBanner filename="Schule/Physik (iPad-Konflikt).md" originalFilename="Schule/Physik.md" onOpenOriginal={(name) => opened.push(name)} />);

    const banner = container.querySelector<HTMLElement>("[data-testid='conflict-copy-banner']")!;
    expect(banner.textContent).toContain("Das ist eine Konfliktkopie");
    expect(container.querySelector("[data-testid='conflict-copy-original']")!.textContent).toBe("Original: Schule/Physik.md");
    container.querySelector<HTMLButtonElement>("[data-testid='conflict-copy-open-original']")!.click();
    expect(opened).toEqual(["Schule/Physik.md"]);
  });

  test("the banner says so when the original is gone, and offers no link", () => {
    render(<ConflictCopyBanner filename="Schule/Physik (iPad-Konflikt).md" originalFilename={null} onOpenOriginal={() => undefined} />, "en");

    expect(container.querySelector("[data-testid='conflict-copy-original']")!.textContent).toBe("The original note “Schule/Physik.md” no longer exists.");
    expect(container.querySelector("[data-testid='conflict-copy-open-original']")).toBeNull();
  });

  test("no banner on a normal note", () => {
    render(<ConflictCopyBanner filename="Physik.md" originalFilename={null} />);

    expect(container.querySelector("[data-testid='conflict-copy-banner']")).toBeNull();
  });

  test("the file browser marks exactly the conflict copies", async () => {
    render(<FileBrowser open onClose={() => undefined} />);
    await waitFor(() => container.querySelectorAll("[data-testid='file-drawer-item']").length === FILES.length, "the file list");

    const badged = [...container.querySelectorAll<HTMLElement>("[data-testid='file-drawer-item']")]
      .filter((item) => item.querySelector("[data-testid='conflict-copy-badge']"))
      .map((item) => item.getAttribute("data-filename"));
    expect(badged.sort()).toEqual(["Physik (iPad-Konflikt).md", "Schule/Chemie (Android-Konflikt 2).md"]);
  });

  test("the command palette marks conflict copies in its note list", async () => {
    render(<CommandPalette open onClose={() => undefined} onNew={() => undefined} onSave={() => undefined} onImport={() => undefined} onExport={() => undefined} onReload={() => undefined} />);
    await waitFor(() => container.querySelectorAll("[data-testid='command-palette-item-mindmap']").length === FILES.length, "the note list");

    const badged = [...container.querySelectorAll<HTMLElement>("[data-testid='command-palette-item-mindmap']")]
      .filter((item) => item.querySelector("[data-testid='conflict-copy-badge']"))
      .map((item) => item.getAttribute("data-command-id"));
    expect(badged.sort()).toEqual(["mindmap-Physik (iPad-Konflikt).md", "mindmap-Schule/Chemie (Android-Konflikt 2).md"]);
  });
});
