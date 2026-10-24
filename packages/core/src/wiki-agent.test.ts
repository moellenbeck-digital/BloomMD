import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callWikiAgentTool } from "./wiki-agent";
import { initWikiBundle, regenerateWikiIndex } from "./wiki";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("Wiki agent tools preserve the propose, approve, apply boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "bloommd-agent-"));
  roots.push(root);
  await initWikiBundle(root, "Agent Wiki");
  const initial = "---\ntype: concept\nid: launch\n---\n# Launch\n\nInitial.\n";
  await writeFile(join(root, "concepts/launch.md"), initial, "utf8");
  await regenerateWikiIndex(root);

  const page = await callWikiAgentTool(root, "knowledge_wiki_get_page", { path: "concepts/launch.md" });
  expect((page.value as { content: string }).content).toContain("Initial.");

  const proposed = await callWikiAgentTool(root, "knowledge_wiki_propose", {
    changes: [{ path: "concepts/launch.md", content: initial.replace("Initial.", "Approved."), reason: "test" }],
  });
  const proposal = proposed.value as { approvedBy?: string };
  expect(proposal.approvedBy).toBeUndefined();
  expect(await readFile(join(root, "concepts/launch.md"), "utf8")).toContain("Initial.");

  const approved = await callWikiAgentTool(root, "knowledge_wiki_approve", { proposal, reviewer: "test" });
  const applied = await callWikiAgentTool(root, "knowledge_wiki_apply", { proposal: approved.value });
  expect((applied.value as { diffs: unknown[] }).diffs.length).toBe(1);
  expect(await readFile(join(root, "concepts/launch.md"), "utf8")).toContain("Approved.");
});
