import { describe, expect, test } from "bun:test";
import { shareExportFile, type ExportShareDeps } from "./export-share";

function deps(overrides: Partial<ExportShareDeps> = {}) {
  const calls: string[] = [];
  const written: Array<{ path: string; data: string }> = [];
  const shared: Array<{ title: string; files: string[] }> = [];
  const result: ExportShareDeps = {
    writeFile: async (path, data) => { calls.push("write"); written.push({ path, data }); return `file:///cache/${path}`; },
    removeFile: async (path) => { calls.push(`remove:${path}`); },
    canShare: async () => true,
    share: async (options) => { calls.push("share"); shared.push(options); },
    download: () => { calls.push("download"); },
    ...overrides,
  };
  return { result, calls, written, shared };
}

const file = { filename: "Reise.opml", mimeType: "text/x-opml+xml", data: new TextEncoder().encode("<opml/>") };

describe("shareExportFile", () => {
  test("writes the file to the cache, shares its URI and removes the copy", async () => {
    const { result, calls, written, shared } = deps();
    expect(await shareExportFile(file, result)).toBe("shared");
    expect(written).toEqual([{ path: "exports/Reise.opml", data: btoa("<opml/>") }]);
    expect(shared).toEqual([{ title: "Reise.opml", files: ["file:///cache/exports/Reise.opml"] }]);
    expect(calls).toEqual(["write", "share", "remove:exports/Reise.opml"]);
  });

  test("a dismissed share sheet is not an error", async () => {
    const { result, calls } = deps({ share: async () => { throw new Error("Share canceled"); } });
    expect(await shareExportFile(file, result)).toBe("cancelled");
    expect(calls).toContain("remove:exports/Reise.opml");
  });

  test("other share failures surface, after the temporary copy is removed", async () => {
    const { result, calls } = deps({ share: async () => { throw new Error("no activity"); } });
    await expect(shareExportFile(file, result)).rejects.toThrow("no activity");
    expect(calls).toContain("remove:exports/Reise.opml");
  });

  test("without a native share sheet the file is downloaded", async () => {
    const { result, calls } = deps({ canShare: async () => false });
    expect(await shareExportFile(file, result)).toBe("downloaded");
    expect(calls).toEqual(["download"]);
  });

  test("a failing cleanup does not fail the export", async () => {
    const { result } = deps({ removeFile: async () => { throw new Error("busy"); } });
    expect(await shareExportFile(file, result)).toBe("shared");
  });
});
