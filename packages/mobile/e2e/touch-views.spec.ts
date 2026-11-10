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

// Known deviation, see docs/MOBILE-MATRIX.md (Abweichung 10): the close button of the editor sheet is
// `absolute` without a z-index, so the editor header after it in the DOM covers it. The size scan
// skips covered elements on purpose, so only this check can see it. Remove `fixme` with the fix.
test.fixme("the close button of the editor sheet takes the tap", async ({ page }) => {
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
