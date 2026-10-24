import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ABOUT_SOURCE = join(ROOT, "..", "..", "ui", "src", "components", "AboutDialog.tsx");
const APP_SOURCE = join(ROOT, "mainview", "App.tsx");
const RPC_SOURCE = join(ROOT, "mainview", "rpc.ts");

function compact(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("About dialog contract", () => {
  test("keeps the dialog semantically accessible and keyboard operable", async () => {
    const source = compact(await readFile(ABOUT_SOURCE, "utf8"));

    for (const contract of [
      'role="dialog"',
      'aria-modal="true"',
      'aria-labelledby="about-dialog-title"',
      'aria-describedby="about-dialog-description"',
      'tabIndex={-1}',
      'event.key === "Escape"',
      'event.key !== "Tab"',
      "previousActiveElementRef",
      "document.body.style.overflow",
      "focus-visible:ring-2",
    ]) {
      expect(source).toContain(contract);
    }
  });

  test("contains the product, beta, legal and build-information surfaces", async () => {
    const source = await readFile(ABOUT_SOURCE, "utf8");

    for (const testId of [
      "about-dialog",
      "about-display-version",
      "about-technologies",
      "about-beta-status",
      "about-build-details",
      "about-legal",
    ]) {
      expect(source).toContain(`data-testid="${testId}"`);
    }
    for (const path of ["/impressum", "/datenschutz", "/lizenz", "/docs"]) {
      expect(source).toContain(`localizedMarketingUrl("${path}")`);
    }
    expect(source).toContain("Electrobun · nativer macOS-Rahmen und RPC");
    expect(source).toContain("Electrobun · native macOS shell and RPC");
    expect(source).toContain("t.aboutTagline");
  });

  test("wires both About entry points to the desktop renderer", async () => {
    const app = compact(await readFile(APP_SOURCE, "utf8"));
    const rpc = compact(await readFile(RPC_SOURCE, "utf8"));

    expect(app).toContain("onOpenAbout={() => setAboutOpen(true)}");
    expect(app).toContain("<AboutDialog");
    expect(app).toContain("getBuildInfo()");
    expect(app).toContain("onAboutRequested(() => setAboutOpen(true))");
    expect(app).toContain("onCheckForUpdate={() =>");
    expect(app).toContain("onDownloadUpdate={() =>");
    expect(app).toContain("onApplyUpdate={() =>");
    expect(app).toContain("checkForUpdate().then(setUpdateState)");
    expect(rpc).toContain("aboutRequested: () =>");
    expect(rpc).toContain("getBuildInfo({})");
    expect(rpc).toContain("getUpdateState({})");
    expect(rpc).toContain("checkForUpdate({})");
    expect(rpc).toContain("downloadUpdate({})");
    expect(rpc).toContain("applyUpdate({})");
  });
});
