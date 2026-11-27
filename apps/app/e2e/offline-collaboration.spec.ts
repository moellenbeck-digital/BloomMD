import { test } from "@playwright/test";
import {
  addChild, conflictCopy, countOf, expectQueued, exportMarkdown, exportedHeadings, expect, fingerprint, finish, labels, node, openClient,
  openDocument, readHistory, readLocalSnapshots, rename, restoreAllVersions, restoreVersion, serverTitles, startRun, unique, waitForEmptyRoom,
  type Run,
} from "./offline-helpers";

// @t261 — W1: two clients edit the same Markdown file separately offline, reconnect, and nothing is
// lost. A real content conflict becomes visible and is resolved by rule A (the server room leads,
// the state that reached the server last stays in the node, the other one becomes a
// "Konflikt: …" sibling with device and time). Reset procedure: docs/offline-konflikt.md.
//
// Two modes, one spec:
// - local (`playwright.offline.config.ts`, project `chromium-offline`): own sync server and workspace
//   folder; the pre-merge snapshots are read from that folder.
// - test system (`playwright.testsystem.config.ts`): an already running system, nothing on its disk is
//   reachable. The test creates its starting files itself (unique names per run) and checks content,
//   comparison file, export and restore only through the UI and the app API (version history).
// In both modes both clients use the same account, so they share the cloud document there.

