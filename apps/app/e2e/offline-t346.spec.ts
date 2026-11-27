import { test, type Page } from "@playwright/test";
import {
  addChild, alphaMarkdown, apiUrl, conflictCopy, countOf, expectQueued, exportMarkdown, exportedHeadings, expect, fingerprint, finish, labels, node, openDocument,
  openClient, readHistory, readLocalSnapshots, rename, restoreVersion, serverTitles, startRun, unique, waitForEmptyRoom, type Run,
} from "./offline-helpers";
import { createStage, gitSha, logTiming, STAGE_CLIENT_VIEWPORT } from "./offline-t346-stage";

// @t346 — W1: reproducible acceptance proof (with video) for the offline conflict (#261, rule A, version history)
// and the sync persistence (#46). Two browser contexts (devices A and B, same account, own browser storage) edit the
// same Markdown file offline; reconnect, conflict, resolution, export, restore from the version history, error cases,
// repetition. Real sync server, real files, no mock: the helpers of @t261 (`offline-helpers.ts`) only forward the
// WebSocket to the real sync server or close it (lost network). WebDAV / read-only source (#264) is out of scope (#415).
// Case and rule: docs/offline-konflikt.md. Proof sheet and reset: docs/nachweise/t346.md.
//
// With `T346_VIDEO=1` (config `playwright.offline-t346.video.config.ts`) a third, recorded browser context shows the
// active device and the current step (see `offline-t346-stage.ts`); without it the same steps run without pauses.

/** Restores the n-th entry of the open version-history dialog (newest first); retries while the sync room is still occupied. */
async function restoreViaUi(page: Page, index: number): Promise<void> {
  const success = page.getByTestId("note-history-success");
  const failure = page.getByTestId("note-history-error");
  await expect
    .poll(
      async () => {
        await page.getByTestId("note-history-restore").nth(index).click();
        await page.getByTestId("note-history-confirm-restore").click();
        await expect(success.or(failure)).toBeVisible();
        return success.isVisible();
      },
      { timeout: 60_000, intervals: [1_500, 2_500, 3_500] },
    )
    .toBe(true);
}

