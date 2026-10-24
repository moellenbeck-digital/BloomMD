import { describe, expect, test } from "bun:test";
import { createInkDocument, INK_FORMAT, InkFormatError, inkViewBox, isInkSvg, linkTargetsPath, parseInkSvg, retargetInkLinks, serializeInkSvg, type InkDocument } from "./ink-document";
import type { InkStroke } from "./ink-geometry";

const zigzag = (id: string, offsetX = 0, tool: InkStroke["tool"] = "pen"): InkStroke => ({
  id,
  tool,
  color: "#1f2937",
  size: 4,
  points: [
    [offsetX + 10.123, 20.456, 0.31],
    [offsetX + 30, 60, 0.52],
    [offsetX + 50, 20, 0.73],
    [offsetX + 70, 60, 0.61],
  ],
});

const drawing = (overrides: Partial<InkDocument> = {}): InkDocument => ({
  ...createInkDocument(),
  strokes: [zigzag("s1"), zigzag("s2", 100, "highlighter")],
  links: [{ id: "l1", target: "Arbeit", strokeIds: ["s1"] }],
  ...overrides,
});

describe("serializeInkSvg / parseInkSvg", () => {
  test("round-trips strokes and links, rounded to two decimals", () => {
    const parsed = parseInkSvg(serializeInkSvg(drawing()));
    expect(parsed?.readOnly).toBe(false);
    expect(parsed?.document.links).toEqual([{ id: "l1", target: "Arbeit", strokeIds: ["s1"] }]);
    expect(parsed?.document.strokes.map((stroke) => stroke.id)).toEqual(["s1", "s2"]);
    expect(parsed?.document.strokes[0]?.points[0]).toEqual([10.12, 20.46, 0.31]);
    expect(parsed?.document.strokes[1]?.tool).toBe("highlighter");
  });

  test("is stable across repeated save and load cycles", () => {
    const first = serializeInkSvg(drawing());
    const second = serializeInkSvg(parseInkSvg(first)!.document);
    expect(second).toBe(first);
  });

  test("keeps link targets with XML special characters valid in XML and JSON", () => {
    const target = "Formeln <ΔU> & Q ]]> W";
    const svg = serializeInkSvg(drawing({ links: [{ id: "l1", target, strokeIds: ["s1"] }] }));
    const metadata = /<metadata id="bloommd-ink">([\s\S]*?)<\/metadata>/.exec(svg)?.[1] ?? "";
    expect(metadata).not.toMatch(/[<>&]/);
    expect(parseInkSvg(svg)?.document.links[0]?.target).toBe(target);
  });

  test("uses the stroke bounding box plus padding as viewBox", () => {
    const box = inkViewBox(drawing({ strokes: [zigzag("s1")] }));
    // Points span x 10.123..70 and y 20.456..60, widened by half the stroke size (2) and 16 padding.
    expect(box).toEqual({ minX: -8, minY: 2, maxX: 88, maxY: 78 });
    const svg = serializeInkSvg(drawing({ strokes: [zigzag("s1")] }));
    expect(svg).toContain('viewBox="-8 2 96 76"');
    expect(svg).toContain('width="96" height="76"');
  });

  test("writes an empty drawing with a default canvas", () => {
    const svg = serializeInkSvg(createInkDocument());
    expect(svg).toContain('viewBox="-16 -16 352 212"');
    expect(parseInkSvg(svg)?.document.strokes).toEqual([]);
  });

  test("renders a paper background, pen paths and translucent highlighter paths", () => {
    const svg = serializeInkSvg(drawing());
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toMatch(/<path data-stroke-id="s1" d="M[^"]+Z" fill="#1f2937"\/>/);
    expect(svg).toMatch(/<path data-stroke-id="s2" d="M[^"]+Z" fill="#1f2937" fill-opacity="0.35"\/>/);
    expect(serializeInkSvg(drawing({ background: "transparent" }))).not.toContain("<rect");
  });

  test("returns null for ordinary SVG files", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
    expect(isInkSvg(svg)).toBe(false);
    expect(parseInkSvg(svg)).toBeNull();
  });

  test("throws instead of returning an empty drawing when BloomMD data is damaged", () => {
    const valid = serializeInkSvg(drawing());
    expect(() => parseInkSvg(valid.replace(/<metadata[\s\S]*<\/metadata>/, ""))).toThrow(InkFormatError);
    expect(() => parseInkSvg(valid.replace(/"strokes":\[/, '"strokes":[{'))).toThrow(InkFormatError);
    expect(() => parseInkSvg(valid.replace(`"format":"${INK_FORMAT}"`, '"format":"other"'))).toThrow(InkFormatError);
    expect(() => parseInkSvg(valid.replace('"tool":"pen"', '"tool":"brush"'))).toThrow(/unknown tool/);
  });

  test("opens drawings from newer plugin versions read-only", () => {
    const svg = serializeInkSvg(drawing()).replace('"version":1', '"version":3');
    expect(parseInkSvg(svg)?.readOnly).toBe(true);
  });

  test("writes version 2 only for typed text or dark paper, so older plugins keep editing the rest", () => {
    const plain = serializeInkSvg(drawing());
    expect(plain).toContain('"version":1');
    expect(plain).toContain('data-bloommd-ink="1"');
    const text = { id: "t1", x: 0, y: 0, text: "Arbeit", size: 22, color: "#1f2937" };
    for (const svg of [serializeInkSvg(drawing({ texts: [text] })), serializeInkSvg(drawing({ background: "dark" }))]) {
      expect(svg).toContain('"version":2');
      expect(svg).toContain('data-bloommd-ink="2"');
      expect(parseInkSvg(svg)?.readOnly).toBe(false);
    }
    // An emptied text box is not saved and does not need version 2.
    expect(serializeInkSvg(drawing({ texts: [{ ...text, text: " " }] }))).toContain('"version":1');
  });

  test("opens newer drawings with unknown tools or fields read-only instead of failing", () => {
    const svg = serializeInkSvg(drawing())
      // Newer than INK_VERSION (2 since typed text and dark paper).
      .replace('"version":1', '"version":3')
      .replace('"tool":"pen"', '"tool":"brush","texture":"chalk"')
      .replace('"color":"#1f2937"', '"color":{"gradient":["#000","#fff"]}');
    const parsed = parseInkSvg(svg);
    expect(parsed?.readOnly).toBe(true);
    expect(parsed?.document.strokes[0]).toMatchObject({ id: "s1", tool: "pen", color: "#1f2937" });
  });

  test("keeps strokes that were scaled down to a zero width editable", () => {
    const tiny = drawing({ strokes: [{ ...zigzag("s1"), size: 0.001 }], links: [] });
    const parsed = parseInkSvg(serializeInkSvg(tiny));
    expect(parsed?.document.strokes[0]?.size).toBeGreaterThan(0);
    const zero = serializeInkSvg(drawing()).replace('"size":4', '"size":0');
    expect(parseInkSvg(zero)?.document.strokes[0]?.size).toBeGreaterThan(0);
  });

  test("simplifies nearly collinear samples to keep files small", () => {
    const dense: InkStroke = {
      id: "dense",
      tool: "pen",
      color: "#000",
      size: 3,
      points: Array.from({ length: 200 }, (_, index) => [index, index * 0.5 + (index % 2) * 0.01, 0.5] as [number, number, number]),
    };
    const parsed = parseInkSvg(serializeInkSvg(drawing({ strokes: [dense], links: [] })));
    expect(parsed?.document.strokes[0]?.points.length).toBeLessThan(10);
  });
});

