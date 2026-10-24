import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyWikiProposal, initWikiBundle, readWikiBundle } from "./wiki";
import {
  runWikiAgentAdapter,
  WikiAdapterError,
  withProvenanceFrontmatter,
  type WikiAgentAdapter,
  type WikiAgentSource,
} from "./wiki-adapter";

/**
 * A stand-in for any provider.
 *
 * No network, no model. That is the point of the contract test: what matters is that the pipeline
 * refuses bad output, and refusing does not depend on which provider produced it.
 */
function stubAdapter(overrides: Partial<WikiAgentAdapter> = {}): WikiAgentAdapter {
  return {
    name: "stub",
    async proposeAffectedPages({ sources }) {
      return [{ path: "concepts/topic.md", reason: "New material", sourceIds: sources.map((source) => source.id) }];
    },
    async draftPatch({ intent, sources }) {
      return {
        path: intent.path,
        content: withProvenanceFrontmatter("stub", "# Topic\n\nBody.\n", sources, { type: "concept" }),
        reason: "Documented the new material",
        sourceIds: intent.sourceIds,
      };
    },
    ...overrides,
  };
}

const sources: WikiAgentSource[] = [
  { id: "src-1", resource: "https://example.com/spec", content: "Specification text.", title: "Spec" },
];

let rootDir = "";

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "bloommd-wiki-adapter-"));
  await initWikiBundle(rootDir, "Test Wiki");
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("the adapter cannot write", () => {
  test("a run returns a proposal and changes nothing on disk", async () => {
    const before = await readWikiBundle(rootDir);
    const { proposal } = await runWikiAgentAdapter(rootDir, stubAdapter(), sources);

    expect(proposal.changes).toHaveLength(1);
    expect(proposal.approvedBy).toBeUndefined();

    const after = await readWikiBundle(rootDir);
    expect(after.pages.map((page) => page.path)).toEqual(before.pages.map((page) => page.path));
  });

  test("applying without approval is refused", async () => {
    const { proposal } = await runWikiAgentAdapter(rootDir, stubAdapter(), sources);
    await expect(applyWikiProposal(rootDir, proposal)).rejects.toThrow(/approval/i);
  });

  test("applying after explicit approval writes the page", async () => {
    const { proposal } = await runWikiAgentAdapter(rootDir, stubAdapter(), sources);
    const approved = { ...proposal, approvedBy: "max", approvedAt: new Date().toISOString() };
    const diffs = await applyWikiProposal(rootDir, approved);

    expect(diffs).toHaveLength(1);
    const written = await readFile(join(rootDir, "concepts/topic.md"), "utf8");
    expect(written).toContain("# Topic");
  });
});

describe("citations are required", () => {
  test("a patch citing no source is dropped", async () => {
    const adapter = stubAdapter({
      async draftPatch({ intent, sources: given }) {
        return {
          path: intent.path,
          content: withProvenanceFrontmatter("stub", "# Topic\n", given, { type: "concept" }),
          reason: "No citation",
          sourceIds: [],
        };
      },
    });
    await expect(runWikiAgentAdapter(rootDir, adapter, sources)).rejects.toThrow(/citations/i);
  });

  test("a patch citing an unknown source is dropped", async () => {
    const adapter = stubAdapter({
      async draftPatch({ intent, sources: given }) {
        return {
          path: intent.path,
          content: withProvenanceFrontmatter("stub", "# Topic\n", given, { type: "concept" }),
          reason: "Invented citation",
          sourceIds: ["src-does-not-exist"],
        };
      },
    });
    await expect(runWikiAgentAdapter(rootDir, adapter, sources)).rejects.toThrow(/Unknown source id/);
  });

  test("a patch without a reason is dropped", async () => {
    const adapter = stubAdapter({
      async draftPatch({ intent, sources: given }) {
        return {
          path: intent.path,
          content: withProvenanceFrontmatter("stub", "# Topic\n", given, { type: "concept" }),
          reason: "   ",
          sourceIds: intent.sourceIds,
        };
      },
    });
    await expect(runWikiAgentAdapter(rootDir, adapter, sources)).rejects.toThrow(/No reason/);
  });
});

