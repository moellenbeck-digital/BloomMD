import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approveWikiProposal, createWikiProposal, hashWikiContent, type WikiProposal } from "./wiki";
import {
  discardWikiProposal,
  isValidWikiProposalId,
  listOpenWikiProposals,
  loadWikiProposal,
  markWikiProposalApplied,
  toWikiProposal,
  WikiProposalStoreError,
} from "./wiki-proposals";

const roots: string[] = [];

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bloommd-proposals-"));
  roots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function proposal(id: string, createdAt = "2026-01-01T00:00:00.000Z"): WikiProposal {
  const content = "---\ntype: concept\n---\n# Page\n";
  return {
    version: 1,
    id,
    createdAt,
    changes: [{ path: "concepts/page.md", content, reason: "test", beforeHash: null, afterHash: hashWikiContent(content) }],
  };
}

async function store(dir: string, value: unknown, id: string): Promise<void> {
  await writeFile(join(dir, `${id}.json`), JSON.stringify(value), "utf8");
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WikiProposalStoreError) return error.code;
    throw error;
  }
  return "no-error";
}

describe("Wiki proposal ids", () => {
  test("accepts UUIDs and simple slugs", () => {
    expect(isValidWikiProposalId("3f2b8c1e-7d4a-4f6b-9c1d-2a5e8b7f0c11")).toBe(true);
    expect(isValidWikiProposalId("proposal_1")).toBe(true);
  });

  test("rejects anything that could leave the folder or is not a plain id", () => {
    for (const id of ["", ".", "..", "../x", "a/b", "a\\b", ".hidden", "a.json", "a b", "a\u0000b", "/etc/passwd", "x".repeat(65), 42, null, undefined]) {
      expect(isValidWikiProposalId(id)).toBe(false);
    }
  });

  test("load, discard and apply refuse an invalid id before touching the disk", async () => {
    const dir = await makeDir();
    expect(await codeOf(loadWikiProposal(dir, "../outside"))).toBe("invalid-id");
    expect(await codeOf(discardWikiProposal(dir, "../outside", { reason: "r", by: "n" }))).toBe("invalid-id");
    expect(await codeOf(markWikiProposalApplied(dir, proposal("../outside"), { by: "n" }))).toBe("invalid-id");
  });
});

describe("listOpenWikiProposals", () => {
  test("returns an empty list for a missing folder", async () => {
    const dir = await makeDir();
    expect(await listOpenWikiProposals(join(dir, "does-not-exist"))).toEqual([]);
  });

  test("lists only open proposals, oldest first, and treats a file without status as open", async () => {
    const dir = await makeDir();
    await store(dir, proposal("late", "2026-03-01T00:00:00.000Z"), "late");
    await store(dir, { ...proposal("early", "2026-01-01T00:00:00.000Z"), status: "open" }, "early");
    await store(dir, { ...proposal("done", "2026-02-01T00:00:00.000Z"), status: "applied" }, "done");
    await store(dir, { ...proposal("nope", "2026-02-01T00:00:00.000Z"), status: "discarded", discardReason: "x" }, "nope");

    const open = await listOpenWikiProposals(dir);
    expect(open.map((entry) => entry.id)).toEqual(["early", "late"]);
    expect(open.every((entry) => entry.status === "open")).toBe(true);
  });

  test("reports and skips broken files instead of hiding the rest", async () => {
    const dir = await makeDir();
    await store(dir, proposal("good"), "good");
    await writeFile(join(dir, "broken.json"), "{ not json", "utf8");
    await store(dir, proposal("other-id"), "mismatch");
    await store(dir, { version: 2 }, "wrong-version");
    await writeFile(join(dir, "notes.txt"), "ignored", "utf8");
    await writeFile(join(dir, "bad name.json"), "{}", "utf8");

    const problems: string[] = [];
    const open = await listOpenWikiProposals(dir, (file) => problems.push(file));
    expect(open.map((entry) => entry.id)).toEqual(["good"]);
    expect(problems.sort()).toEqual(["bad name.json", "broken.json", "mismatch.json", "wrong-version.json"]);
  });

  test("ignores a symlink instead of following it out of the folder", async () => {
    const dir = await makeDir();
    const outside = await makeDir();
    await store(outside, proposal("linked"), "linked");
    await symlink(join(outside, "linked.json"), join(dir, "linked.json"));
    const problems: string[] = [];
    expect(await listOpenWikiProposals(dir, (file) => problems.push(file))).toEqual([]);
    expect(problems).toEqual(["linked.json"]);
  });
});