describe("retargetInkLinks", () => {
  const linked = (target: string): InkDocument => drawing({ links: [{ id: "l1", target, strokeIds: ["s1"] }] });

  test("matches shortest, full and heading links to the renamed note", () => {
    expect(linkTargetsPath("Arbeit", "Physik/Arbeit.md")).toBe(true);
    expect(linkTargetsPath("Physik/Arbeit", "Physik/Arbeit.md")).toBe(true);
    expect(linkTargetsPath("Arbeit#Definition", "Physik/Arbeit.md")).toBe(true);
    expect(linkTargetsPath("Mechanische Arbeit", "Physik/Arbeit.md")).toBe(false);
    expect(linkTargetsPath("beit", "Physik/Arbeit.md")).toBe(false);
  });

  test("rewrites matching links and keeps headings", () => {
    expect(retargetInkLinks(linked("Arbeit#Definition"), "Physik/Arbeit.md", "Mechanische Arbeit").links[0]?.target).toBe("Mechanische Arbeit#Definition");
  });

  test("leaves links that still resolve to another note with the same name", () => {
    const document = linked("Arbeit");
    const resolve = (target: string) => (target === "Arbeit" ? "Chemie/Arbeit.md" : null);
    expect(retargetInkLinks(document, "Physik/Arbeit.md", "Mechanische Arbeit", resolve)).toBe(document);
    expect(retargetInkLinks(document, "Physik/Arbeit.md", "Mechanische Arbeit", () => null).links[0]?.target).toBe("Mechanische Arbeit");
  });

  test("returns the same document when nothing matches", () => {
    const document = linked("Wärme");
    expect(retargetInkLinks(document, "Physik/Arbeit.md", "Mechanische Arbeit")).toBe(document);
  });
});

describe("backgrounds", () => {
  test("dark paper is written and read back", () => {
    const svg = serializeInkSvg(drawing({ background: "dark" }));
    expect(svg).toContain('fill="#1c1c1e"');
    expect(parseInkSvg(svg)?.document.background).toBe("dark");
    expect(parseInkSvg(serializeInkSvg(drawing({ background: "transparent" })))?.document.background).toBe("transparent");
  });
});

describe("text boxes", () => {
  const withText = (text: string) => drawing({
    links: [{ id: "l1", target: "Arbeit", strokeIds: ["t1"] }],
    texts: [{ id: "t1", x: 10.123, y: 200, text, size: 22, color: "#1f2937" }],
  });

  test("round-trip, render as searchable SVG text and extend the view box", () => {
    const svg = serializeInkSvg(withText("Arbeit W = −p·ΔV\nzweite Zeile"));
    expect(svg).toContain('<text data-text-id="t1" x="10.12" y="200" font-size="22"');
    expect(svg).toContain(">Arbeit W = −p·ΔV</tspan>");
    expect(svg).toContain('dy="27.5">zweite Zeile</tspan>');
    const parsed = parseInkSvg(svg)!.document;
    expect(parsed.texts).toEqual([{ id: "t1", x: 10.12, y: 200, text: "Arbeit W = −p·ΔV\nzweite Zeile", size: 22, color: "#1f2937" }]);
    expect(inkViewBox(parsed).maxY).toBeGreaterThanOrEqual(255);
  });

  test("escape markup in text and drop empty boxes", () => {
    expect(serializeInkSvg(withText("a < b & c"))).toContain(">a &lt; b &amp; c</tspan>");
    expect(parseInkSvg(serializeInkSvg(withText("   ")))!.document.texts).toBeUndefined();
  });

  test("reject damaged text data", () => {
    const svg = serializeInkSvg(withText("x")).replace('"size":22', '"size":-1');
    expect(() => parseInkSvg(svg)).toThrow(/invalid size/);
  });
});
