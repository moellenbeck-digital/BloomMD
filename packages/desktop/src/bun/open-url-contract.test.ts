import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const source = () => readFile(join(import.meta.dir, "index.ts"), "utf8");

test("a link that launches the app is caught before startup awaits anything", async () => {
  const text = await source();
  const listener = text.indexOf('Electrobun.events.on("open-url"');
  const firstAwait = text.search(/^(?:const|let|if|await)[^\n]*\bawait\b/m);
  expect(listener).toBeGreaterThan(-1);
  expect(firstAwait).toBeGreaterThan(-1);
  // Electrobun does not buffer the event: a listener registered after an await misses cold-start links.
  expect(listener).toBeLessThan(firstAwait);
  expect(text).toContain("for (const url of earlyOpenUrls.splice(0)) handleOpenUrl(url);");
});

test("cold-start links and handoffs open on the awaited startup path, before the workspace is restored", async () => {
  const text = await source();
  // Links and handoffs during startup are only recorded.
  expect(text).toContain("startupTargets.offer({ path: target.path, nodeId: target.nodeId })");
  expect(text).toContain("if (!startupTargets.offer({ path: target, nodeId })) void openExternalTarget(target, nodeId);");
  const loadSettings = text.indexOf("const settings = await loadSettings();");
  const drain = text.indexOf("await startupTargets.drain(openStartupTarget, cliTarget");
  const restoreFolder = text.indexOf("desktopSettings.localDir) {", loadSettings);
  const reconnect = text.indexOf("Auto-reconnected to remote profile", loadSettings);
  const settle = text.indexOf("await startupTargets.settle(openStartupTarget);");
  const window = text.indexOf("mainWindow = new BrowserWindow(");
  expect(loadSettings).toBeGreaterThan(-1);
  expect(loadSettings).toBeLessThan(drain);
  expect(drain).toBeLessThan(restoreFolder);
  expect(drain).toBeLessThan(reconnect);
  expect(reconnect).toBeLessThan(settle);
  expect(settle).toBeLessThan(window);
});

test("externalFileOpened is only sent once the renderer listens; before that it takes the pending file", async () => {
  const text = await source();
  const send = text.indexOf("mainRPC.send.externalFileOpened(");
  const guard = text.lastIndexOf("if (rendererReady) {", send);
  expect(guard).toBeGreaterThan(-1);
  expect(send - guard).toBeLessThan(400);
  expect(text).toMatch(/consumeExternalFile: async \(\) => \{[\s\S]{0,200}rendererReady = true;/);
});
