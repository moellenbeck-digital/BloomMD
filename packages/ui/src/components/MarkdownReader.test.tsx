import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { MarkdownReader } from "./MarkdownReader";
import { installDom } from "./test-dom";

let root: Root | null = null;
let container: HTMLElement;

function render(markdown: string): HTMLElement {
  flushSync(() => root!.render(<MarkdownReader markdown={markdown} />));
  return container;
}

beforeEach(() => {
  installDom();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  flushSync(() => root?.unmount());
  root = null;
});

describe("MarkdownReader", () => {
  test("@t54 renders paragraphs, emphasis, inline code and line breaks", () => {
    const out = render("Hello **bold** and *italic* with `code` and ~~gone~~.\n\nSecond paragraph");
    expect(out.querySelectorAll("p").length).toBe(2);
    expect(out.querySelector("strong")?.textContent).toBe("bold");
    expect(out.querySelector("em")?.textContent).toBe("italic");
    expect(out.querySelector("code")?.textContent).toBe("code");
    expect(out.querySelector("del")?.textContent).toBe("gone");
  });

  test("@t54 external links open in a new tab with rel noreferrer", () => {
    const link = render("[BloomMD](https://bloommd.io/docs?a=1)").querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://bloommd.io/docs?a=1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.textContent).toBe("BloomMD");
  });

  test("@t54 reference-style links resolve their definition", () => {
    const link = render("See [the docs][d].\n\n[d]: https://example.com/docs").querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/docs");
  });

  test("@t54 unsafe link schemes are shown as text, never as an anchor", () => {
    const out = render("[click](javascript:alert(1)) [data](data:text/html;base64,PHNjcmlwdD4=) [rel](docs/other.md)");
    expect(out.querySelector("a")).toBeNull();
    expect(out.textContent).toContain("click");
    expect(out.innerHTML).not.toContain("javascript:");
  });

  test("@t54 lists render ordered, unordered and nested", () => {
    const out = render("- one\n  - nested a\n  - nested b\n- two\n\n3. three\n4. four");
    expect(out.querySelectorAll("ul").length).toBe(2);
    expect(out.querySelector("ul ul li")?.textContent).toBe("nested a");
    const ordered = out.querySelector("ol")!;
    expect(ordered.getAttribute("start")).toBe("3");
    expect(ordered.querySelectorAll("li").length).toBe(2);
  });

  test("@t54 task lists show disabled checkboxes with an accessible name", () => {
    const boxes = [...render("- [x] done\n- [ ] open").querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.length).toBe(2);
    expect(boxes.every((box) => box.disabled)).toBe(true);
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
    expect(boxes.every((box) => box.getAttribute("aria-label"))).toBe(true);
  });

  test("@t54 tables render header, body and alignment inside a scroll region", () => {
    const out = render("| Name | Wert |\n| :--- | ---: |\n| a | 1 |\n| b | 2 |");
    const region = out.querySelector<HTMLElement>("[data-testid=reading-table]")!;
    expect(region.className).toContain("overflow-x-auto");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect([...region.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(["Name", "Wert"]);
    expect(region.querySelectorAll("tbody tr").length).toBe(2);
    expect(region.querySelectorAll("tbody td")[1]!.className).toContain("text-right");
  });

  test("@t54 code blocks show their language and scroll inside themselves", () => {
    const block = render("```ts\nconst a = 1;\nconst b = 2;\n```").querySelector<HTMLElement>("[data-testid=reading-code-block]")!;
    expect(block.getAttribute("data-language")).toBe("ts");
    expect(block.querySelector("[data-testid=reading-code-language]")?.textContent).toBe("ts");
    const pre = block.querySelector("pre")!;
    expect(pre.className).toContain("overflow-x-auto");
    expect(pre.getAttribute("tabindex")).toBe("0");
    expect(pre.textContent).toBe("const a = 1;\nconst b = 2;");
  });

  test("@t54 a mermaid block is an ordinary code block with the visible language mermaid", () => {
    const source = "graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]";
    const out = render("```mermaid\n" + source + "\n```");
    const block = out.querySelector<HTMLElement>("[data-testid=reading-code-block]")!;
    expect(block.querySelector("[data-testid=reading-code-language]")?.textContent).toBe("mermaid");
    expect(block.querySelector("pre")?.textContent).toBe(source);
    expect(out.querySelector("svg")).toBeNull();
    expect(out.querySelector("iframe, canvas, script")).toBeNull();
  });

  test("@t54 a code block without a language gets the plain-text label", () => {
    const block = render("```\nplain\n```").querySelector("[data-testid=reading-code-language]")!;
    expect(block.textContent).toBe("Text");
  });

  test("@t54 images render with alt text; unsafe sources fall back to the alt text", () => {
    const out = render("![A chart](https://example.com/chart.png)\n\n![Bad](javascript:alert(1))");
    const images = out.querySelectorAll("img");
    expect(images.length).toBe(1);
    expect(images[0]!.getAttribute("src")).toBe("https://example.com/chart.png");
    expect(images[0]!.getAttribute("alt")).toBe("A chart");
    expect(images[0]!.className).toContain("max-w-full");
    expect(out.textContent).toContain("Bad");
  });

  test("@t54 raw HTML is shown as text and never becomes an element", () => {
    const out = render("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nText <b>inline</b>");
    expect(out.querySelector("script")).toBeNull();
    expect(out.querySelector("img")).toBeNull();
    expect(out.querySelector("b")).toBeNull();
    expect(out.textContent).toContain("<script>alert(1)</script>");
  });

  test("@t54 HTML comments stay hidden", () => {
    const out = render("<!-- note to self -->\n\nVisible");
    expect(out.textContent).toBe("Visible");
  });

  test("@t54 blockquotes and thematic breaks render", () => {
    const out = render("> quoted\n\n---\n\nafter");
    expect(out.querySelector("blockquote")?.textContent).toBe("quoted");
    expect(out.querySelector("hr")).not.toBeNull();
  });

  test("@t54 nothing in the output is editable", () => {
    const out = render("# Title\n\n- [x] done\n\n| a |\n| - |\n| b |\n\n```ts\nx\n```");
    expect(out.querySelector("[contenteditable], textarea, input:not([disabled]), button")).toBeNull();
  });
});
