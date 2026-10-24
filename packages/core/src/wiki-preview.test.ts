import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractWikiResources, initWikiBundle, type WikiPage } from "./wiki";
import {
  citationSummary,
  describePageResources,
  describeResource,
  pageCitations,
  PreviewRefused,
  requestResourcePreview,
} from "./wiki-preview";

let rootDir = "";

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "bloommd-wiki-preview-"));
  await initWikiBundle(rootDir, "Preview Wiki");
  await mkdir(join(rootDir, "assets"), { recursive: true });
  await writeFile(join(rootDir, "assets/diagram.png"), "fake-png-bytes");
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function referenceFor(markdown: string) {
  const references = extractWikiResources(markdown);
  if (!references[0]) throw new Error("Test markdown produced no reference.");
  return references[0];
}

describe("classification does not act", () => {
  test("a local file that exists is available with its size", async () => {
    const result = await describeResource(rootDir, referenceFor("![d](assets/diagram.png)"));
    expect(result.availability).toBe("available");
    expect(result.byteSize).toBe("fake-png-bytes".length);
  });

  test("a local file that is missing is reported, not hidden", async () => {
    // Hiding a broken reference is how a bundle quietly rots: nobody sees what needs fixing.
    const result = await describeResource(rootDir, referenceFor("![d](assets/gone.png)"));
    expect(result.availability).toBe("missing");
    expect(result.reason).toMatch(/existiert/i);
  });

  test("a remote target needs consent and is never contacted during classification", async () => {
    const result = await describeResource(rootDir, referenceFor("![d](https://example.com/x.png)"));
    expect(result.availability).toBe("needs-consent");
    expect(result.resolvedPath).toBeNull();
  });

  test("a traversing path is refused", async () => {
    const result = await describeResource(rootDir, referenceFor("![d](../../etc/passwd)"));
    expect(result.availability).toBe("unsafe");
  });

  test("an absolute path is refused", async () => {
    const result = await describeResource(rootDir, referenceFor("![d](/etc/passwd)"));
    expect(result.availability).toBe("unsafe");
  });

  test("a non-http scheme is refused", async () => {
    const result = await describeResource(rootDir, referenceFor("[x](file:///etc/passwd)"));
    expect(result.availability).toBe("unsafe");
  });

  test("a directory is reported as missing rather than previewed", async () => {
    const result = await describeResource(rootDir, referenceFor("![d](assets)"));
    expect(result.availability).toBe("missing");
  });

  test("every reference on a page is classified", async () => {
    const page = {
      content: "![a](assets/diagram.png)\n![b](assets/gone.png)\n[c](https://example.com)\n[[Some Page]]\n",
    };
    const results = await describePageResources(rootDir, page as Pick<WikiPage, "content">);
    expect(results.map((result) => result.availability).sort()).toEqual([
      "available",
      "available",
      "missing",
      "needs-consent",
    ]);
  });
});

describe("previews happen only on request", () => {
  test("a local file is read when asked", async () => {
    const payload = await requestResourcePreview(rootDir, referenceFor("![d](assets/diagram.png)"));
    expect(payload.bytes).not.toBeNull();
    expect(payload.byteSize).toBe("fake-png-bytes".length);
  });

  test("a remote target is refused without explicit consent", async () => {
    const reference = referenceFor("![d](https://example.com/x.png)");
    await expect(requestResourcePreview(rootDir, reference)).rejects.toThrow(PreviewRefused);
  });

  test("with consent the URL is handed back rather than fetched", async () => {
    // The request belongs at the layer that can see the user, not inside a library a background
    // job could call.
    const reference = referenceFor("![d](https://example.com/x.png)");
    const payload = await requestResourcePreview(rootDir, reference, { allowRemote: true });
    expect(payload.remoteUrl).toBe("https://example.com/x.png");
    expect(payload.bytes).toBeNull();
  });

  test("a missing file is refused with a reason", async () => {
    const reference = referenceFor("![d](assets/gone.png)");
    await expect(requestResourcePreview(rootDir, reference)).rejects.toThrow(/fehlt|existiert/i);
  });

  test("an unsafe target is refused even when asked directly", async () => {
    const reference = referenceFor("![d](../../etc/passwd)");
    await expect(requestResourcePreview(rootDir, reference)).rejects.toThrow(PreviewRefused);
  });

  test("a file above the size limit is refused", async () => {
    const reference = referenceFor("![d](assets/diagram.png)");
    await expect(requestResourcePreview(rootDir, reference, { maxBytes: 4 })).rejects.toThrow(/Limit/i);
  });
});

describe("page-level citations", () => {
  const page = {
    sources: [
      { id: "s1", resource: "https://example.com/a", contentHash: "sha256:aaa", title: "A", retrievedAt: "2026-01-01" },
      { id: "s2", resource: "https://example.com/b", contentHash: "sha256:bbb" },
      { id: "s3", resource: "https://example.com/c" },
    ],
  } as WikiPage;

  test("exposes the metadata a reader needs to check a claim", () => {
    const citations = pageCitations(page);
    expect(citations[0]).toMatchObject({ id: "s1", resource: "https://example.com/a", title: "A", drifted: false });
    expect(citations[2]!.contentHash).toBeNull();
  });

  test("a source whose text changed is marked as drifted", () => {
    // This is the moment a generated claim stops being supported by what it cites.
    const citations = pageCitations(page, { s1: "sha256:different", s2: "sha256:bbb", s3: "" });
    expect(citations[0]!.drifted).toBe(true);
    expect(citations[1]!.drifted).toBe(false);
  });

  test("a citation the bundle does not know is marked unknown", () => {
    const citations = pageCitations(page, { s1: "sha256:aaa" });
    expect(citations[1]!.unknown).toBe(true);
    expect(citations[0]!.unknown).toBe(false);
  });

  test("without known hashes nothing is claimed to be unknown", () => {
    expect(pageCitations(page).every((citation) => !citation.unknown)).toBe(true);
  });

  test("the summary counts what a badge needs", () => {
    const citations = pageCitations(page, { s1: "sha256:different", s2: "sha256:bbb" });
    expect(citationSummary(citations)).toEqual({ total: 3, drifted: 1, unknown: 1, withoutHash: 1 });
  });

  test("a page with no sources summarises to zero rather than failing", () => {
    expect(citationSummary(pageCitations({ sources: [] } as unknown as WikiPage))).toMatchObject({ total: 0 });
  });
});
