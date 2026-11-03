import { describe, expect, test } from "bun:test";
import { importOpml, parseFile } from "@bloommd/core/browser";
import { buildTextExport, EXPORT_FORMATS, exportFilename } from "./export-file";

describe("export files", () => {
  test("the menu has the same five entries in the same order everywhere", () => {
    expect(EXPORT_FORMATS).toEqual(["markdown", "opml", "pdf", "png", "svg"]);
  });

  test("file names are <Title>.<extension>; characters files cannot carry become -", () => {
    expect(exportFilename("Reise", "markdown")).toBe("Reise.md");
    expect(exportFilename("Reise", "opml")).toBe("Reise.opml");
    expect(exportFilename("Plan A/B: neu", "svg")).toBe("Plan A-B- neu.svg");
    expect(exportFilename("", "png")).toBe("mindmap.png");
    expect(exportFilename(undefined, "pdf")).toBe("mindmap.pdf");
    expect(exportFilename("../geheim", "markdown")).toBe("-geheim.md");
  });

  test("Markdown and OPML exports carry the document", () => {
    const doc = parseFile("reise.md", "---\ntitle: Reise\n---\n# Reise\n\n## Hotel\n");
    const markdown = buildTextExport("markdown", doc);
    expect(markdown.filename).toBe("Reise.md");
    expect(markdown.mimeType).toBe("text/markdown");
    expect(new TextDecoder().decode(markdown.data)).toContain("## Hotel");
    const opml = buildTextExport("opml", doc);
    expect(opml.filename).toBe("Reise.opml");
    const imported = importOpml(new TextDecoder().decode(opml.data));
    expect(imported.title).toBe("Reise");
    expect(imported.markdown).toContain("## Hotel");
  });
});
