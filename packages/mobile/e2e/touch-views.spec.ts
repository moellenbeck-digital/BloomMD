import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, MIN_TARGET, smallTargets } from "./touch-helpers";

/**
 * Touch views of the built mobile assets (#68): `packages/mobile/dist` in a browser with a device
 * profile (iPhone SE, iPad portrait, Pixel 5). Per device: no horizontal overflow, every operable
 * element at least 44 px, and the editor opens from the map. The app runs without Capacitor plugins:
 * the folder picker, keychain and share sheet are not there, notes live in the browser's storage
 * (the app's own folder), so the demo note comes in through "Import". What this cannot show is
 * listed in the job summary (summary.mjs) and in docs/MOBILE-MATRIX.md.
 * Run it with `bun run test:touch` in packages/mobile.
 */

const DEMO_NOTE = `# Reise nach Lissabon

## Anreise

Flug am Morgen, Gepäck nur als Handgepäck.

### Flug

Abflug 07:40.

### Transfer

Metro Linie Rot, 20 Minuten.

## Unterkunft

Kleines Hotel in Alfama.

## Essen

Pastel de nata am ersten Tag.
`;

/** One line per measured state, for the job summary (summary.mjs reads the file). */
const ROWS = new URL("../test-results/summary-rows.jsonl", import.meta.url);

async function openDemoMap(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", "de");
  });
  await page.goto("/");
  await expect(page.getByTestId("mobile-files-toggle")).toBeVisible();
  // No map yet: the empty state of a fresh install, measured as the first view.
  await expect(page.getByRole("heading", { name: "Keine Mindmap geöffnet" })).toBeVisible();
  await expectTargetsAndFit(page, "start (no map open)", 2);

  await page.locator('input[type="file"]').setInputFiles({ name: "Lissabon.md", mimeType: "text/markdown", buffer: Buffer.from(DEMO_NOTE) });
  await expect(page.locator("#mindmap-canvas, .react-flow").first()).toBeVisible();
  await expect(page.getByTestId("mindmap-node").first()).toBeVisible();
  await fitView(page);
}

async function fitView(page: Page) {
  await page.locator(".react-flow__controls-fitview").tap();
  // fitView animates; wait for the viewport to stop moving.
  let previous = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await page.locator(".react-flow__viewport").evaluate((element) => (element as HTMLElement).style.transform);
    if (current === previous) return;
    previous = current;
    await page.waitForTimeout(120);
  }
}

/**
 * Measures the current view: sizes and overflow are soft assertions, so one run reports every
 * state that fails. A failing state also gets its own screenshot, which the workflow uploads.
 * `minScanned` guards against a scan that measures nothing and passes for the wrong reason.
 */
async function expectTargetsAndFit(page: Page, state: string, minScanned = 4) {
  const info = test.info();
  const { small, scanned } = await smallTargets(page);
  const overflow = await horizontalOverflow(page);
  const failed = small.length > 0 || overflow > 1 || scanned < minScanned;
  appendFileSync(ROWS, `${JSON.stringify({ device: info.project.name, state, scanned, small: small.length, overflow, ok: !failed })}\n`);
  if (failed) {
    // A file in the output folder, so it ends up in the artifact (a body attachment only lives in the report).
    const path = info.outputPath(`${state.replace(/[^a-z0-9]+/gi, "-")}.png`);
    await page.screenshot({ path });
    await info.attach(`${info.project.name} - ${state}`, { path, contentType: "image/png" });
  }
  expect.soft(scanned, `${state}: operable elements measured`).toBeGreaterThanOrEqual(minScanned);
  expect.soft(small, `${state}: operable elements under ${MIN_TARGET} px`).toEqual([]);
  expect.soft(overflow, `${state}: horizontal overflow`).toBeLessThanOrEqual(1);
}

