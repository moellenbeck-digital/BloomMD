import { readFile, writeFile } from "node:fs/promises";
import {
  appendWikiLog,
  applyWikiProposal,
  approveWikiProposal,
  createWikiProposal,
  getWikiStatus,
  initWikiBundle,
  lintWikiBundle,
  regenerateWikiIndex,
  renderWikiDiff,
  type WikiChange,
  type WikiProposal,
  type WikiSourceHashes,
} from "../packages/core/src/wiki";

const args = Bun.argv.slice(2);
const command = args[0];

function usage(): void {
  console.log(`BloomMD Wiki CLI

Usage:
  bun run wiki -- init <bundle-dir> [title]
  bun run wiki -- index <bundle-dir>
  bun run wiki -- status <bundle-dir> [source-hashes.json]
  bun run wiki -- lint <bundle-dir> [source-hashes.json]
  bun run wiki -- log <bundle-dir> <message> [actor]
  bun run wiki -- propose <bundle-dir> <changes.json> <proposal.json>
  bun run wiki -- approve <proposal.json> <reviewer>
  bun run wiki -- apply <bundle-dir> <proposal.json>
`);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function sourceHashes(path?: string): Promise<WikiSourceHashes> {
  return path ? readJson<WikiSourceHashes>(path) : {};
}

function required(index: number, label: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}

async function run(): Promise<void> {
  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  if (command === "init") {
    const root = required(1, "bundle directory");
    await initWikiBundle(root, args.slice(2).join(" ") || "BloomMD Wiki");
    console.log(JSON.stringify({ ok: true, command, root }, null, 2));
    return;
  }

  if (command === "index") {
    const root = required(1, "bundle directory");
    await regenerateWikiIndex(root);
    console.log(JSON.stringify({ ok: true, command, root }, null, 2));
    return;
  }

  if (command === "status" || command === "lint") {
    const root = required(1, "bundle directory");
    const hashes = await sourceHashes(args[2]);
    if (command === "status") {
      console.log(JSON.stringify(await getWikiStatus(root, hashes), null, 2));
      return;
    }
    const issues = await lintWikiBundle(root, hashes);
    console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
    if (issues.length > 0) process.exitCode = 1;
    return;
  }

  if (command === "log") {
    const root = required(1, "bundle directory");
    const message = required(2, "log message");
    await appendWikiLog(root, { message, ...(args[3] ? { actor: args[3] } : {}) });
    console.log(JSON.stringify({ ok: true, command, root }, null, 2));
    return;
  }

  if (command === "propose") {
    const root = required(1, "bundle directory");
    const changesPath = required(2, "changes JSON");
    const outputPath = required(3, "proposal JSON");
    const proposal = await createWikiProposal(root, await readJson<WikiChange[]>(changesPath));
    await writeFile(outputPath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, command, proposalId: proposal.id, outputPath }, null, 2));
    return;
  }

  if (command === "approve") {
    const proposalPath = required(1, "proposal JSON");
    const reviewer = required(2, "reviewer");
    const proposal = await readJson<WikiProposal>(proposalPath);
    const approved = approveWikiProposal(proposal, reviewer);
    await writeFile(proposalPath, `${JSON.stringify(approved, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, command, proposalId: approved.id, approvedBy: approved.approvedBy }, null, 2));
    return;
  }

  if (command === "apply") {
    const root = required(1, "bundle directory");
    const proposalPath = required(2, "proposal JSON");
    const proposal = await readJson<WikiProposal>(proposalPath);
    const diffs = await applyWikiProposal(root, proposal);
    console.log(`${renderWikiDiff(diffs)}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
