import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { isMarkdownPath, parseCliPath, parseExternalMarkdownUrl, parseExternalNodeId, parseExternalPath, parseExternalTarget } from "./external-file";

describe("parseExternalMarkdownUrl", () => {
  test("accepts encoded absolute Markdown paths", () => {
    // The bloommd: scheme carries the path verbatim, so it is identical on every platform.
    expect(parseExternalMarkdownUrl("bloommd://open?path=%2Ftmp%2FMy%20Map.md")).toBe("/tmp/My Map.md");

    // A file: URL must be built from a path the host platform can actually express. On Windows a
    // driveless URL like file:///tmp/map.markdown does not exist and fileURLToPath rejects it, so
    // hardcoding the POSIX form would test the fixture rather than the parser. Round-tripping a real
    // absolute path exercises what a double-click actually delivers on each platform.
    const realPath = resolve(tmpdir(), "map.markdown");
    const fromFileUrl = parseExternalMarkdownUrl(pathToFileURL(realPath).href);
    expect(fromFileUrl).toBe(realPath);
  });

  test("rejects unrelated schemes, commands and non-Markdown files", () => {
    expect(parseExternalMarkdownUrl("https://example.com/map.md")).toBeNull();
    expect(parseExternalMarkdownUrl("bloommd://delete?path=%2Ftmp%2Fmap.md")).toBeNull();
    expect(parseExternalMarkdownUrl("bloommd://open?path=relative.md")).toBeNull();
    expect(parseExternalMarkdownUrl("bloommd://open?path=%2Ftmp%2Fscript.sh")).toBeNull();
    expect(parseExternalMarkdownUrl("bloommd://user:pass@open?path=%2Ftmp%2Fmap.md")).toBeNull();
  });

  test("rejects oversized and control-character input", () => {
    expect(parseExternalMarkdownUrl(`bloommd://open?path=/${"a".repeat(16_384)}.md`)).toBeNull();
    expect(parseExternalMarkdownUrl("bloommd://open?path=/tmp/map.md\nignored")).toBeNull();
  });
});

describe("parseCliPath", () => {
  test("accepts the bloommd URI as a Linux desktop launcher argument", () => {
    expect(parseCliPath("bloommd://open?path=%2Ftmp%2FMy%20Map.md", "/workspace")).toBe("/tmp/My Map.md");
  });

  test("keeps ordinary CLI paths relative to the invoking directory", () => {
    expect(parseCliPath("notes/plan.md", "/workspace")).toBe(resolve("/workspace", "notes/plan.md"));
  });
});

describe("opening folders and command line targets", () => {
  test("accepts a folder path, which has no extension to validate", () => {
    // parseExternalPath deliberately does not judge file vs folder — only the filesystem knows.
    expect(parseExternalPath("bloommd://open?path=%2Ftmp%2Fnotes")).toBe("/tmp/notes");
    expect(isMarkdownPath("/tmp/notes")).toBe(false);
  });

  test("still rejects a non-Markdown file through the Markdown-only entry point", () => {
    expect(parseExternalMarkdownUrl("bloommd://open?path=%2Ftmp%2Fsecrets.env")).toBeNull();
    expect(parseExternalMarkdownUrl("bloommd://open?path=%2Ftmp%2Fnotes.md")).toBe("/tmp/notes.md");
  });

  test("resolves a relative command line argument against the working directory", () => {
    const cwd = resolve(tmpdir(), "notes");
    // This is what makes `bloommd .` behave like every other terminal tool.
    expect(parseCliPath(".", cwd)).toBe(resolve(cwd, "."));
    expect(parseCliPath("plan.md", cwd)).toBe(resolve(cwd, "plan.md"));
    expect(parseCliPath("../other", cwd)).toBe(resolve(cwd, "../other"));
  });

  test("keeps an absolute command line argument as given", () => {
    const absolutePath = resolve(tmpdir(), "vault");
    expect(parseCliPath(absolutePath, resolve(tmpdir(), "notes"))).toBe(absolutePath);
  });

  test("ignores flags, empty input and control characters", () => {
    const cwd = resolve(tmpdir(), "notes");
    expect(parseCliPath("--dev", cwd)).toBeNull();
    expect(parseCliPath("", cwd)).toBeNull();
    expect(parseCliPath(undefined, cwd)).toBeNull();
    expect(parseCliPath("plan\u0000.md", cwd)).toBeNull();
  });
});

describe("parseExternalTarget", () => {
  test("keeps the node to select next to the path", () => {
    expect(parseExternalTarget("bloommd://open?path=%2Ftmp%2Fnote.md&node=Ab_9-x")).toEqual({ path: "/tmp/note.md", nodeId: "Ab_9-x" });
    expect(parseExternalTarget("bloommd://open?path=%2Ftmp%2Fnote.md")).toEqual({ path: "/tmp/note.md", nodeId: null });
  });

  test("drops malformed node ids but still opens the file", () => {
    expect(parseExternalTarget("bloommd://open?path=%2Ftmp%2Fnote.md&node=%3Cscript%3E")).toEqual({ path: "/tmp/note.md", nodeId: null });
    expect(parseExternalNodeId(`bloommd://open?path=%2Fa.md&node=${"x".repeat(129)}`)).toBeNull();
    expect(parseExternalNodeId("file:///tmp/a.md?node=abc")).toBeNull();
  });

  test("rejects the same links as the path parser", () => {
    expect(parseExternalTarget("bloommd://open?path=relative.md&node=abc")).toBeNull();
    expect(parseExternalTarget("https://evil.example/open?path=%2Ftmp%2Fa.md&node=abc")).toBeNull();
  });
});
