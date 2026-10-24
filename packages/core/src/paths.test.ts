import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  filenameForTitle,
  filenameForTitleInPath,
  normalizeFolderPath,
  normalizeMarkdownPath,
  resolveFolderPath,
  resolveMarkdownPath,
} from "./paths";

describe("filenameForTitle", () => {
  test("creates the same safe filename for all clients", () => {
    expect(filenameForTitle("Kapitel 2a")).toBe("kapitel-2a.md");
    expect(filenameForTitle("Änderungen & Fragen")).toBe("aenderungen-fragen.md");
  });

  test("falls back to a useful filename for punctuation-only titles", () => {
    expect(filenameForTitle("---")).toBe("mindmap.md");
  });

  test("keeps the existing directory when deriving a filename", () => {
    expect(filenameForTitleInPath("Buch/Teil-2/Kapitel 3.md", "Kapitel 2a")).toBe("Buch/Teil-2/kapitel-2a.md");
    expect(filenameForTitleInPath("Kapitel 3.md", "Kapitel 2a")).toBe("kapitel-2a.md");
  });
});

/**
 * Folders are real subdirectories (#5). That widens what a path may look like, so the traversal
 * guards matter more than before: every segment is checked, and containment is asserted on the
 * resolved path rather than trusted from the input.
 */

describe("normalizeMarkdownPath", () => {
  test("keeps folder segments and appends the extension", () => {
    expect(normalizeMarkdownPath("projekt/plan")).toBe("projekt/plan.md");
    expect(normalizeMarkdownPath("a/b/c/notiz.md")).toBe("a/b/c/notiz.md");
    expect(normalizeMarkdownPath("a/b/c/notiz.markdown")).toBe("a/b/c/notiz.markdown");
  });

  test("normalizes backslashes and collapses empty segments", () => {
    expect(normalizeMarkdownPath("projekt\\plan.md")).toBe("projekt/plan.md");
    expect(normalizeMarkdownPath("projekt//plan.md")).toBe("projekt/plan.md");
  });

  test("refuses traversal in any segment", () => {
    expect(() => normalizeMarkdownPath("../secrets.md")).toThrow();
    expect(() => normalizeMarkdownPath("projekt/../../secrets.md")).toThrow();
    expect(() => normalizeMarkdownPath("projekt/./plan.md")).toThrow();
  });

  test("refuses absolute paths on both platforms", () => {
    expect(() => normalizeMarkdownPath("/etc/passwd.md")).toThrow();
    expect(() => normalizeMarkdownPath("C:/Windows/plan.md")).toThrow();
  });

  test("accepts POSIX punctuation but refuses control characters", () => {
    expect(normalizeMarkdownPath('pro:jekt/Frage? "Zitat"*.md')).toBe('pro:jekt/Frage? "Zitat"*.md');
    expect(() => normalizeMarkdownPath("plan\u0000.md")).toThrow();
  });

  test("refuses empty input", () => {
    expect(() => normalizeMarkdownPath("")).toThrow();
    expect(() => normalizeMarkdownPath("   ")).toThrow();
    expect(() => normalizeMarkdownPath("///")).toThrow();
  });
});

describe("normalizeFolderPath", () => {
  test("accepts nested folders without adding an extension", () => {
    expect(normalizeFolderPath("projekt/unterordner")).toBe("projekt/unterordner");
  });

  test("applies the same traversal and absolute rules", () => {
    expect(() => normalizeFolderPath("..")).toThrow();
    expect(() => normalizeFolderPath("/tmp")).toThrow();
    expect(() => normalizeFolderPath("")).toThrow();
  });
});

describe("containment", () => {
  test("resolves a nested Markdown path inside the workspace", async () => {
    const base = await mkdtemp(join(tmpdir(), "bloommd-paths-"));
    expect(resolveMarkdownPath(base, "projekt/plan.md")).toBe(join(base, "projekt", "plan.md"));
    await rm(base, { recursive: true, force: true });
  });

  test("never resolves outside the workspace, whatever the input looks like", async () => {
    const base = await mkdtemp(join(tmpdir(), "bloommd-paths-"));
    for (const attempt of ["../escape.md", "projekt/../../escape.md", "/etc/passwd.md"]) {
      expect(() => resolveMarkdownPath(base, attempt)).toThrow();
    }
    expect(() => resolveFolderPath(base, "../escape")).toThrow();
    await rm(base, { recursive: true, force: true });
  });
});


test("title-derived names avoid Windows devices", () => {
  expect(filenameForTitle("CON")).toBe("_con.md");
  expect(filenameForTitle("LPT1")).toBe("_lpt1.md");
  expect(() => normalizeMarkdownPath("C:relative.md")).toThrow();
});