test("map, node, editor and file drawer on the built assets", async ({ page }) => {
  await openDemoMap(page);
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the device profile must report a coarse pointer").toBe(true);
  await expectTargetsAndFit(page, "map");

  const root = page.getByTestId("mindmap-node").first();
  const box = (await root.boundingBox())!;
  await root.tap({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByTestId("node-action-toolbar")).toBeVisible();
  await expectTargetsAndFit(page, "node selected (action bar)");

  // The editor is a lazily loaded chunk: it has to come from the build, not from the dev server.
  await page.getByTestId("node-action-open-editor").tap();
  const sheet = page.getByTestId("mobile-node-editor");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("node-metadata-editor")).toBeVisible();
  const field = sheet.locator('[data-testid="node-content-panel"] [contenteditable="true"]').first();
  await field.scrollIntoViewIfNeeded();
  await expect(field, "the editor's text field is on screen").toBeInViewport();
  await field.tap();
  await expect(field, "a tap puts the cursor in the editor's text field").toBeFocused();
  await expectTargetsAndFit(page, "node editor");

  await page.getByTestId("mobile-files-toggle").tap();
  await expect(page.getByTestId("mobile-note-list")).toBeVisible();
  await expect(page.getByTestId("mobile-note-row")).toHaveCount(1);
  await expectTargetsAndFit(page, "file drawer");
});

// Regression: the editor header must not cover its close button.
test("the close button of the editor sheet takes the tap", async ({ page }) => {
  await openDemoMap(page);
  const root = page.getByTestId("mindmap-node").first();
  const box = (await root.boundingBox())!;
  await root.tap({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.getByTestId("node-action-open-editor").tap();
  await expect(page.getByTestId("node-metadata-editor")).toBeVisible();
  const close = page.getByRole("button", { name: "Editor schließen" });
  const reachable = await close.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  });
  expect(reachable, "the element at the centre of the close button is the button").toBe(true);
  await close.tap();
  await expect(page.getByTestId("mobile-node-editor")).toBeHidden();
});

test("folder preview opens the exact section, saves it and returns; new files use the selected folder", async ({ page }) => {
  await openDemoMap(page);
  await page.getByTestId("mobile-overview").tap();
  const file = page.locator('[data-workspace-kind="file"]');
  await expect(file).toBeVisible();
  await fitView(page);
  await page.screenshot({ path: test.info().outputPath("folder-overview.png") });
  await file.getByTestId("node-toggle-children").tap();
  await fitView(page);
  await expectTargetsAndFit(page, "folder overview");
  const heading = page.locator('[data-workspace-kind="heading"]').filter({ hasText: "Unterkunft" }).first();
  await heading.tap();
  await page.getByTestId("node-action-open-source").tap();
  const sheet = page.getByTestId("mobile-node-editor");
  await expect(sheet).toBeVisible();
  const field = sheet.locator('[data-testid="node-content-panel"] [contenteditable="true"]').first();
  await expect(field).toContainText("Kleines Hotel in Alfama");
  await page.screenshot({ path: test.info().outputPath("source-editor.png") });
  await field.fill("Hotel geändert auf dem Telefon.");
  // Navigate immediately: the active note must flush before the read-only overview replaces it.
  await page.getByTestId("mobile-overview").tap();
  await expect(sheet).toBeHidden();
  await page.locator('[data-workspace-kind="file"]').tap();
  await page.getByTestId("node-action-open-source").tap();
  await expect(page.locator('[data-workspace-kind="file"]')).toHaveCount(0);
  await page.getByTestId("mobile-overview").tap();
  await page.locator('[data-workspace-kind="heading"]').filter({ hasText: "Unterkunft" }).first().tap();
  await page.getByTestId("node-action-open-source").tap();
  await expect(field).toContainText("Hotel geändert auf dem Telefon.");
  await page.getByTestId("mobile-overview").tap();
  await page.getByTestId("mobile-files-toggle").tap();
  await page.getByTestId("mobile-new-folder").tap();
  await page.getByTestId("create-entry-name").fill("Team");
  await page.getByTestId("create-entry-submit").tap();
  await expect(page.getByTestId("create-entry-dialog")).toBeHidden();
  const folder = page.locator('[data-workspace-kind="folder"][data-node-label="Team"]');
  await expect(folder, "an empty physical folder is visible").toBeVisible();
  await fitView(page);
  await folder.tap();
  await page.getByTestId("node-action-toolbar").getByRole("button", { name: "Neue Datei" }).tap();
  await expect(page.getByTestId("create-entry-parent")).toHaveValue("Team");
  await page.getByTestId("create-entry-name").fill("Mobil erstellt");
  await page.getByTestId("create-entry-submit").tap();
  await expect(page.getByTestId("create-entry-dialog")).toBeHidden();
  await page.getByTestId("mobile-overview").tap();
  await expect(page.locator('[data-workspace-kind="file"]')).toHaveCount(2);
  await expect(page.locator('[data-workspace-kind="file"]').filter({ hasText: "Mobil erstellt" })).toBeVisible();
});
