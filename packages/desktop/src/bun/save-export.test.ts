import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeExportName, saveExportFile } from "./save-export";

const directories: string[] = [];
afterEach(async () => {
  while (directories.length) await rm(directories.pop()!, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-export-"));
  directories.push(directory);
  return directory;
}

describe("safeExportName", () => {
  test("accepts the five export formats only", () => {
    for (const extension of ["md", "opml", "pdf", "png", "svg"]) expect(safeExportName(`Karte.${extension}`)).toBe(`Karte.${extension}`);
    expect(safeExportName("karte.exe")).toBeNull();
    expect(safeExportName("karte")).toBeNull();
    expect(safeExportName("")).toBeNull();
  });

  test("keeps path parts and unsafe characters out of the name", () => {
    expect(safeExportName("../../etc/passwd.md")).toBe("passwd.md");
    expect(safeExportName("C:\\Users\\x\\Karte.png")).toBe("Karte.png");
    expect(safeExportName("a:b*c.svg")).toBe("a-b-c.svg");
    expect(safeExportName(".hidden.md")).toBe("hidden.md");
  });
});

describe("saveExportFile", () => {
  test("writes the decoded bytes and never overwrites an existing file", async () => {
    const directory = await tempDir();
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]);
    const first = await saveExportFile(directory, "Karte.png", data.toString("base64"));
    const second = await saveExportFile(directory, "Karte.png", Buffer.from("zwei").toString("base64"));
    expect(first).toEqual({ path: join(directory, "Karte.png") });
    expect(second).toEqual({ path: join(directory, "Karte (1).png") });
    expect(Buffer.compare(await readFile(join(directory, "Karte.png")), data)).toBe(0);
    expect(await readFile(join(directory, "Karte (1).png"), "utf8")).toBe("zwei");
    expect((await readdir(directory)).sort()).toEqual(["Karte (1).png", "Karte.png"]);
  });

  test("refuses unsupported names and oversized data", async () => {
    const directory = await tempDir();
    expect(await saveExportFile(directory, "x.sh", "AAAA")).toEqual({ error: "Unsupported export file name." });
    expect(await saveExportFile(directory, "x.md", "A".repeat(90 * 1024 * 1024))).toEqual({ error: "The export is too large." });
    expect(await readdir(directory)).toEqual([]);
  });

  test("creates the target folder when it is missing", async () => {
    const directory = join(await tempDir(), "Downloads");
    const result = await saveExportFile(directory, "Karte.opml", Buffer.from("<opml/>").toString("base64"));
    expect(result).toEqual({ path: join(directory, "Karte.opml") });
  });
});
