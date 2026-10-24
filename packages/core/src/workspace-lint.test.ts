import { describe, expect, test } from "bun:test";
import { checkRoundtrip, lintWorkspace, type LintCode } from "./workspace-lint";

function filesOf(entries: Record<string, string>) {
  return Object.entries(entries).map(([path, markdown]) => ({ path, markdown }));
}

function codes(entries: Record<string, string>, options = {}): LintCode[] {
  return lintWorkspace(filesOf(entries), options).findings.map((finding) => finding.code);
}

describe("link findings", () => {
  test("a link without a target is an error", () => {
    const result = lintWorkspace(filesOf({ "one.md": "# One\n\n[[nowhere]]\n" }));
    expect(result.findings[0]).toMatchObject({ code: "broken-link", severity: "error", path: "one.md" });
    expect(result.summary.errors).toBe(1);
  });

  test("a broken link reports the line it is on", () => {
    const result = lintWorkspace(filesOf({ "one.md": "# One\n\ntext\n\n[[nowhere]]\n" }));
    expect(result.findings[0]!.line).toBe(5);
  });

  test("an ambiguous link is a warning and names the candidates", () => {
    const result = lintWorkspace(filesOf({ "one.md": "[[dup]]", "a/dup.md": "# A", "b/dup.md": "# B" }));
    const ambiguous = result.findings.find((finding) => finding.code === "ambiguous-link");
    expect(ambiguous?.severity).toBe("warning");
    expect(ambiguous?.detail).toContain("a/dup.md");
    expect(ambiguous?.detail).toContain("b/dup.md");
  });

  test("a resolved link produces nothing", () => {
    expect(codes({ "one.md": "[[two]]", "two.md": "# Two" })).toEqual([]);
  });

  test("an image is not reported as a broken link", () => {
    expect(codes({ "one.md": "![d](assets/x.png)" })).toEqual([]);
  });

  test("a link inside a code block is not reported", () => {
    expect(codes({ "one.md": "```\n[[nowhere]]\n```\n" })).toEqual([]);
  });
});

describe("duplicate names", () => {
  test("two files with the same name are reported once as info", () => {
    const result = lintWorkspace(filesOf({ "a/dup.md": "# A", "b/dup.md": "# B" }));
    const duplicates = result.findings.filter((finding) => finding.code === "duplicate-name");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.severity).toBe("info");
    expect(duplicates[0]!.detail).toBe("a/dup.md, b/dup.md");
  });

  test("unique names produce nothing", () => {
    expect(codes({ "a/one.md": "# A", "b/two.md": "# B" })).toEqual([]);
  });
});

describe("orphans", () => {
  const vault = { "linked.md": "[[target]]", "target.md": "# Target", "alone.md": "# Alone" };

  test("are not reported by default", () => {
    // A fresh vault is nothing but orphans, and a check that shouts on day one gets ignored by
    // day two.
    expect(codes(vault)).toEqual([]);
  });

  test("are reported when asked for", () => {
    const result = lintWorkspace(filesOf(vault), { reportOrphans: true });
    const orphans = result.findings.filter((finding) => finding.code === "orphan-page");
    expect(orphans.map((finding) => finding.path)).toEqual(["alone.md"]);
    expect(orphans[0]!.severity).toBe("info");
  });

  test("a page that only receives links is not an orphan", () => {
    const result = lintWorkspace(filesOf(vault), { reportOrphans: true });
    expect(result.findings.some((finding) => finding.path === "target.md")).toBe(false);
  });
});

describe("round-trip safety", () => {
  test("an unchanged document produces no finding", () => {
    expect(checkRoundtrip({ path: "one.md", markdown: "# One\n\nBody text.\n" })).toBeNull();
  });

  test("Obsidian syntax survives and produces no finding", () => {
    // The regression that made this check worth having: wiki links, checkboxes and callouts were
    // all being escaped on save.
    const markdown = "# One\n\n[[Wiki Link]]\n\n- [ ] task\n- [x] done\n\n> [!NOTE]\n> Callout\n";
    expect(checkRoundtrip({ path: "one.md", markdown })).toBeNull();
  });

  test("a table and a fenced code block survive", () => {
    const markdown = "# One\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst x = 1;\n```\n";
    expect(checkRoundtrip({ path: "one.md", markdown })).toBeNull();
  });

  test("existing bloommd id comments are not treated as a change", () => {
    const markdown = "# One <!-- bloommd:id=abc123 -->\n\nBody.\n";
    expect(checkRoundtrip({ path: "one.md", markdown })).toBeNull();
  });

  test("existing frontmatter is not treated as a change", () => {
    const markdown = "---\ntitle: One\nid: abc\n---\n\n# One\n\nBody.\n";
    expect(checkRoundtrip({ path: "one.md", markdown })).toBeNull();
  });

  test("a rewrite that keeps the meaning is a warning, not an error", () => {
    // A Setext heading comes back as ATX. The heading survives; only its spelling changes.
    // Reporting that as an error would make the check shout on any vault using Setext headings,
    // and a noisy check is one people learn to skip.
    const finding = checkRoundtrip({ path: "one.md", markdown: "Titel\n=====\n\nBody.\n" });
    expect(finding).toMatchObject({ code: "roundtrip-normalizes", severity: "warning" });
  });

  test("the normalisation finding points at the line that changed", () => {
    const finding = checkRoundtrip({ path: "one.md", markdown: "Titel\n=====\n\nBody.\n" });
    expect(finding?.detail).toContain("Titel");
    expect(finding?.detail).toContain("# Titel");
  });

  test("a whitespace-only rewrite is not reported as loss", () => {
    const finding = checkRoundtrip({ path: "one.md", markdown: "# One\n\n binary\n" });
    expect(finding?.severity).not.toBe("error");
  });

  test("the check is opt-in", () => {
    const files = { "one.md": "# One\n\nBody.\n" };
    expect(lintWorkspace(filesOf(files)).summary.filesChecked).toBe(1);
    expect(codes(files, { checkRoundtrip: true })).toEqual([]);
  });
});

describe("result shape", () => {
  test("counts each severity and the files checked", () => {
    const result = lintWorkspace(
      filesOf({ "one.md": "[[nowhere]] [[dup]]", "a/dup.md": "# A", "b/dup.md": "# B" }),
      { reportOrphans: true },
    );
    expect(result.summary.errors).toBe(1);
    expect(result.summary.warnings).toBe(1);
    expect(result.summary.infos).toBeGreaterThanOrEqual(1);
    expect(result.summary.filesChecked).toBe(3);
  });

  test("findings are ordered by severity, then path", () => {
    // A report that reshuffles itself cannot be diffed between two commits.
    const files = filesOf({ "z.md": "[[nowhere]]", "a.md": "[[nowhere]]" });
    const first = lintWorkspace(files).findings.map((finding) => `${finding.severity}:${finding.path}`);
    expect(first).toEqual(["error:a.md", "error:z.md"]);
    expect(lintWorkspace(files).findings.map((finding) => `${finding.severity}:${finding.path}`)).toEqual(first);
  });

  test("an empty workspace is clean rather than an error", () => {
    const result = lintWorkspace([]);
    expect(result.findings).toEqual([]);
    expect(result.summary.filesChecked).toBe(0);
  });
});