test("@t346 offline conflict end to end: conflict, resolution, export, restore, error cases, repetition", async ({ browser }, testInfo) => {
  let run: Run | undefined;
  let stage: Awaited<ReturnType<typeof createStage>> | undefined;
  try {
    const started = await startRun(browser, testInfo, { viewport: STAGE_CLIENT_VIEWPORT });
    testInfo.setTimeout(300_000);
    run = started.run;
    const { a, b } = started;
    stage = await createStage(browser, { sha: gitSha(), data: `${run.alphaFile} + ${run.compareFile} (per API angelegt)` });
    stage.attach("A", a.page);
    stage.attach("B", b.page);

    const compareBefore = await fingerprint(run, run.compareFile);
    const compareHistoryBefore = (await readHistory(run, run.compareFile)).revisions.length;

    // 1 — Starting point: both devices show the same file, the stored file has the same nodes.
    expect(await serverTitles(run)).toEqual([run.rootTitle, "Alpha", "Beta", "Gamma"].sort());
    await stage.step("1 · Ausgangslage: Gerät A zeigt Alpha, Beta, Gamma (synchron)", "A");
    await stage.step("1 · Ausgangslage: Gerät B zeigt dieselbe Datei (synchron)", "B");

    // 2 — Both lose the connection and edit separately (rename of the same node; A adds Delta).
    await a.goOffline();
    await b.goOffline();
    await rename(a.page, "Alpha", "Alpha-A");
    await addChild(a.page, run.rootTitle, "Delta");
    await rename(b.page, "Alpha", "Alpha-B");
    await expectQueued(a.page);
    await expectQueued(b.page);
    await stage.step("2 · Gerät B offline: „Alpha“ → „Alpha-B“, Änderung liegt in der lokalen Warteschlange", "B");
    await stage.step("2 · Gerät A offline: „Alpha“ → „Alpha-A“ und neuer Knoten „Delta“", "A");

    // 3 — Error case 1: A reloads the tab without a connection to the sync server; nothing is lost (#46).
    await a.blockSyncOnly();
    await a.page.reload();
    await openDocument(a.page, run, { requireSync: false });
    await expect(node(a.page, "Alpha-A")).toBeVisible();
    await expect(node(a.page, "Delta")).toBeVisible();
    await expect(a.page.getByTestId("sync-offline-pending")).toBeVisible();
    expect(await serverTitles(run)).not.toContain("Alpha-A");
    await stage.step("3 · Fehlerfall: Tab offline neu geladen — Alpha-A und Delta sind noch da, noch nicht beim Server", "A");

    // 4 — A reconnects first (merged without a notice), B second: B's state stays in the node, A's becomes the copy.
    await a.goOnline();
    await expect(node(a.page, "Alpha-A")).toBeVisible();
    await expect(a.page.getByTestId("sync-conflicts")).toHaveCount(0);
    await expect.poll(async () => (await serverTitles(run!)).includes("Alpha-A"), { timeout: 20_000 }).toBe(true);
    await expect(a.page.getByTestId("sync-offline-pending")).toHaveCount(0);
    await stage.step("4 · Gerät A wieder online: Änderungen kommen ohne Hinweis an (kein Konflikt)", "A");
    await b.goOnline();
    for (const client of [a, b]) {
      await expect(node(client.page, "Delta"), `Delta at ${client.label}`).toBeVisible();
      await expect(node(client.page, "Alpha-B"), `Alpha-B at ${client.label}`).toBeVisible();
      await expect(conflictCopy(client.page, "Alpha-A", "Gerät A"), `copy at ${client.label}`).toBeVisible();
      await expect(client.page.getByTestId("sync-conflicts-toggle"), `conflict at ${client.label}`).toBeVisible();
    }
    await expect(node(b.page, "Alpha-A")).toHaveCount(0);
    const copyTitle = (await conflictCopy(a.page, "Alpha-A", "Gerät A").getAttribute("data-node-label"))!;
    expect(copyTitle).toMatch(/^Konflikt: Alpha-A \(Gerät A, \d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/);
    await stage.step("4 · Gerät B wieder online: „Delta“, „Alpha-B“ und die Kopie „Konflikt: Alpha-A (Gerät A, Zeit)“", "B");
    await stage.step("4 · Gerät A sieht dasselbe: Delta, Alpha-B und die Konfliktkopie", "A");
    await b.page.getByTestId("sync-conflicts-toggle").click();
    await expect(b.page.getByTestId("sync-conflict")).toHaveCount(1);
    await expect(b.page.getByTestId("sync-conflict-adopt")).toBeVisible();
    await expect(b.page.getByTestId("sync-conflict-discard")).toBeVisible();
    await stage.step("4 · Konfliktliste: Fassung übernehmen oder Kopie verwerfen", "B");
    await b.page.getByTestId("sync-conflicts-toggle").click();

    // The stored file has the conflict result (persisted after a short delay).
    await expect
      .poll(async () => {
        const titles = await serverTitles(run!);
        return titles.includes("Alpha-B") && titles.includes("Delta") && titles.some((title) => title.startsWith("Konflikt: Alpha-A (Gerät A, "));
      }, { timeout: 20_000 })
      .toBe(true);

    // Version history: both starting versions (the server's, then the reconnecting device's as the newer entry); the
    // comparison file has none. Folder mode: exactly these two entries. The sync server also took snapshots.
    await expect.poll(async () => (await readHistory(run!, run!.alphaFile)).revisions.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    const historyAfterMerge = await readHistory(run, run.alphaFile);
    expect(historyAfterMerge.source).toBe("local");
    expect(historyAfterMerge.revisions).toHaveLength(2);
    const deviceVersionId = historyAfterMerge.revisions[0]!.id;
    expect((await readHistory(run, run.compareFile)).revisions).toHaveLength(compareHistoryBefore);
    await expect.poll(async () => (await readLocalSnapshots(run!)).length, { timeout: 10_000 }).toBe(2);

    // 5 — Idempotence: repeated connection loss and re-delivery create neither duplicate nodes nor another copy.
    const before = await labels(a.page);
    await b.dropConnection();
    await expect(b.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    await b.dropConnection();
    await expect(b.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    await a.dropConnection();
    await expect(a.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    expect(await labels(a.page)).toEqual(before);
    expect(await labels(b.page)).toEqual(before);
    expect((await readLocalSnapshots(run)).length).toBe(2);
    expect((await readHistory(run, run.alphaFile)).revisions.map((revision) => revision.id)).toEqual(historyAfterMerge.revisions.map((revision) => revision.id));
    const afterRetries = await serverTitles(run);
    expect(countOf(afterRetries, (title) => title === "Delta")).toBe(1);
    expect(countOf(afterRetries, (title) => title.startsWith("Konflikt: Alpha-A"))).toBe(1);
    await stage.step("5 · Verbindung dreimal unterbrochen und neu zugestellt: keine doppelten Knoten, keine zweite Kopie", "B");

    // 6 — Decision: A adopts the copied version; both show the same end state without a conflict copy.
    await a.page.getByTestId("sync-conflicts-toggle").click();
    await a.page.getByTestId("sync-conflict-adopt").click();
    for (const client of [a, b]) {
      await expect(node(client.page, "Alpha-A"), `adopted at ${client.label}`).toBeVisible();
      await expect(node(client.page, "Alpha-B")).toHaveCount(0);
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(client.page.getByTestId("sync-conflicts")).toHaveCount(0);
    }
    expect(await labels(a.page)).toEqual(await labels(b.page));
    await stage.step("6 · Gerät A übernimmt die Fassung „Alpha-A“: Konfliktkopie weg", "A");
    await stage.step("6 · Gerät B zeigt denselben Endzustand: Alpha-A, Delta, keine Kopie", "B");

    // 7 — The end state survives a reload and equals the stored file and the Markdown export.
    await a.page.reload();
    await b.page.reload();
    for (const client of [a, b]) {
      await openDocument(client.page, run, { requireSync: true, titles: ["Alpha-A", "Beta", "Gamma"] });
      await expect(node(client.page, "Delta")).toBeVisible();
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(client.page.getByTestId("sync-status")).toContainText("Synced");
    }
    const adopted = await labels(a.page);
    expect(adopted).toEqual([run.rootTitle, "Alpha-A", "Beta", "Gamma", "Delta"].sort());
    expect(await labels(b.page)).toEqual(adopted);
    await expect
      .poll(async () => {
        const titles = await serverTitles(run!);
        return !titles.includes("Alpha-B") && !titles.some((title) => title.includes("Konflikt")) && titles.includes("Alpha-A");
      }, { timeout: 20_000 })
      .toBe(true);
    expect(unique(await serverTitles(run))).toEqual(adopted);
    for (const client of [a, b]) {
      const exported = await exportMarkdown(client.page);
      expect(exportedHeadings(exported), `export at ${client.label}`).toEqual(adopted);
      expect(exported).not.toContain("Konflikt");
    }
    expect(await fingerprint(run, run.compareFile)).toBe(compareBefore);
    await stage.step("7 · Nach Neuladen, API-Datei und Markdown-Export: derselbe Endzustand, Vergleichsdatei unverändert", "A");

    // 8 — Error case 2: B edits offline and the connection breaks while reconnecting; nothing is lost, the state arrives after recovery.
    await b.goOffline();
    await rename(b.page, "Gamma", "Gamma-B");
    await addChild(b.page, run.rootTitle, "Epsilon");
    await expectQueued(b.page);
    await stage.step("8 · Fehlerfall: Gerät B offline, „Gamma“ → „Gamma-B“ und neuer Knoten „Epsilon“", "B");
    await b.reconnectThenCut();
    await expect(node(b.page, "Gamma-B")).toBeVisible();
    await expect(node(b.page, "Epsilon")).toBeVisible();
    await stage.step("8 · Verbindung beim Wiederverbinden abgebrochen: die Änderungen bleiben sichtbar", "B");
    await b.blockSyncOnly();
    await b.page.reload();
    await openDocument(b.page, run, { requireSync: false });
    await expect(node(b.page, "Gamma-B")).toBeVisible();
    await expect(node(b.page, "Epsilon")).toBeVisible();
    await stage.step("8 · Tab neu geladen, Server weiter nicht erreichbar: Gamma-B und Epsilon sind noch da", "B");
    await b.goOnline();
    for (const client of [a, b]) {
      await expect(node(client.page, "Gamma-B"), `Gamma-B at ${client.label}`).toBeVisible();
      await expect(node(client.page, "Epsilon"), `Epsilon at ${client.label}`).toBeVisible();
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
    }
    await expect(b.page.getByTestId("sync-offline-pending")).toHaveCount(0);
    const finalState = [run.rootTitle, "Alpha-A", "Beta", "Gamma-B", "Delta", "Epsilon"].sort();
    expect(await labels(a.page)).toEqual(finalState);
    expect(await labels(b.page)).toEqual(finalState);
    await expect.poll(async () => unique(await serverTitles(run!)), { timeout: 20_000 }).toEqual(finalState);
    const finalTitles = await serverTitles(run);
    expect(countOf(finalTitles, (title) => title === "Epsilon")).toBe(1);
    expect(countOf(finalTitles, (title) => title === "Gamma-B")).toBe(1);
    expect(countOf(finalTitles, (title) => title.includes("Konflikt"))).toBe(0);
    await stage.step("8 · Nach der Erholung: Gerät B zeigt Gamma-B und Epsilon, genau einmal", "B");
    await stage.step("8 · Gerät A sieht dieselben Änderungen, ohne Konflikt", "A");

    // 9 — Version history: the dialog of the UI lists the entries (both starting versions among them). Restoring writes the
    // stored file; a sync room that is still alive would keep and later persist its old state, so both clients are closed,
    // the room is given time to go away, the version is restored through the app API (the call behind the dialog) and the
    // file is opened anew. See docs/nachweise/t346.md, finding "Wiederherstellen bei geöffnetem Tab".
    await a.page.getByTestId("toolbar-history").click();
    await expect(a.page.getByTestId("note-history-dialog")).toBeVisible();
    await expect(a.page.getByTestId("note-history-entry").first()).toBeVisible();
    const historyBeforeRestore = await readHistory(run, run.alphaFile);
    await expect(a.page.getByTestId("note-history-entry")).toHaveCount(historyBeforeRestore.revisions.length);
    const deviceIndex = historyBeforeRestore.revisions.findIndex((revision) => revision.id === deviceVersionId);
    expect(deviceIndex, "the starting version of device B is still in the history").toBeGreaterThanOrEqual(0);
    await stage.step("9 · Versionshistorie der Datei: die beiden Ausgangsfassungen (Server, Gerät B) und die Speicherstände danach", "A");
    await a.page.getByTestId("note-history-close").click();
    await a.close();
    await b.close();
    await waitForEmptyRoom(run);
    const restoredState = [run.rootTitle, "Alpha-B", "Beta", "Gamma"].sort();
    expect(unique(await restoreVersion(run, run.alphaFile, deviceVersionId))).toEqual(restoredState);
    const historyAfterRestore = await readHistory(run, run.alphaFile);
    // Nothing is overwritten: the replaced state is an entry of its own; the older ones are still there.
    expect(historyAfterRestore.revisions).toHaveLength(historyBeforeRestore.revisions.length + 1);
    expect(historyAfterRestore.revisions.slice(1).map((revision) => revision.id)).toEqual(historyBeforeRestore.revisions.map((revision) => revision.id));
    await waitForEmptyRoom(run);
    const reopened = await openClient(browser, run, "A", STAGE_CLIENT_VIEWPORT);
    stage.attach("A", reopened.page);
    await openDocument(reopened.page, run, { requireSync: true, titles: ["Alpha-B", "Beta", "Gamma"] });
    expect(await labels(reopened.page)).toEqual(restoredState);
    await expect(reopened.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
    expect(await fingerprint(run, run.compareFile)).toBe(compareBefore);
    await stage.step("9 · Fassung von Gerät B wiederhergestellt: im Knoten sichtbar ist Alpha-B (ohne Delta); der ersetzte Stand steht als neuer Eintrag in der Historie", "A");

    // 10 — Restoring the newest entry (the state that was replaced) brings the last end state back: nothing was lost.
    await reopened.close();
    await waitForEmptyRoom(run);
    expect(unique(await restoreVersion(run, run.alphaFile, historyAfterRestore.revisions[0]!.id))).toEqual(finalState);
    expect((await readHistory(run, run.alphaFile)).revisions).toHaveLength(historyAfterRestore.revisions.length + 1);
    await waitForEmptyRoom(run);
    const again = await openClient(browser, run, "A", STAGE_CLIENT_VIEWPORT);
    stage.attach("A", again.page);
    await openDocument(again.page, run, { requireSync: true, titles: ["Alpha-A", "Beta", "Gamma-B"] });
    expect(await labels(again.page)).toEqual(finalState);
    await stage.step("10 · Neuester Eintrag wiederhergestellt: der Endzustand von vorher ist wieder da, nichts ging verloren", "A");

    // 11 — The comparison file is unchanged: content and version as before, still no history entry.
    expect(await fingerprint(run, run.compareFile)).toBe(compareBefore);
    expect((await readHistory(run, run.compareFile)).revisions).toHaveLength(compareHistoryBefore);
    await stage.step("11 · Ergebnis: Vergleichsdatei unverändert (Inhalt und Version), Testdaten werden aufgeräumt");
  } finally {
    // Stop the recording first so the clean-up is not part of the video, then remove the files and the account.
    if (stage?.enabled) await stage.finish(testInfo.outputPath("video.webm")).catch((error: unknown) => testInfo.annotations.push({ type: "video", description: String(error) }));
    await finish(run, testInfo);
  }

});

// Finding (product defect, not fixed in this ticket): restoring a version through the history dialog while the tab stays open.
// The dialog reports success, but the stored file keeps the old state and the open node does not show the restored version
// (the live sync room still holds, and later persists, the old state). The main test above restores with the room empty and
// opens the file anew; this test takes the way a user takes and is marked `test.fail()`: it stays green while the defect exists
// and turns red ("expected to fail, but passed") once it is fixed, so the marker has to be removed together with the fix.
// Description, observed behaviour and evidence: docs/nachweise/t346.md, section "Abweichungen".
test("@t346 @t346-befund restore from the history dialog with the tab open (known defect)", async ({ browser }, testInfo) => {
  let run: Run | undefined;
  try {
    const started = await startRun(browser, testInfo, { viewport: STAGE_CLIENT_VIEWPORT });
    run = started.run;
    await started.a.close();
    await started.b.close();
    await waitForEmptyRoom(run);

    // Setup (a failure here is a real failure of the test, not the defect): overwrite the file through the API so that the
    // original becomes an entry of the history, then open the changed file on A, which stays connected from here on.
    const changed = alphaMarkdown(run).replace(/^## Alpha </m, "## Alpha-X <");
    expect(changed).not.toBe(alphaMarkdown(run));
    const saved = await run.api.request.put(apiUrl(run.alphaFile), { headers: { Origin: run.origin }, data: { markdown: changed, overwrite: true } });
    expect(saved.ok(), `overwrite ${run.alphaFile}: ${saved.status()}`).toBe(true);
    const history = await readHistory(run, run.alphaFile);
    expect(history.revisions.length, "the overwrite created a history entry").toBeGreaterThanOrEqual(1);
    const oldest = history.revisions.length - 1;
    const original = [run.rootTitle, "Alpha", "Beta", "Gamma"].sort();
    const a = await openClient(browser, run, "A", STAGE_CLIENT_VIEWPORT);
    await openDocument(a.page, run, { requireSync: true, titles: ["Alpha-X", "Beta", "Gamma"] });

    // From here the known defect counts: `test.fail()` keeps the test green while it exists and turns it red
    // ("expected to fail, but passed") once it is fixed; the marker is to be removed together with the fix.
    test.fail(true, "Known defect: the restore through the open tab is not persisted (docs/nachweise/t346.md, Abweichungen)");

    // Steps of the defect: open the history in the open tab, restore the oldest entry (the original) through the dialog.
    const apiCalls: Array<{ method: string; path: string; status: number; body: string }> = [];
    const consoleMessages: string[] = [];
    a.page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text().slice(0, 200)}`); });
    a.page.on("response", async (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/api/")) return;
      apiCalls.push({ method: response.request().method(), path: url.pathname, status: response.status(), body: (await response.text().catch(() => "")).slice(0, 200) });
    });
    await a.page.getByTestId("toolbar-history").click();
    await expect(a.page.getByTestId("note-history-entry")).toHaveCount(history.revisions.length);
    await restoreViaUi(a.page, oldest);
    const dialogMessage = (await a.page.getByTestId("note-history-success").innerText().catch(() => "")).trim();
    await a.page.getByTestId("note-history-close").click();

    // Observation (attached as evidence): what the dialog said, what the node shows, what the stored file contains.
    await new Promise((done) => setTimeout(done, 8_000));
    const observed = {
      expected: original,
      dialogMessage,
      apiCallsDuringRestore: apiCalls,
      consoleMessages,
      historyEntriesBefore: history.revisions.length,
      historyEntriesAfter: (await readHistory(run, run.alphaFile)).revisions.length,
      nodeLabels: await labels(a.page),
      storedFile: unique(await serverTitles(run)),
    };
    console.log(`T346-BEFUND ${JSON.stringify(observed)}`);
    await testInfo.attach("befund-wiederherstellen-offener-tab.json", { body: JSON.stringify(observed, null, 2), contentType: "application/json" });

    // Expected behaviour (fails today): the stored file and the open node show the restored original.
    expect(observed.storedFile, "stored file after the restore").toEqual(original);
    expect(observed.nodeLabels, "open node after the restore").toEqual(original);
  } finally {
    await finish(run, testInfo);
  }
});
