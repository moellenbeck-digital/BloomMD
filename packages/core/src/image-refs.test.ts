import { describe, expect, test } from "bun:test";
import { extractImageRefs } from "./image-refs";

describe("extractImageRefs", () => {
  test("finds Markdown images and Obsidian embeds in order with their lines", () => {
    const refs = extractImageRefs(["Text", "![Strand](img/strand.png) und ![[Karte süd.jpg|300]]", "![[Notiz]] ![](<a b.webp> \"Titel\")"].join("\n"));
    expect(refs).toEqual([
      { syntax: "markdown", target: "img/strand.png", alt: "Strand", line: 2 },
      { syntax: "wiki", target: "Karte süd.jpg", alt: "", width: 300, line: 2 },
      { syntax: "markdown", target: "<a b.webp>", alt: "", line: 3 },
    ]);
  });

  test("reads Obsidian alt text and width x height", () => {
    expect(extractImageRefs("![[a.png|Ein Bild]]")[0]).toMatchObject({ alt: "Ein Bild" });
    expect(extractImageRefs("![[a.png|120x80]]")[0]).toMatchObject({ width: 120, height: 80 });
  });

  test("accepts spaces in a path that is not bracketed", () => {
    expect(extractImageRefs("![x](my image.png)")[0]).toMatchObject({ target: "my image.png" });
  });

  test("ignores examples in code and embeds of notes", () => {
    const text = ["```md", "![x](a.png)", "```", "Inline `![[b.png]]` hier", "![[Andere Notiz]]", "![[doc.pdf]]"].join("\n");
    expect(extractImageRefs(text)).toEqual([]);
  });
});
