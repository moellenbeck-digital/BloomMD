import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWikiProposal, hashWikiContent, initWikiBundle, regenerateWikiIndex } from "@bloommd/core/wiki";

let session: { provider: "local"; email: string; name?: string; createdAt: number } | null = null;

mock.module("../../../../lib/auth", () => ({
  getSession: async () => session,
}));

const list = await import("./route");
const approve = await import("./[id]/approve/route");
const discard = await import("./[id]/discard/route");
const publicWiki = await import("../route");

const ORIGIN = "https://app.bloommd.test";
const ENV_KEYS = ["BLOOMMD_WIKI_PROPOSALS_DIR", "BLOOMMD_WIKI_DIR", "BLOOMMD_WIKI_SOURCE_HASHES", "BLOOMMD_WIKI_PUBLIC"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const PAGE = "---\ntype: concept\ntitle: Launch\n---\n# Launch\n\nInitial.\n";
const SOURCE_HASH = hashWikiContent("source body");
const proposedPage = (body: string, hash = SOURCE_HASH) =>
  `---\ntype: concept\ntitle: Launch\nsources:\n  - id: "docs:launch"\n    resource: "docs/launch.md"\n    contentHash: "${hash}"\n---\n# Launch\n\n${body}\n`;

let wikiDir = "";
let proposalsDir = "";
const roots: string[] = [];

async function seed(content: string, path = "concepts/launch.md", extra: Record<string, unknown> = {}): Promise<string> {
  const proposal = await createWikiProposal(wikiDir, [{ path, content, reason: "Neuer Stand", sourceIds: ["docs:launch"] }]);
  await writeFile(join(proposalsDir, `${proposal.id}.json`), JSON.stringify({ ...proposal, ...extra }), "utf8");
  return proposal.id;
}

const post = (handler: { POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }, id: string, body?: unknown, headers: Record<string, string> = { Origin: ORIGIN }) =>
  handler.POST(
    new Request(`${ORIGIN}/api/wiki/proposals/${id}/x`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(async () => {
  wikiDir = await mkdtemp(join(tmpdir(), "bloommd-app-wiki-"));
  proposalsDir = await mkdtemp(join(tmpdir(), "bloommd-app-proposals-"));
  roots.push(wikiDir, proposalsDir);
  await initWikiBundle(wikiDir, "Test");
  await writeFile(join(wikiDir, "concepts/launch.md"), PAGE, "utf8");
  await regenerateWikiIndex(wikiDir);
  process.env.BLOOMMD_WIKI_PROPOSALS_DIR = proposalsDir;
  process.env.BLOOMMD_WIKI_DIR = wikiDir;
  delete process.env.BLOOMMD_WIKI_SOURCE_HASHES;
  delete process.env.BLOOMMD_WIKI_PUBLIC;
  session = { provider: "local", email: "ada@bloommd.test", name: "Ada Lovelace", createdAt: Date.now() };
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("feature switch", () => {
  test("everything answers 404 while BLOOMMD_WIKI_PROPOSALS_DIR is unset", async () => {
    const id = await seed(proposedPage("Neu."));
    delete process.env.BLOOMMD_WIKI_PROPOSALS_DIR;
    expect((await list.GET()).status).toBe(404);
    expect((await post(approve, id)).status).toBe(404);
    expect((await post(discard, id, { reason: "x" })).status).toBe(404);
    expect(await readFile(join(wikiDir, "concepts/launch.md"), "utf8")).toBe(PAGE);
  });

  test("it also stays off without the bundle it would apply to", async () => {
    delete process.env.BLOOMMD_WIKI_DIR;
    expect((await list.GET()).status).toBe(404);
  });

  test("the public route never carries proposals", async () => {
    process.env.BLOOMMD_WIKI_PUBLIC = "1";
    await seed(proposedPage("Neu."));
    const response = await publicWiki.GET();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("proposal");
    expect(text).not.toContain("Neu.");
  });

  test("GET is the only verb on the list route and the actions are POST only", () => {
    expect(Object.keys(list).filter((key) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(key))).toEqual(["GET"]);
    expect(Object.keys(approve).filter((key) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(key))).toEqual(["POST"]);
    expect(Object.keys(discard).filter((key) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(key))).toEqual(["POST"]);
  });
});

describe("authentication", () => {
  test("list, approve and discard answer 401 without a session", async () => {
    const id = await seed(proposedPage("Neu."));
    session = null;
    expect((await list.GET()).status).toBe(401);
    expect((await post(approve, id)).status).toBe(401);
    expect((await post(discard, id, { reason: "x" })).status).toBe(401);
    expect(await readFile(join(wikiDir, "concepts/launch.md"), "utf8")).toBe(PAGE);
    expect(JSON.parse(await readFile(join(proposalsDir, `${id}.json`), "utf8")).status).toBeUndefined();
  });

  test("a cross-origin POST is refused", async () => {
    const id = await seed(proposedPage("Neu."));
    expect((await post(approve, id, undefined, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await post(approve, id, undefined, {})).status).toBe(403);
    expect((await post(discard, id, { reason: "x" }, { Origin: "https://evil.example" })).status).toBe(403);
  });
});

describe("GET /api/wiki/proposals", () => {
  test("shows changes with before and after, sources with hash status, and the reviewer name", async () => {
    process.env.BLOOMMD_WIKI_SOURCE_HASHES = join(proposalsDir, "..", `hashes-${Date.now()}.json`);
    await writeFile(process.env.BLOOMMD_WIKI_SOURCE_HASHES, JSON.stringify({ "docs:launch": SOURCE_HASH }), "utf8");
    roots.push(process.env.BLOOMMD_WIKI_SOURCE_HASHES);
    const id = await seed(proposedPage("Neu."));

    const response = await list.GET();
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body.reviewer).toBe("Ada Lovelace");
    expect(body.sourceVerification).toBe("verified");
    expect(body.proposals).toHaveLength(1);
    const proposal = body.proposals[0];
    expect(proposal).toMatchObject({ id, pageChanged: false, canApprove: true, hasSources: true });
    expect(proposal.changes[0]).toMatchObject({ path: "concepts/launch.md", reason: "Neuer Stand", before: PAGE, pageChanged: false });
    expect(proposal.changes[0].after).toContain("Neu.");
    expect(proposal.sources).toEqual([{ id: "docs:launch", resource: "docs/launch.md", title: null, contentHash: SOURCE_HASH, hashStatus: "unchanged", paths: ["concepts/launch.md"] }]);
  });

  test("reports a changed source, a source without hash and an unverifiable source", async () => {
    process.env.BLOOMMD_WIKI_SOURCE_HASHES = join(proposalsDir, "..", `hashes-${Date.now()}.json`);
    await writeFile(process.env.BLOOMMD_WIKI_SOURCE_HASHES, JSON.stringify({ "docs:launch": hashWikiContent("newer") }), "utf8");
    roots.push(process.env.BLOOMMD_WIKI_SOURCE_HASHES);
    await seed(proposedPage("Neu."));
    const body = await (await list.GET()).json() as Record<string, any>;
    expect(body.proposals[0].sources[0].hashStatus).toBe("changed");

    delete process.env.BLOOMMD_WIKI_SOURCE_HASHES;
    const unverified = await (await list.GET()).json() as Record<string, any>;
    expect(unverified.sourceVerification).toBe("unavailable");
    expect(unverified.proposals[0].sources[0].hashStatus).toBe("unverified");

    const noHash = "---\ntype: concept\nsources:\n  - id: \"docs:other\"\n    resource: \"docs/other.md\"\n---\n# X\n";
    const otherDir = await mkdtemp(join(tmpdir(), "bloommd-app-proposals-"));
    roots.push(otherDir);
    process.env.BLOOMMD_WIKI_PROPOSALS_DIR = otherDir;
    const proposal = await createWikiProposal(wikiDir, [{ path: "concepts/other.md", content: noHash, reason: "r", sourceIds: ["docs:other"] }]);
    await writeFile(join(otherDir, `${proposal.id}.json`), JSON.stringify(proposal), "utf8");
    const result = await (await list.GET()).json() as Record<string, any>;
    expect(result.proposals[0].sources[0]).toMatchObject({ id: "docs:other", hashStatus: "no-hash" });
    expect(result.proposals[0].changes[0].before).toBeNull();
  });

  test("a proposal without any source is recognisable", async () => {
    const content = "---\ntype: concept\n---\n# Bare\n";
    const proposal = await createWikiProposal(wikiDir, [{ path: "concepts/bare.md", content, reason: "r" }]);
    await writeFile(join(proposalsDir, `${proposal.id}.json`), JSON.stringify(proposal), "utf8");
    const body = await (await list.GET()).json() as Record<string, any>;
    expect(body.proposals[0]).toMatchObject({ hasSources: false, sources: [] });
  });

  test("flags a proposal whose page changed since creation and blocks approval", async () => {
    await seed(proposedPage("Neu."));
    await writeFile(join(wikiDir, "concepts/launch.md"), `${PAGE}\nAndere Änderung.\n`, "utf8");
    const body = await (await list.GET()).json() as Record<string, any>;
    expect(body.proposals[0]).toMatchObject({ pageChanged: true, canApprove: false });
    expect(body.proposals[0].changes[0].pageChanged).toBe(true);
    expect(body.proposals[0].changes[0].before).toContain("Andere Änderung.");
  });

  test("lists only open proposals", async () => {
    await seed(proposedPage("Eins."));
    await seed(proposedPage("Zwei."), "concepts/two.md", { status: "applied" });
    await seed(proposedPage("Drei."), "concepts/three.md", { status: "discarded", discardReason: "x" });
    const body = await (await list.GET()).json() as Record<string, any>;
    expect(body.proposals).toHaveLength(1);
  });

  test("a proposal file with an unsafe path is shown as not approvable instead of failing the list", async () => {
    const bad = await seed(proposedPage("Neu."));
    const file = join(proposalsDir, `${bad}.json`);
    const record = JSON.parse(await readFile(file, "utf8"));
    record.changes[0].path = "../escape.md";
    await writeFile(file, JSON.stringify(record), "utf8");
    const body = await (await list.GET()).json() as Record<string, any>;
    expect(body.proposals[0].canApprove).toBe(false);
    expect(body.proposals[0].validationErrors.join(" ")).toContain("Unsafe wiki path");
  });
});

describe("POST approve", () => {
  test("applies the proposal under the session name, marks it applied and logs the name", async () => {
    const id = await seed(proposedPage("Freigegeben."));
    const response = await post(approve, id, { reviewer: "Mallory" });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body).toMatchObject({ ok: true, status: "applied", appliedBy: "Ada Lovelace" });

    expect(await readFile(join(wikiDir, "concepts/launch.md"), "utf8")).toContain("Freigegeben.");
    const stored = JSON.parse(await readFile(join(proposalsDir, `${id}.json`), "utf8"));
    expect(stored).toMatchObject({ status: "applied", appliedBy: "Ada Lovelace", approvedBy: "Ada Lovelace" });
    const log = await readFile(join(wikiDir, "log.md"), "utf8");
    expect(log).toContain("actor: Ada Lovelace");
    expect(log).toContain(`[proposal: ${id}]`);
    expect(log).not.toContain("Mallory");
    expect(await readdir(proposalsDir)).toEqual([`${id}.json`]);
  });

  test("falls back to the e-mail address when the session has no name", async () => {
    session = { provider: "local", email: "grace@bloommd.test", createdAt: Date.now() };
    const id = await seed(proposedPage("Freigegeben."));
    expect((await post(approve, id)).status).toBe(200);
    expect(await readFile(join(wikiDir, "log.md"), "utf8")).toContain("actor: grace@bloommd.test");
  });

  test("a name with line breaks cannot forge extra log lines", async () => {
    session = { provider: "local", email: "x@bloommd.test", name: "Eve\n- Forged entry", createdAt: Date.now() };
    const id = await seed(proposedPage("Freigegeben."));
    expect((await post(approve, id)).status).toBe(200);
    const log = await readFile(join(wikiDir, "log.md"), "utf8");
    expect(log.split("\n").filter((line) => line.startsWith("- Forged"))).toEqual([]);
  });

  test("answers 409 with a named code and leaves the bundle untouched when the page changed", async () => {
    const id = await seed(proposedPage("Freigegeben."));
    const changed = `${PAGE}\nAndere Änderung.\n`;
    await writeFile(join(wikiDir, "concepts/launch.md"), changed, "utf8");
    const logBefore = await readFile(join(wikiDir, "log.md"), "utf8");

    const response = await post(approve, id);
    expect(response.status).toBe(409);
    const body = await response.json() as Record<string, any>;
    expect(body.code).toBe("wiki-page-changed");
    expect(body.paths).toEqual(["concepts/launch.md"]);
    expect(body.error).toContain("changed since the proposal was created");

    expect(await readFile(join(wikiDir, "concepts/launch.md"), "utf8")).toBe(changed);
    expect(await readFile(join(wikiDir, "log.md"), "utf8")).toBe(logBefore);
    expect(JSON.parse(await readFile(join(proposalsDir, `${id}.json`), "utf8")).status).toBeUndefined();
  });

  test("a decided proposal cannot be approved again", async () => {
    const id = await seed(proposedPage("Freigegeben."));
    expect((await post(approve, id)).status).toBe(200);
    const again = await post(approve, id);
    expect(again.status).toBe(409);
    expect((await again.json() as Record<string, any>).code).toBe("not-open");
  });

  test("unknown and invalid ids", async () => {
    expect((await post(approve, "does-not-exist")).status).toBe(404);
    expect((await post(approve, "..%2Fx")).status).toBe(400);
    expect((await post(approve, "../x")).status).toBe(400);
  });

  test("a stored proposal with a path outside the bundle is refused and writes nothing", async () => {
    const id = await seed(proposedPage("Neu."));
    const file = join(proposalsDir, `${id}.json`);
    const record = JSON.parse(await readFile(file, "utf8"));
    record.changes[0].path = "../escape.md";
    await writeFile(file, JSON.stringify(record), "utf8");
    const response = await post(approve, id);
    expect(response.status).toBe(422);
    await expect(readFile(join(wikiDir, "..", "escape.md"), "utf8")).rejects.toThrow();
  });

  test("a proposal whose content hash is wrong is refused", async () => {
    const id = await seed(proposedPage("Neu."));
    const file = join(proposalsDir, `${id}.json`);
    const record = JSON.parse(await readFile(file, "utf8"));
    record.changes[0].content += "\nManipuliert.\n";
    await writeFile(file, JSON.stringify(record), "utf8");
    expect((await post(approve, id)).status).toBe(422);
    expect(await readFile(join(wikiDir, "concepts/launch.md"), "utf8")).toBe(PAGE);
  });
});

describe("POST discard", () => {
  test("keeps the proposal with reason, name and time and leaves the bundle alone", async () => {
    const id = await seed(proposedPage("Verworfen."));
    const logBefore = await readFile(join(wikiDir, "log.md"), "utf8");
    const response = await post(discard, id, { reason: "  Quelle zu alt  ", discardedBy: "Mallory" });
    expect(response.status).toBe(200);

    const stored = JSON.parse(await readFile(join(proposalsDir, `${id}.json`), "utf8"));
    expect(stored).toMatchObject({ status: "discarded", discardReason: "Quelle zu alt", discardedBy: "Ada Lovelace" });
    expect(Number.isNaN(Date.parse(stored.discardedAt))).toBe(false);
    expect(await readFile(join(wikiDir, "concepts/launch.md"), "utf8")).toBe(PAGE);
    expect(await readFile(join(wikiDir, "log.md"), "utf8")).toBe(logBefore);
    expect(((await (await list.GET()).json()) as Record<string, any>).proposals).toEqual([]);
  });

  test("rejects a missing, empty or non-string reason", async () => {
    const id = await seed(proposedPage("Verworfen."));
    for (const body of [undefined, {}, { reason: "" }, { reason: "   " }, { reason: 42 }, null, []]) {
      const response = await post(discard, id, body);
      expect(response.status).toBe(400);
    }
    const stored = JSON.parse(await readFile(join(proposalsDir, `${id}.json`), "utf8"));
    expect(stored.status).toBeUndefined();
  });

  test("rejects an oversized reason", async () => {
    const id = await seed(proposedPage("Verworfen."));
    expect((await post(discard, id, { reason: "x".repeat(2001) })).status).toBe(400);
  });

  test("a decided proposal cannot be discarded again", async () => {
    const id = await seed(proposedPage("Verworfen."));
    expect((await post(discard, id, { reason: "a" })).status).toBe(200);
    expect((await post(discard, id, { reason: "b" })).status).toBe(409);
    expect(JSON.parse(await readFile(join(proposalsDir, `${id}.json`), "utf8")).discardReason).toBe("a");
  });
});