test("@t261 two clients edit offline, conflict is visible and resolvable, nothing is lost", async ({ browser }, testInfo) => {
  let run: Run | undefined;
  try {
    const started = await startRun(browser, testInfo);
    run = started.run;
    const { a, b } = started;
    const compareBefore = await fingerprint(run, run.compareFile);

    // Starting point: both see Alpha, Beta, Gamma (openDocument checked it). The stored file has them, too.
    expect(await serverTitles(run)).toEqual([run.rootTitle, "Alpha", "Beta", "Gamma"].sort());

    // Both lose the connection and edit separately.
    await a.goOffline();
    await b.goOffline();
    await rename(a.page, "Alpha", "Alpha-A");
    await addChild(a.page, run.rootTitle, "Delta");
    await rename(b.page, "Alpha", "Alpha-B");
    await expectQueued(a.page);
    await expectQueued(b.page);

    // A reloads without a connection to the sync server: the local edits stay visible.
    await a.blockSyncOnly();
    await a.page.reload();
    await openDocument(a.page, run, { requireSync: false });
    await expect(node(a.page, "Alpha-A")).toBeVisible();
    await expect(node(a.page, "Delta")).toBeVisible();
    await expect(a.page.getByTestId("sync-offline-pending")).toBeVisible();
    // The room has not seen any of it yet.
    expect(await serverTitles(run)).not.toContain("Alpha-A");

    // A reconnects first and delivers its edits; they are merged without any notice.
    await a.goOnline();
    await expect(node(a.page, "Alpha-A")).toBeVisible();
    await expect(a.page.getByTestId("sync-conflicts")).toHaveCount(0);
    await expect.poll(async () => (await serverTitles(run!)).includes("Alpha-A"), { timeout: 20_000 }).toBe(true);
    await expect(a.page.getByTestId("sync-offline-pending")).toHaveCount(0);

    // B reconnects second: its state stays in the node, A's becomes the conflict copy.
    await b.goOnline();
    for (const client of [a, b]) {
      await expect(node(client.page, "Delta"), `Delta at ${client.label}`).toBeVisible();
      await expect(node(client.page, "Alpha-B"), `Alpha-B at ${client.label}`).toBeVisible();
      await expect(conflictCopy(client.page, "Alpha-A", "Gerät A"), `copy at ${client.label}`).toBeVisible();
      await expect(client.page.getByTestId("sync-conflicts-toggle"), `conflict at ${client.label}`).toBeVisible();
    }
    await expect(node(b.page, "Alpha-A")).toHaveCount(0);

    // The copy names device and time; the conflict list offers both resolutions.
    const copyTitle = (await conflictCopy(a.page, "Alpha-A", "Gerät A").getAttribute("data-node-label"))!;
    expect(copyTitle).toMatch(/^Konflikt: Alpha-A \(Gerät A, \d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/);
    await b.page.getByTestId("sync-conflicts-toggle").click();
    await expect(b.page.getByTestId("sync-conflict")).toHaveCount(1);
    await expect(b.page.getByTestId("sync-conflict-adopt")).toBeVisible();
    await expect(b.page.getByTestId("sync-conflict-discard")).toBeVisible();
    await b.page.getByTestId("sync-conflicts-toggle").click();

    // The stored file has the conflict result (persisted after a short delay).
    await expect
      .poll(async () => {
        const titles = await serverTitles(run!);
        return titles.includes("Alpha-B") && titles.includes("Delta") && titles.some((title) => title.startsWith("Konflikt: Alpha-A (Gerät A, "));
      }, { timeout: 20_000 })
      .toBe(true);

    // Both starting versions are in the file's version history (the list the UI shows): the server's
    // version and the device's, the device's as the newer entry. The comparison file has none.
    await expect.poll(async () => (await readHistory(run!, run!.alphaFile)).revisions.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    const historyAfterMerge = (await readHistory(run, run.alphaFile)).revisions.map((revision) => revision.id);
    // Folders: exactly the two starting versions (cloud documents keep their own revisions, not checked here).
    const folderHistory = (await readHistory(run, run.alphaFile)).source === "local";
    if (folderHistory) expect(historyAfterMerge).toHaveLength(2);
    expect((await readHistory(run, run.compareFile)).revisions).toHaveLength(0);

    // Local mode: both starting versions are in a snapshot of the sync server taken before the merge.
    if (run.local) {
      await expect.poll(async () => (await readLocalSnapshots(run!)).length, { timeout: 10_000 }).toBe(2);
      const snapshots = await readLocalSnapshots(run);
      const conflictSnapshot = snapshots.find((snapshot) => snapshot.meta.conflictNodeIds.length > 0)!;
      expect(conflictSnapshot.meta.device).toBe("Gerät B");
      expect(conflictSnapshot.server).toContain("## Alpha-A");
      expect(conflictSnapshot.server).toContain("## Delta");
      expect(conflictSnapshot.client).toContain("## Alpha-B");
      expect(snapshots[0]!.server).toContain("## Alpha ");
      expect(snapshots[0]!.client).toContain("## Alpha-A");
    }

    // Repeated connection and re-delivery create neither duplicate nodes nor another copy/snapshot.
    const before = await labels(a.page);
    await b.dropConnection();
    await expect(b.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    await b.dropConnection();
    await expect(b.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    await a.dropConnection();
    await expect(a.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    expect(await labels(a.page)).toEqual(before);
    expect(await labels(b.page)).toEqual(before);
    if (run.local) expect((await readLocalSnapshots(run)).length).toBe(2);
    if (folderHistory) expect((await readHistory(run, run.alphaFile)).revisions.map((revision) => revision.id)).toEqual(historyAfterMerge);
    const afterRetries = await serverTitles(run);
    expect(countOf(afterRetries, (title) => title === "Delta")).toBe(1);
    expect(countOf(afterRetries, (title) => title.startsWith("Konflikt: Alpha-A"))).toBe(1);

    // A adopts the copied version: both show the same result and the copy is gone.
    await a.page.getByTestId("sync-conflicts-toggle").click();
    await a.page.getByTestId("sync-conflict-adopt").click();
    for (const client of [a, b]) {
      await expect(node(client.page, "Alpha-A"), `adopted at ${client.label}`).toBeVisible();
      await expect(node(client.page, "Alpha-B")).toHaveCount(0);
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(client.page.getByTestId("sync-conflicts")).toHaveCount(0);
    }
    expect(await labels(a.page)).toEqual(await labels(b.page));

    // Reloading and reopening keeps the result.
    await a.page.reload();
    await b.page.reload();
    for (const client of [a, b]) {
      await openDocument(client.page, run, { requireSync: true, titles: ["Alpha-A", "Beta", "Gamma"] });
      await expect(node(client.page, "Alpha-A")).toBeVisible();
      await expect(node(client.page, "Delta")).toBeVisible();
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(client.page.getByTestId("sync-status")).toContainText("Synced");
    }
    const shown = await labels(a.page);
    expect(shown).toEqual([run.rootTitle, "Alpha-A", "Beta", "Gamma", "Delta"].sort());

    // The stored file matches what is shown, and so does the Markdown export.
    await expect
      .poll(async () => {
        const titles = await serverTitles(run!);
        return !titles.includes("Alpha-B") && !titles.some((title) => title.includes("Konflikt")) && titles.includes("Alpha-A");
      }, { timeout: 20_000 })
      .toBe(true);
    expect(unique(await serverTitles(run))).toEqual(shown);
    const exported = await exportMarkdown(a.page);
    expect(exportedHeadings(exported)).toEqual(shown);
    expect(exported).not.toContain("Konflikt");

    // The comparison file was never touched.
    expect(await fingerprint(run, run.compareFile)).toBe(compareBefore);

    // Restore through the version history: both starting versions can be brought back.
    await a.close();
    await b.close();
    const source = (await readHistory(run, run.alphaFile)).source;
    await waitForEmptyRoom(run);
    const versions = await restoreAllVersions(run, run.alphaFile);
    const hasConflictCopy = (titles: string[]) => titles.some((title) => title.startsWith("Konflikt"));
    // The state the server had before B's edits arrived (A's version, no copy) ...
    expect(
      versions.some((titles) => titles.includes("Alpha-A") && titles.includes("Delta") && !titles.includes("Alpha-B") && !hasConflictCopy(titles)),
      `server version in ${JSON.stringify(versions)}`,
    ).toBe(true);
    if (source === "cloud") {
      // ... and the state with B's version in the node and A's version kept as the conflict copy.
      expect(
        versions.some((titles) => titles.includes("Alpha-B") && titles.some((title) => title.startsWith("Konflikt: Alpha-A (Gerät A, "))),
        `client version in ${JSON.stringify(versions)}`,
      ).toBe(true);
    } else {
      // ... and the state the reconnecting device (B) brought: its own edit only.
      const deviceVersion = versions.find((titles) => titles.includes("Alpha-B") && !titles.includes("Alpha-A") && !titles.includes("Delta") && !hasConflictCopy(titles));
      expect(deviceVersion, `device version in ${JSON.stringify(versions)}`).toBeDefined();
      // Every restore put the version it replaced into the history: 2 + 2 entries now. The newest one is
      // the state the last restore replaced, the device's version; restoring it brings that state back.
      const history = await readHistory(run, run.alphaFile);
      expect(history.revisions).toHaveLength(4);
      expect(await restoreVersion(run, run.alphaFile, history.revisions[0]!.id)).toEqual(deviceVersion);
      expect((await readHistory(run, run.alphaFile)).revisions).toHaveLength(5);
      // Both clients, opened anew, show exactly that content.
      await waitForEmptyRoom(run);
      for (const label of ["A", "B"] as const) {
        const client = await openClient(browser, run, label);
        await openDocument(client.page, run, { requireSync: true, titles: ["Alpha-B", "Beta", "Gamma"] });
        expect(await labels(client.page), `restored content at ${label}`).toEqual(unique(deviceVersion!));
        await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      }
      // The comparison file still has no history and is unchanged.
      expect((await readHistory(run, run.compareFile)).revisions).toHaveLength(0);
      expect(await fingerprint(run, run.compareFile)).toBe(compareBefore);
    }
  } finally {
    await finish(run, testInfo);
  }
});

test("@t261 a conflict copy can be deleted instead: the node keeps its version", async ({ browser }, testInfo) => {
  let run: Run | undefined;
  try {
    const started = await startRun(browser, testInfo);
    run = started.run;
    const { a, b } = started;
    await a.goOffline();
    await b.goOffline();
    await rename(a.page, "Beta", "Beta-A");
    await rename(b.page, "Beta", "Beta-B");
    await expectQueued(a.page);
    await expectQueued(b.page);
    await a.goOnline();
    await b.goOnline();
    for (const client of [a, b]) await expect(conflictCopy(client.page, "Beta-A", "Gerät A")).toBeVisible();
    await b.page.getByTestId("sync-conflicts-toggle").click();
    await b.page.getByTestId("sync-conflict-discard").click();
    for (const client of [a, b]) {
      await expect(node(client.page, "Beta-B")).toBeVisible();
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(node(client.page, "Beta-A")).toHaveCount(0);
    }
    // The stored file follows the shown state once the debounced persistence has run.
    await expect
      .poll(async () => {
        const titles = await serverTitles(run!);
        return titles.includes("Beta-B") && !titles.some((title) => title.includes("Konflikt")) && !titles.includes("Beta-A");
      }, { timeout: 20_000 })
      .toBe(true);
    const exported = await exportMarkdown(b.page);
    expect(exportedHeadings(exported)).toEqual(await labels(b.page));
  } finally {
    await finish(run, testInfo);
  }
});
