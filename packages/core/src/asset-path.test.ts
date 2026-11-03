import { describe, expect, test } from "bun:test";
import { assetPathCandidates, imageMimeType, isImagePath, resolveAssetPath } from "./asset-path";

const workspace = (notePath: string, target: string) => {
  const result = resolveAssetPath(notePath, target);
  return result.kind === "workspace" ? result.path : result;
};

describe("resolveAssetPath", () => {
  test("resolves relative to the folder of the note", () => {
    expect(workspace("notes/reise.md", "bild.png")).toBe("notes/bild.png");
    expect(workspace("notes/reise.md", "./bild.png")).toBe("notes/bild.png");
    expect(workspace("notes/reise.md", "assets/bild.png")).toBe("notes/assets/bild.png");
    expect(workspace("reise.md", "bild.png")).toBe("bild.png");
  });

  test("climbs with ../ and treats a leading / as workspace root", () => {
    expect(workspace("notes/deep/reise.md", "../bild.png")).toBe("notes/bild.png");
    expect(workspace("notes/deep/reise.md", "../../img/a.png")).toBe("img/a.png");
    expect(workspace("notes/deep/reise.md", "/img/a.png")).toBe("img/a.png");
    expect(workspace("notes/reise.md", "./a/../b/./c.png")).toBe("notes/b/c.png");
  });

  test("handles spaces, umlauts, percent escapes and angle brackets", () => {
    expect(workspace("Reisen/Urlaub 2026.md", "Bilder/Strand am Meer.png")).toBe("Reisen/Bilder/Strand am Meer.png");
    expect(workspace("Reisen/Urlaub.md", "Bilder/Strand%20am%20Meer.png")).toBe("Reisen/Bilder/Strand am Meer.png");
    expect(workspace("Reisen/Urlaub.md", "<Bilder/Übersicht Süd.png>")).toBe("Reisen/Bilder/Übersicht Süd.png");
    expect(workspace("Reisen/Urlaub.md", "Bilder/%C3%9Cbersicht.png")).toBe("Reisen/Bilder/Übersicht.png");
    // A decomposed umlaut (a + combining diaeresis) ends up in the composed form.
    expect(workspace("a.md", "Ka\u0308se.png")).toBe("K\u00e4se.png");
  });

  test("a note known by its absolute path (desktop) resolves to an absolute path for the shell to check", () => {
    const note = "/home/anna/bloommd/Reisen/Urlaub.md";
    expect(workspace(note, "Bilder/Strand am Meer.png")).toBe("/home/anna/bloommd/Reisen/Bilder/Strand am Meer.png");
    expect(workspace(note, "../Logo.png")).toBe("/home/anna/bloommd/Logo.png");
    expect(workspace(note, "./a.png")).toBe("/home/anna/bloommd/Reisen/a.png");
    // The root of the workspace is not known here, so a root-relative path cannot be placed.
    expect(resolveAssetPath(note, "/Logo.png")).toEqual({ kind: "invalid", reason: "absolute-path" });
    // Climbing past the file system root is refused; staying inside the workspace is the shell's check.
    expect(resolveAssetPath("/a/b.md", "../../x.png")).toEqual({ kind: "invalid", reason: "escapes-workspace" });
  });

  test("keeps a literal % that is not an escape sequence", () => {
    expect(workspace("a.md", "100%.png")).toBe("100%.png");
  });

  test("normalizes backslashes", () => {
    expect(workspace("notes/a.md", "img\\b.png")).toBe("notes/img/b.png");
  });

  test("rejects every way out of the workspace", () => {
    expect(resolveAssetPath("reise.md", "../geheim.png")).toEqual({ kind: "invalid", reason: "escapes-workspace" });
    expect(resolveAssetPath("notes/reise.md", "../../geheim.png")).toEqual({ kind: "invalid", reason: "escapes-workspace" });
    expect(resolveAssetPath("notes/reise.md", "/../geheim.png")).toEqual({ kind: "invalid", reason: "escapes-workspace" });
    expect(resolveAssetPath("notes/reise.md", "a/%2e%2e/%2e%2e/%2e%2e/x.png")).toEqual({ kind: "invalid", reason: "escapes-workspace" });
    expect(resolveAssetPath("notes/reise.md", "C:\\Windows\\a.png")).toEqual({ kind: "invalid", reason: "absolute-path" });
    expect(resolveAssetPath("notes/reise.md", "file:///etc/passwd")).toEqual({ kind: "invalid", reason: "unsupported-scheme" });
    expect(resolveAssetPath("notes/reise.md", "//evil.example/a.png")).toEqual({ kind: "invalid", reason: "unsupported-scheme" });
    expect(resolveAssetPath("notes/reise.md", "javascript:alert(1)")).toEqual({ kind: "invalid", reason: "unsupported-scheme" });
    expect(resolveAssetPath("notes/reise.md", "a\u0000.png")).toEqual({ kind: "invalid", reason: "control-characters" });
    expect(resolveAssetPath("notes/reise.md", "  ")).toEqual({ kind: "invalid", reason: "empty" });
    expect(resolveAssetPath("notes/reise.md", "./")).toEqual({ kind: "invalid", reason: "empty" });
  });

  test("passes through URLs the browser loads itself", () => {
    expect(resolveAssetPath("a.md", "https://example.com/a.png")).toEqual({ kind: "remote", url: "https://example.com/a.png" });
    expect(resolveAssetPath("a.md", "data:image/png;base64,AAAA")).toEqual({ kind: "remote", url: "data:image/png;base64,AAAA" });
    expect(resolveAssetPath("a.md", "blob:https://x/1")).toEqual({ kind: "remote", url: "blob:https://x/1" });
  });
});

describe("assetPathCandidates", () => {
  test("a Markdown image has exactly one path", () => {
    expect(assetPathCandidates("notes/a.md", "img/b.png")).toEqual(["notes/img/b.png"]);
  });

  test("an Obsidian embed tries the note's folder, then the workspace root", () => {
    expect(assetPathCandidates("notes/a.md", "b.png", "wiki")).toEqual(["notes/b.png", "b.png"]);
    expect(assetPathCandidates("a.md", "b.png", "wiki")).toEqual(["b.png"]);
  });

  test("an Obsidian embed in a note with an absolute path only tries the note's folder", () => {
    expect(assetPathCandidates("/home/anna/bloommd/Reisen/a.md", "b.png", "wiki")).toEqual(["/home/anna/bloommd/Reisen/b.png"]);
  });

  test("offers the decomposed spelling of umlauts as a fallback", () => {
    expect(assetPathCandidates("a.md", "K\u00e4se.png")).toEqual(["K\u00e4se.png", "Ka\u0308se.png"]);
  });

  test("offers nothing for a path that leaves the workspace", () => {
    expect(assetPathCandidates("a.md", "../x.png")).toEqual([]);
    expect(assetPathCandidates("a.md", "../x.png", "wiki")).toEqual([]);
  });
});

describe("image types", () => {
  test("recognizes image files by extension", () => {
    expect(isImagePath("a/B.PNG")).toBe(true);
    expect(isImagePath("a.pdf")).toBe(false);
    expect(imageMimeType("x.jpg")).toBe("image/jpeg");
    expect(imageMimeType("x.svg")).toBe("image/svg+xml");
    expect(imageMimeType("x.txt")).toBeNull();
  });
});
