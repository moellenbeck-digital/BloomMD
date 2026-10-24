import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileStore } from "./fileStore";
import { addNode, moveNode, renameNode } from "./operations";
import {
  applyWikiProposal,
  approveWikiProposal,
  createWikiProposal,
  getWikiStatus,
  initWikiBundle,
  regenerateWikiIndex,
} from "./wiki";

/**
 * Local and offline use is a product capability, not a fallback (#45, #46).
 *
 * A user must be able to open, edit and save Markdown, and run the whole deterministic Wiki
 * workflow, without an account, without DATABASE_URL, without the sync service and without network
 * access. These tests pin that contract so a future cloud feature cannot quietly require a
 * connection on the local path.
 */

const HERE = dirname(new URL(import.meta.url).pathname);

/** Modules that would drag a network or database dependency into the local path. */
const FORBIDDEN_IMPORTS = [
  "postgres",
  "@neondatabase",
  "node:http",
  "node:https",
  "node:net",
  "node:dgram",
];

async function importsOf(file: string): Promise<string[]> {
  const source = await readFile(join(HERE, file), "utf8");
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
}

describe("local Markdown editing works offline", () => {
  test("opens, edits, saves and survives a restart without any environment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bloommd-offline-"));
    await writeFile(join(dir, "plan.md"), "# Plan\n\n## Alpha\n\nSee [spec](https://example.com/a).\n\n## Beta\n", "utf8");

    const doc = await new FileStore({ baseDir: dir }).read("plan.md");
    const alpha = [...doc.nodes.values()].find((node) => node.title === "Alpha")!;
    const beta = [...doc.nodes.values()].find((node) => node.title === "Beta")!;
    addNode(doc, alpha.id, "Added offline");
    renameNode(doc, beta.id, "Renamed offline");
    moveNode(doc, beta.id, alpha.id);
    await new FileStore({ baseDir: dir }).write(doc);

    // A fresh store stands in for restarting the desktop app.
    const reopened = await new FileStore({ baseDir: dir }).read("plan.md");
    const titles = [...reopened.nodes.values()].map((node) => node.title);
    expect(titles).toContain("Added offline");
    expect(titles).toContain("Renamed offline");

    const raw = await readFile(join(dir, "plan.md"), "utf8");
    expect(raw).toContain("[spec](https://example.com/a)");

    await rm(dir, { recursive: true, force: true });
  });

  test("the file store pulls in no network or database module", async () => {
    for (const file of ["fileStore.ts", "parser.ts", "operations.ts", "paths.ts"]) {
      const imports = await importsOf(file);
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(imports.some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))).toBe(false);
      }
    }
  });
});

describe("OKF wiki bundles work offline", () => {
  test("runs init, index, status and the approval workflow on a local folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "bloommd-offline-wiki-"));
    await initWikiBundle(root, "Offline Wiki");
    await writeFile(
      join(root, "concepts", "retention.md"),
      "---\ntype: Concept\ntitle: Retention\nstatus: draft\ngenerated:\n  by: agent\n  at: 2026-08-07T10:00:00Z\n---\n\nBody.\n",
      "utf8",
    );
    await regenerateWikiIndex(root);

    const before = await getWikiStatus(root);
    expect(before.okfVersion).toBe("0.2");
    expect(before.trustCounts.generated).toBe(1);

    const proposal = await createWikiProposal(root, [{
      path: "concepts/retention.md",
      reason: "Human review of the distilled page",
      content: "---\ntype: Concept\ntitle: Retention\nstatus: stable\nverified:\n  - by: max\n    at: 2026-08-07T12:00:00Z\n---\n\nReviewed.\n",
    }]);

    // Applying without approval must be refused, offline just as anywhere else.
    await expect(applyWikiProposal(root, proposal)).rejects.toThrow();

    await applyWikiProposal(root, approveWikiProposal(proposal, "max"));
    const after = await getWikiStatus(root);
    expect(after.trustCounts.verified).toBe(1);

    await rm(root, { recursive: true, force: true });
  });

  test("the wiki modules pull in no network or database module", async () => {
    for (const file of ["wiki.ts", "wiki-agent.ts", "frontmatter.ts"]) {
      const imports = await importsOf(file);
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(imports.some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))).toBe(false);
      }
    }
  });
});
