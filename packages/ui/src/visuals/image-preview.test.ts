import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { imageProblemText, loadImagePreview, PREVIEW_RESOURCE_EVENT, problemImageUrl, type ResourcePreviewDetail } from "./image-preview";

describe("loadImagePreview", () => {
  let win: Window;
  const globalsBefore = { window: globalThis.window, CustomEvent: globalThis.CustomEvent };
  let requested: string[];
  let revoked: string[];
  const originalRevoke = URL.revokeObjectURL;

  /** Plays a shell: answers with a blob URL for the paths in `files`, with an error for all others. */
  function shell(files: string[]) {
    win.addEventListener(PREVIEW_RESOURCE_EVENT, (event) => {
      const detail = (event as CustomEvent<ResourcePreviewDetail>).detail;
      requested.push(detail.file);
      if (files.includes(detail.file)) detail.respond({ url: `blob:${detail.file}`, revokeOnCleanup: true });
      else detail.respond({ error: `„${detail.file}“ wurde nicht gefunden.` });
    });
  }

  beforeEach(() => {
    win = new Window({ url: "https://bloommd.test/app" });
    globalThis.window = win as unknown as Window & typeof globalThis.window;
    globalThis.CustomEvent = win.CustomEvent as unknown as typeof CustomEvent;
    requested = [];
    revoked = [];
    URL.revokeObjectURL = (url: string) => void revoked.push(url);
  });

  afterEach(() => {
    Object.assign(globalThis, globalsBefore);
    URL.revokeObjectURL = originalRevoke;
  });

  test("asks the shell for the path resolved against the note, spaces and umlauts included", async () => {
    shell(["Reisen/Bilder/Übersicht Süd.png"]);
    const result = await loadImagePreview("Reisen/Urlaub 2026.md", { syntax: "markdown", target: "Bilder/%C3%9Cbersicht%20S%C3%BCd.png" });
    expect(requested).toEqual(["Reisen/Bilder/Übersicht Süd.png"]);
    expect(result).toMatchObject({ status: "ready", url: "blob:Reisen/Bilder/Übersicht Süd.png", path: "Reisen/Bilder/Übersicht Süd.png" });
  });

  test("./ and ../ resolve the same way as in the shared rule", async () => {
    shell(["img/a.png", "notes/b.png"]);
    await loadImagePreview("notes/deep/x.md", { syntax: "markdown", target: "../../img/a.png" });
    await loadImagePreview("notes/x.md", { syntax: "markdown", target: "./b.png" });
    expect(requested).toEqual(["img/a.png", "notes/b.png"]);
  });

  test("an Obsidian embed falls back from the note's folder to the workspace root", async () => {
    shell(["bild.png"]);
    const result = await loadImagePreview("notes/x.md", { syntax: "wiki", target: "bild.png" });
    expect(requested).toEqual(["notes/bild.png", "bild.png"]);
    expect(result).toMatchObject({ status: "ready", path: "bild.png" });
  });

  test("a missing file is a hint with the path, not an exception", async () => {
    shell([]);
    const result = await loadImagePreview("notes/x.md", { syntax: "markdown", target: "fehlt.png" });
    expect(result).toEqual({ status: "unavailable", reason: "not-found", path: "notes/fehlt.png", message: "„notes/fehlt.png“ wurde nicht gefunden." });
    expect(imageProblemText(result as Extract<typeof result, { status: "unavailable" }>, { notFound: "Bild nicht gefunden:", rejected: "Pfad nicht erlaubt:" })).toBe("Bild nicht gefunden: notes/fehlt.png");
  });

  test("a path outside the workspace never reaches the shell", async () => {
    shell(["geheim.png"]);
    const result = await loadImagePreview("x.md", { syntax: "markdown", target: "../geheim.png" });
    expect(requested).toEqual([]);
    expect(result).toEqual({ status: "unavailable", reason: "rejected", path: "../geheim.png", detail: "escapes-workspace" });
    expect(imageProblemText(result as Extract<typeof result, { status: "unavailable" }>, { notFound: "x", rejected: "Pfad nicht erlaubt:" })).toBe("Pfad nicht erlaubt: ../geheim.png (path leaves the workspace)");
    const absolute = await loadImagePreview("x.md", { syntax: "markdown", target: "file:///etc/passwd" });
    expect(absolute).toMatchObject({ status: "unavailable", reason: "rejected" });
    expect(requested).toEqual([]);
  });

  test("a Markdown image names exactly one file; an Obsidian embed may be matched by name", async () => {
    const exact: boolean[] = [];
    win.addEventListener(PREVIEW_RESOURCE_EVENT, (event) => {
      const detail = (event as CustomEvent<ResourcePreviewDetail>).detail;
      exact.push(detail.exact === true);
      detail.respond({ error: "x" });
    });
    await loadImagePreview("a.md", { syntax: "markdown", target: "b.png" });
    await loadImagePreview("a.md", { syntax: "wiki", target: "b.png" });
    expect(exact).toEqual([true, false]);
  });

  test("remote images need no shell", async () => {
    const result = await loadImagePreview("x.md", { syntax: "markdown", target: "https://example.com/a.png" });
    expect(requested).toEqual([]);
    expect(result).toMatchObject({ status: "ready", url: "https://example.com/a.png" });
  });

  test("release frees the object URL the shell made, and only that", async () => {
    shell(["a.png"]);
    const local = await loadImagePreview("x.md", { syntax: "markdown", target: "a.png" });
    const remote = await loadImagePreview("x.md", { syntax: "markdown", target: "https://example.com/a.png" });
    if (local.status === "ready") local.release();
    if (remote.status === "ready") remote.release();
    expect(revoked).toEqual(["blob:a.png"]);
  });

  test("no answer within the timeout is a hint; a late object URL is freed", async () => {
    let lateRespond: ResourcePreviewDetail["respond"] | null = null;
    win.addEventListener(PREVIEW_RESOURCE_EVENT, (event) => {
      lateRespond = (event as CustomEvent<ResourcePreviewDetail>).detail.respond;
    });
    const result = await loadImagePreview("x.md", { syntax: "markdown", target: "slow.png" }, 20);
    expect(result).toMatchObject({ status: "unavailable", reason: "not-found", path: "slow.png" });
    (lateRespond as ResourcePreviewDetail["respond"] | null)?.({ url: "blob:late", revokeOnCleanup: true });
    expect(revoked).toEqual(["blob:late"]);
  });
});

describe("problemImageUrl", () => {
  test("is an SVG that carries the text, escaped", () => {
    const url = problemImageUrl('Bild nicht gefunden: <a & "b">.png');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    const svg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
    expect(svg).toContain("Bild nicht gefunden: &lt;a &amp; &quot;b&quot;&gt;.png");
    expect(svg).not.toContain("<a ");
  });

  test("long paths are shortened", () => {
    const svg = decodeURIComponent(problemImageUrl(`Bild nicht gefunden: ${"x".repeat(200)}`).split(",")[1]!);
    expect(svg).toContain("…");
    expect(svg.length).toBeLessThan(900);
  });
});