describe("the adapter cannot reach pages it was not asked about", () => {
  test("a patch redirected to another page is dropped", async () => {
    const adapter = stubAdapter({
      async draftPatch({ sources: given }) {
        return {
          path: "somewhere/else.md",
          content: withProvenanceFrontmatter("stub", "# Elsewhere\n", given, { type: "concept" }),
          reason: "Redirected",
          sourceIds: given.map((source) => source.id),
        };
      },
    });
    await expect(runWikiAgentAdapter(rootDir, adapter, sources)).rejects.toThrow(/does not match the intended page/);
  });

  test("a second intent for the same page is dropped, not merged", async () => {
    const adapter = stubAdapter({
      async proposeAffectedPages({ sources: given }) {
        const ids = given.map((source) => source.id);
        return [
          { path: "concepts/topic.md", reason: "First", sourceIds: ids },
          { path: "concepts/topic.md", reason: "Second", sourceIds: ids },
        ];
      },
    });
    const { proposal, warnings } = await runWikiAgentAdapter(rootDir, adapter, sources);
    expect(proposal.changes).toHaveLength(1);
    expect(warnings.some((warning) => warning.includes("one change per page"))).toBe(true);
  });

  test("a path escaping the bundle is refused", async () => {
    const adapter = stubAdapter({
      async proposeAffectedPages({ sources: given }) {
        return [{ path: "../../escape.md", reason: "Escape", sourceIds: given.map((source) => source.id) }];
      },
    });
    await expect(runWikiAgentAdapter(rootDir, adapter, sources)).rejects.toThrow();
  });
});

describe("input validation", () => {
  test("a run without sources is refused", async () => {
    await expect(runWikiAgentAdapter(rootDir, stubAdapter(), [])).rejects.toThrow(WikiAdapterError);
  });

  test("duplicate source ids are refused", async () => {
    const duplicated = [...sources, { ...sources[0]!, resource: "https://example.com/other" }];
    await expect(runWikiAgentAdapter(rootDir, stubAdapter(), duplicated)).rejects.toThrow(/Duplicate source ids/);
  });

  test("an adapter producing no intent at all fails clearly", async () => {
    const adapter = stubAdapter({ async proposeAffectedPages() { return []; } });
    await expect(runWikiAgentAdapter(rootDir, adapter, sources)).rejects.toThrow(/no change/i);
  });
});

describe("provenance", () => {
  test("generated pages carry the actor and a hash of every source", async () => {
    const { proposal } = await runWikiAgentAdapter(rootDir, stubAdapter(), sources);
    const content = proposal.changes[0]!.content;
    expect(content).toContain('by: "stub"');
    expect(content).toContain('resource: "https://example.com/spec"');
    expect(content).toMatch(/contentHash: "sha256:[a-f0-9]+"/);
  });

  test("the source hash changes when the source text changes", async () => {
    const first = await runWikiAgentAdapter(rootDir, stubAdapter(), sources);
    const changedSources = [{ ...sources[0]!, content: "Different specification text." }];
    const second = await runWikiAgentAdapter(rootDir, stubAdapter(), changedSources);

    const hashOf = (content: string) => /contentHash: "(sha256:[a-f0-9]+)"/.exec(content)?.[1];
    expect(hashOf(first.proposal.changes[0]!.content)).not.toBe(hashOf(second.proposal.changes[0]!.content));
  });

  test("the written provenance survives being read back", async () => {
    // Regression: the frontmatter used `actor:` while the reader expects `by:`, so an applied page
    // parsed back as "unattributed" and lost exactly the provenance it had just recorded.
    const { proposal } = await runWikiAgentAdapter(rootDir, stubAdapter(), sources);
    await applyWikiProposal(rootDir, { ...proposal, approvedBy: "max", approvedAt: new Date().toISOString() });

    const bundle = await readWikiBundle(rootDir);
    const page = bundle.pages.find((entry) => entry.path === "concepts/topic.md");
    expect(page?.generated?.by).toBe("stub");
    expect(page?.trustTier).toBe("generated");
    expect(page?.sources.map((source) => source.id)).toEqual(["src-1"]);
  });

  test("the reason records which adapter produced the change", async () => {
    const { proposal } = await runWikiAgentAdapter(rootDir, stubAdapter(), sources);
    expect(proposal.changes[0]!.reason).toStartWith("[stub]");
  });
});

describe("content hashes guard against a changed bundle", () => {
  test("a proposal is refused once the page it was based on has moved on", async () => {
    const { proposal } = await runWikiAgentAdapter(rootDir, stubAdapter(), sources);
    const approved = { ...proposal, approvedBy: "max", approvedAt: new Date().toISOString() };

    // Somebody edits the same page between proposal and apply.
    await applyWikiProposal(rootDir, approved);
    const stale = { ...proposal, approvedBy: "max", approvedAt: new Date().toISOString() };

    await expect(applyWikiProposal(rootDir, stale)).rejects.toThrow(/changed since proposal creation/i);
  });
});
