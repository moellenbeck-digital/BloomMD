import { describe, expect, test } from "bun:test";
import { callWorkspaceAgentTool, WORKSPACE_AGENT_TOOLS } from "./workspace-agent";
import type { LintResult } from "./workspace-lint";

const files = [
  { path: "README.md", markdown: "# Übersicht\n\nSiehe [[Kapitel]] und [[fehlt]].\n" },
  { path: "Buch/Kapitel.md", markdown: "# Kapitel\n\n## Szene\n\nText.\n\n```\n# Keine Überschrift\n```\n" },
];

const typedFiles = [
  {
    path: "plan.md",
    markdown: "# Plan <!-- bloommd:id=root -->\n\n## Open task <!-- bloommd:id=task-open --> <!-- bloommd:meta={\"kind\":\"task\",\"status\":\"open\"} -->\n\nReview the source.\n\n## Done task <!-- bloommd:id=task-done --> <!-- bloommd:meta={\"kind\":\"task\",\"status\":\"done\"} -->\n\nAlready complete.\n\n## Persistence decision <!-- bloommd:id=decision --> <!-- bloommd:meta={\"kind\":\"decision\",\"decision\":\"accepted\"} -->\n\nUse the sync server because it retains permission checks.\n",
  },
];

describe("tool declarations", () => {
  test("every tool has a name, a description and a schema", () => {
    for (const tool of WORKSPACE_AGENT_TOOLS) {
      expect(tool.name).toMatch(/^workspace_/);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  test("every description says the tool is read-only", () => {
    // Writing has exactly one route, through the Wiki proposal protocol with its citation,
    // approval and hash check. A second route would make that protocol decorative.
    for (const tool of WORKSPACE_AGENT_TOOLS) {
      expect(tool.description).toContain("Read-only");
    }
  });

  test("no tool is named like a mutation", () => {
    for (const tool of WORKSPACE_AGENT_TOOLS) {
      expect(tool.name).not.toMatch(/write|create|delete|move|apply|update/);
    }
  });
});

describe("workspace_overview", () => {
  test("reports counts including what is broken", () => {
    const result = callWorkspaceAgentTool(files, "workspace_overview");
    expect(result.value).toMatchObject({ files: 2, folders: 1, resolvedReferences: 1, brokenReferences: 1 });
  });
});

describe("workspace_search", () => {
  test("finds by text", () => {
    const result = callWorkspaceAgentTool(files, "workspace_search", { text: "kapitel" });
    expect((result.value as Array<{ path: string }>).some((hit) => hit.path === "Buch/Kapitel.md")).toBe(true);
  });

  test("finds by link relationship", () => {
    const result = callWorkspaceAgentTool(files, "workspace_search", { linksTo: "Buch/Kapitel.md" });
    expect((result.value as Array<{ path: string }>).map((hit) => hit.path)).toEqual(["README.md"]);
  });

  test("caps the limit so a huge vault cannot flood the context", () => {
    const many = Array.from({ length: 500 }, (_, index) => ({ path: `n${index}.md`, markdown: "# X\n" }));
    const result = callWorkspaceAgentTool(many, "workspace_search", { text: "x", limit: 10_000 });
    expect((result.value as unknown[]).length).toBeLessThanOrEqual(200);
  });
});

describe("workspace_backlinks", () => {
  test("returns who links to a path", () => {
    const result = callWorkspaceAgentTool(files, "workspace_backlinks", { path: "Buch/Kapitel.md" });
    expect(result.value).toMatchObject([{ path: "README.md", raw: "[[Kapitel]]" }]);
  });

  test("a missing path argument is an error, not an empty answer", () => {
    // An empty list would read as "nothing links here", which is a different and wrong claim.
    expect(callWorkspaceAgentTool(files, "workspace_backlinks", {})).toMatchObject({ isError: true });
  });
});

describe("workspace_outline", () => {
  test("returns headings with their lines", () => {
    const result = callWorkspaceAgentTool(files, "workspace_outline", { path: "Buch/Kapitel.md" });
    const value = result.value as { headings: Array<{ level: number; title: string }> };
    expect(value.headings.map((heading) => heading.title)).toEqual(["Kapitel", "Szene"]);
  });

  test("ignores a heading inside a code fence", () => {
    const result = callWorkspaceAgentTool(files, "workspace_outline", { path: "Buch/Kapitel.md" });
    const value = result.value as { headings: Array<{ title: string }> };
    expect(value.headings.some((heading) => heading.title === "Keine Überschrift")).toBe(false);
  });

  test("lists outgoing links with their resolution", () => {
    const result = callWorkspaceAgentTool(files, "workspace_outline", { path: "README.md" });
    const value = result.value as { links: Array<{ raw: string; resolution: string }> };
    expect(value.links.find((link) => link.raw === "[[fehlt]]")?.resolution).toBe("broken");
  });

  test("a file outside the workspace is an error", () => {
    expect(callWorkspaceAgentTool(files, "workspace_outline", { path: "../etc/passwd" })).toMatchObject({ isError: true });
  });
});

describe("workspace_lint", () => {
  test("returns the same findings as the CLI", () => {
    const result = callWorkspaceAgentTool(files, "workspace_lint");
    const value = result.value as LintResult;
    expect(value.summary.errors).toBe(1);
    expect(value.findings[0]!.code).toBe("broken-link");
  });

  test("orphans and the round-trip check stay opt-in", () => {
    const withEverything = callWorkspaceAgentTool(files, "workspace_lint", { reportOrphans: true, checkRoundtrip: true });
    const value = withEverything.value as LintResult;
    expect(value.summary.filesChecked).toBe(2);
  });
});

describe("typed planning tools", () => {
  test("lists only open typed task nodes", () => {
    const result = callWorkspaceAgentTool(typedFiles, "workspace_open_tasks");
    expect(result.value).toEqual([
      {
        path: "plan.md",
        nodeId: "task-open",
        title: "Open task",
        content: "Review the source.",
        status: "open",
      },
    ]);
  });

  test("lists decision rationale without treating it as a task", () => {
    const result = callWorkspaceAgentTool(typedFiles, "workspace_decisions");
    expect(result.value).toEqual([
      {
        path: "plan.md",
        nodeId: "decision",
        title: "Persistence decision",
        rationale: "Use the sync server because it retains permission checks.",
        status: "accepted",
      },
    ]);
  });

  test("returns only changes from an explicitly supplied known state", () => {
    const initial = callWorkspaceAgentTool(typedFiles, "workspace_changes", { knownHashes: {} });
    const hashes = (initial.value as { currentHashes: Record<string, string> }).currentHashes;
    const changed = callWorkspaceAgentTool(
      [...typedFiles, { path: "new.md", markdown: "# New\n" }],
      "workspace_changes",
      { knownHashes: { ...hashes, "removed.md": "fnv1a32x2:old" } },
    );
    expect(changed.value).toMatchObject({ added: ["new.md"], changed: [], removed: ["removed.md"] });
  });
});

describe("unknown tools", () => {
  test("are refused rather than ignored", () => {
    expect(callWorkspaceAgentTool(files, "workspace_delete_everything")).toMatchObject({ isError: true });
  });
});
