import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { NoteRevision } from "@bloommd/core/browser";
import { LocaleProvider } from "../i18n/LocaleContext";
import type { Locale } from "../i18n/translations";
import { NoteHistoryDialog } from "./NoteHistoryDialog";
import { installDom, waitFor } from "./test-dom";

const REVISIONS: NoteRevision[] = [
  { id: "r-newer", source: "cloud", replacedAt: "2026-11-03T09:15:00.000Z", size: 2048, version: 6, author: "Ada" },
  { id: "r-older", source: "local", replacedAt: "2026-11-02T18:00:00.000Z", size: 512 },
];

describe("NoteHistoryDialog", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  function render(props: Partial<React.ComponentProps<typeof NoteHistoryDialog>> = {}, locale: Locale = "de") {
    flushSync(() => root!.render(
      <LocaleProvider key={locale} initialLocale={locale}>
        <NoteHistoryDialog
          filename="Physik.md"
          loadRevisions={async () => REVISIONS}
          onRestore={async () => undefined}
          onClose={() => undefined}
          {...props}
        />
      </LocaleProvider>,
    ));
  }
  const entries = () => [...container.querySelectorAll<HTMLElement>("[data-testid='note-history-entry']")];
  const text = (testId: string) => container.querySelector(`[data-testid='${testId}']`)?.textContent ?? null;
  const click = (testId: string, index = 0) => container.querySelectorAll<HTMLElement>(`[data-testid='${testId}']`)[index]!.click();

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

  test("lists the versions as they come, with source, version, author and size", async () => {
    render();
    await waitFor(() => entries().length === 2, "the versions");

    expect(text("note-history-dialog")).toContain("Verlauf: Physik.md");
    expect(entries()[0]!.textContent).toContain("Cloud");
    expect(entries()[0]!.textContent).toContain("Version 6");
    expect(entries()[0]!.textContent).toContain("von Ada");
    expect(entries()[0]!.textContent).toContain("2 KB");
    expect(entries()[0]!.textContent).toContain("Fassung bis");
    expect(entries()[1]!.textContent).toContain("Lokal");
    expect(entries()[1]!.textContent).toContain("512 B");
    expect(container.querySelectorAll("[data-testid='note-history-restore']")).toHaveLength(2);
  });

  test("shows an understandable empty state", async () => {
    render({ loadRevisions: async () => [] });
    await waitFor(() => text("note-history-empty") !== null, "the empty state");

    expect(text("note-history-empty")).toContain("Noch kein Verlauf");
    expect(entries()).toHaveLength(0);
  });

  test("says so in English", async () => {
    render({ loadRevisions: async () => [] }, "en");
    await waitFor(() => text("note-history-empty") !== null, "the empty state");

    expect(text("note-history-empty")).toContain("No history yet");
  });

  test("reports a history that cannot be loaded", async () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      render({ loadRevisions: async () => { throw new Error("HTTP 500"); } });
      await waitFor(() => text("note-history-load-error") !== null, "the load error");
    } finally {
      console.error = original;
    }

    expect(text("note-history-load-error")).toContain("konnte nicht geladen werden");
  });

  test("restoring asks first, then restores, reloads the list and says so", async () => {
    const restored: string[] = [];
    let loads = 0;
    render({
      loadRevisions: async () => {
        loads += 1;
        // After the restore the version that was current is the newest entry.
        return loads === 1 ? REVISIONS : [{ id: "r-now", source: "local", replacedAt: "2026-11-03T10:00:00.000Z", size: 700 }, ...REVISIONS];
      },
      onRestore: async (revision) => { restored.push(revision.id); },
    });
    await waitFor(() => entries().length === 2, "the versions");

    click("note-history-restore", 1);
    await waitFor(() => text("note-history-confirm") !== null, "the confirmation");
    expect(text("note-history-confirm")).toContain("Diese Fassung wiederherstellen?");
    expect(text("note-history-confirm")).toContain("bleibt im Verlauf erhalten");
    expect(restored).toEqual([]);

    click("note-history-confirm-restore");
    await waitFor(() => text("note-history-success") !== null, "the success message");

    expect(restored).toEqual(["r-older"]);
    expect(text("note-history-success")).toBe("Fassung wiederhergestellt.");
    expect(entries()).toHaveLength(3);
    expect(text("note-history-confirm")).toBeNull();
  });

  test("cancelling the confirmation restores nothing", async () => {
    const restored: string[] = [];
    render({ onRestore: async (revision) => { restored.push(revision.id); } });
    await waitFor(() => entries().length === 2, "the versions");

    click("note-history-restore");
    await waitFor(() => text("note-history-confirm") !== null, "the confirmation");
    click("note-history-confirm-cancel");
    await waitFor(() => text("note-history-confirm") === null, "the confirmation to close");

    expect(text("note-history-confirm")).toBeNull();
    expect(restored).toEqual([]);
  });

  test("explains why a restore failed", async () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      for (const [code, expected] of [
        ["VERSION_CONFLICT", "zwischenzeitlich geändert"],
        ["SYNC_ROOM_ACTIVE", "in einer Sitzung geöffnet"],
        ["READ_ONLY", "nur lesen"],
        ["RESTORE_FAILED", "konnte nicht wiederhergestellt werden"],
      ] as const) {
        root!.unmount();
        root = createRoot(container);
        render({ onRestore: async () => { throw new Error(code); } });
        await waitFor(() => entries().length === 2, "the versions");
        click("note-history-restore");
        await waitFor(() => text("note-history-confirm") !== null, "the confirmation");
        click("note-history-confirm-restore");
        await waitFor(() => text("note-history-error") !== null, `the error for ${code}`);
        expect(text("note-history-error")).toContain(expected);
      }
    } finally {
      console.error = original;
    }
  });

  test("a reader sees the versions without any restore action", async () => {
    render({ canRestore: false });
    await waitFor(() => entries().length === 2, "the versions");

    expect(container.querySelectorAll("[data-testid='note-history-restore']")).toHaveLength(0);
  });

  test("closes", async () => {
    let closed = 0;
    render({ onClose: () => { closed += 1; } });
    await waitFor(() => entries().length === 2, "the versions");

    click("note-history-close");

    expect(closed).toBe(1);
  });
});
