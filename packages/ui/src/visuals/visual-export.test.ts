import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { canSaveOriginal, DELIVER_EXPORT_EVENT, deliverExportFile, diagramExportFile, imageExportFile, originalImageFilename, parseSvgSize, pngSize, standaloneSvg, type DeliverExportDetail } from "./visual-export";

const MERMAID_SVG = '<svg id="m1" width="100%" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120.5 80" style="max-width: 120.5px;" role="graphics-document document"><g><text>A</text></g></svg>';

describe("diagram files", () => {
  test("standalone SVG has a real size, the namespace, a background and no page-only styling", () => {
    const svg = standaloneSvg(MERMAID_SVG);
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg')).toBe(true);
    expect(svg).toContain('width="120.5"');
    expect(svg).toContain('height="80"');
    expect(svg).toContain("background-color:#ffffff");
    expect(svg).not.toContain("max-width");
    expect(svg).not.toContain('width="100%"');
    expect(svg).toContain('viewBox="0 0 120.5 80"');
    expect(svg).toContain("<g><text>A</text></g></svg>");
    expect(svg.match(/xmlns=/g)).toHaveLength(1);
  });

  test("adds the namespace when the SVG lacks it", () => {
    expect(standaloneSvg('<svg viewBox="0 0 10 20"><rect/></svg>')).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  test("reads the size from viewBox, falls back to width/height, then to a default", () => {
    expect(parseSvgSize(MERMAID_SVG)).toEqual({ width: 120.5, height: 80 });
    expect(parseSvgSize('<svg width="300px" height="150"></svg>')).toEqual({ width: 300, height: 150 });
    expect(parseSvgSize("<svg></svg>")).toEqual({ width: 800, height: 600 });
  });

  test("PNG is twice the diagram size, capped at 4096 on the long side", () => {
    expect(pngSize({ width: 200, height: 100 })).toEqual({ width: 400, height: 200 });
    const huge = pngSize({ width: 20000, height: 10000 });
    expect(huge.width).toBe(4096);
    expect(huge.height).toBe(2048);
  });

  test("SVG export is <Title>.svg with the SVG MIME type and carries the diagram", async () => {
    const file = await diagramExportFile(MERMAID_SVG, "svg", "Ablauf-diagram");
    expect(file.filename).toBe("Ablauf-diagram.svg");
    expect(file.mimeType).toBe("image/svg+xml");
    expect(new TextDecoder().decode(file.data)).toContain("<text>A</text>");
  });
});

describe("original image files", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const fakeFetch = (async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } })) as unknown as typeof fetch;

  test("saves the original bytes under the original file name", async () => {
    const file = await imageExportFile({ url: "blob:https://bloommd.test/1" }, "Reisen/Bilder/Strand am Meer.png", fakeFetch);
    expect(file.filename).toBe("Strand am Meer.png");
    expect(file.mimeType).toBe("image/png");
    expect(Array.from(file.data)).toEqual(Array.from(png));
  });

  test("takes the MIME type from the extension, not from what the server claims", async () => {
    const jpeg = await imageExportFile({ url: "blob:x" }, "a/foto.JPG", fakeFetch);
    expect(jpeg.mimeType).toBe("image/jpeg");
  });

  test("with the file at hand nothing is requested by URL (the page's content security policy forbids it for blob: URLs)", async () => {
    const neverFetch = (async () => { throw new Error("fetch must not be used"); }) as unknown as typeof fetch;
    const blob = new Blob([png], { type: "application/x-whatever" });
    const file = await imageExportFile({ url: "blob:x", blob }, "bilder/Strand.webp", neverFetch);
    expect(file.filename).toBe("Strand.webp");
    expect(file.mimeType).toBe("image/webp");
    expect(Array.from(file.data)).toEqual(Array.from(png));
  });

  test("only files of the workspace can be saved, not addresses on the web", () => {
    expect(canSaveOriginal("Reisen/Bilder/Strand.png")).toBe(true);
    expect(canSaveOriginal("/home/anna/bloommd/a.png")).toBe(true);
    for (const address of ["https://example.com/a.png", "HTTP://example.com/a.png", "data:image/png;base64,AAAA", "blob:https://x/1"]) expect(canSaveOriginal(address)).toBe(false);
  });

  test("a failed read is an error, not an empty file", async () => {
    const failing = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(imageExportFile({ url: "blob:x" }, "a.png", failing)).rejects.toThrow("404");
  });

  test("file names are plain names: no folders, query, traversal or percent escapes", () => {
    expect(originalImageFilename("../../etc/passwd.png")).toBe("passwd.png");
    expect(originalImageFilename("img/Bild%20eins.png?raw=1")).toBe("Bild eins.png");
    expect(originalImageFilename("100%.png")).toBe("100%.png");
    expect(originalImageFilename("C:\\x\\y.png")).toBe("y.png");
    expect(originalImageFilename("")).toBe("image");
  });
});

describe("delivery", () => {
  let win: Window;
  let globalsBefore: Record<string, unknown> = {};

  beforeEach(() => {
    // What this test file finds is restored afterwards; other files in the same run install their own DOM.
    globalsBefore = { window: globalThis.window, document: globalThis.document, CustomEvent: globalThis.CustomEvent };
    win = new Window({ url: "https://bloommd.test/app" });
    globalThis.window = win as unknown as Window & typeof globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.CustomEvent = win.CustomEvent as unknown as typeof CustomEvent;
  });

  afterEach(() => {
    Object.assign(globalThis, globalsBefore);
  });

  const file = { filename: "a.png", mimeType: "image/png", data: new Uint8Array([1]) };

  test("a shell that answers the event receives the file; the browser download is skipped", async () => {
    const received: string[] = [];
    win.addEventListener(DELIVER_EXPORT_EVENT, (event) => {
      const detail = (event as CustomEvent<DeliverExportDetail>).detail;
      detail.handle(Promise.resolve().then(() => void received.push(detail.file.filename)));
    });
    let downloads = 0;
    (win.document as unknown as Document).createElement = ((original) => (tag: string) => {
      if (tag === "a") downloads += 1;
      return original.call(win.document, tag);
    })((win.document as unknown as Document).createElement) as typeof document.createElement;
    await deliverExportFile(file);
    expect(received).toEqual(["a.png"]);
    expect(downloads).toBe(0);
  });

  test("a failing native save surfaces as an error", async () => {
    win.addEventListener(DELIVER_EXPORT_EVENT, (event) => {
      (event as CustomEvent<DeliverExportDetail>).detail.handle(Promise.reject(new Error("disk full")));
    });
    await expect(deliverExportFile(file)).rejects.toThrow("disk full");
  });

  test("without a shell the browser downloads the file", async () => {
    const created: Array<{ download?: string }> = [];
    const document = win.document as unknown as Document;
    const original = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      const element = original(tag);
      if (tag === "a") {
        (element as HTMLAnchorElement).click = () => void created.push({ download: (element as HTMLAnchorElement).download });
      }
      return element;
    }) as typeof document.createElement;
    (globalThis as { URL: typeof URL }).URL.createObjectURL = () => "blob:test";
    await deliverExportFile(file);
    expect(created).toEqual([{ download: "a.png" }]);
  });
});