describe("loadWikiProposal", () => {
  test("loads any status and returns null for an unknown id", async () => {
    const dir = await makeDir();
    await store(dir, { ...proposal("done"), status: "applied", appliedBy: "Ada" }, "done");
    const loaded = await loadWikiProposal(dir, "done");
    expect(loaded?.status).toBe("applied");
    expect(loaded?.appliedBy).toBe("Ada");
    expect(await loadWikiProposal(dir, "missing")).toBeNull();
  });

  test("rejects a file whose id differs from its name", async () => {
    const dir = await makeDir();
    await store(dir, proposal("a"), "b");
    expect(await codeOf(loadWikiProposal(dir, "b"))).toBe("invalid-file");
  });

  test("rejects malformed changes", async () => {
    const dir = await makeDir();
    await store(dir, { ...proposal("bad"), changes: [{ path: "x.md" }] }, "bad");
    expect(await codeOf(loadWikiProposal(dir, "bad"))).toBe("invalid-file");
    await store(dir, { ...proposal("empty"), changes: [] }, "empty");
    expect(await codeOf(loadWikiProposal(dir, "empty"))).toBe("invalid-file");
    await store(dir, { ...proposal("status"), status: "weird" }, "status");
    expect(await codeOf(loadWikiProposal(dir, "status"))).toBe("invalid-file");
  });

  test("accepts a proposal produced by createWikiProposal as is", async () => {
    const dir = await makeDir();
    const bundle = await makeDir();
    await mkdir(join(bundle, "concepts"), { recursive: true });
    const created = await createWikiProposal(bundle, [{ path: "concepts/new.md", content: "---\ntype: concept\n---\n# New\n", reason: "r", sourceIds: ["s1"] }]);
    await store(dir, created, created.id);
    const loaded = await loadWikiProposal(dir, created.id);
    expect(loaded?.status).toBe("open");
    expect(loaded?.changes[0]?.sourceIds).toEqual(["s1"]);
    expect(toWikiProposal(loaded!)).toEqual(created);
  });
});

describe("discardWikiProposal", () => {
  test("keeps the file and records reason, name and time", async () => {
    const dir = await makeDir();
    await store(dir, proposal("p1"), "p1");
    const at = new Date("2026-05-05T10:00:00.000Z");
    const discarded = await discardWikiProposal(dir, "p1", { reason: "  Nicht belegt  ", by: " Ada ", at });
    expect(discarded).toMatchObject({ status: "discarded", discardReason: "Nicht belegt", discardedBy: "Ada", discardedAt: at.toISOString() });

    expect(await readdir(dir)).toEqual(["p1.json"]);
    const onDisk = JSON.parse(await readFile(join(dir, "p1.json"), "utf8")) as Record<string, unknown>;
    expect(onDisk).toMatchObject({ status: "discarded", discardReason: "Nicht belegt", discardedBy: "Ada", id: "p1" });
    expect(await listOpenWikiProposals(dir)).toEqual([]);
    expect((await loadWikiProposal(dir, "p1"))?.status).toBe("discarded");
  });

  test("requires a reason and a name", async () => {
    const dir = await makeDir();
    await store(dir, proposal("p1"), "p1");
    expect(await codeOf(discardWikiProposal(dir, "p1", { reason: "", by: "Ada" }))).toBe("reason-required");
    expect(await codeOf(discardWikiProposal(dir, "p1", { reason: "   \n", by: "Ada" }))).toBe("reason-required");
    expect(await codeOf(discardWikiProposal(dir, "p1", { reason: "x", by: " " }))).toBe("name-required");
    expect((await loadWikiProposal(dir, "p1"))?.status).toBe("open");
  });

  test("refuses unknown and already decided proposals", async () => {
    const dir = await makeDir();
    await store(dir, proposal("p1"), "p1");
    expect(await codeOf(discardWikiProposal(dir, "unknown", { reason: "x", by: "Ada" }))).toBe("not-found");
    await discardWikiProposal(dir, "p1", { reason: "x", by: "Ada" });
    expect(await codeOf(discardWikiProposal(dir, "p1", { reason: "y", by: "Bob" }))).toBe("not-open");
    expect((await loadWikiProposal(dir, "p1"))?.discardReason).toBe("x");
  });
});

describe("markWikiProposalApplied", () => {
  test("marks an open proposal as applied and keeps the approval", async () => {
    const dir = await makeDir();
    await store(dir, proposal("p1"), "p1");
    const approved = approveWikiProposal(proposal("p1"), "Ada");
    const at = new Date("2026-05-05T10:00:00.000Z");
    const applied = await markWikiProposalApplied(dir, approved, { by: "Ada", at });
    expect(applied).toMatchObject({ status: "applied", appliedBy: "Ada", appliedAt: at.toISOString(), approvedBy: "Ada", approvedAt: approved.approvedAt });
    expect(await listOpenWikiProposals(dir)).toEqual([]);
    expect(await codeOf(markWikiProposalApplied(dir, approved, { by: "Ada" }))).toBe("not-open");
    expect(await codeOf(discardWikiProposal(dir, "p1", { reason: "x", by: "Ada" }))).toBe("not-open");
  });

  test("leaves no temporary files behind", async () => {
    const dir = await makeDir();
    await store(dir, proposal("p1"), "p1");
    await discardWikiProposal(dir, "p1", { reason: "x", by: "Ada" });
    expect((await readdir(dir)).filter((name) => name.includes(".tmp-"))).toEqual([]);
  });
});
