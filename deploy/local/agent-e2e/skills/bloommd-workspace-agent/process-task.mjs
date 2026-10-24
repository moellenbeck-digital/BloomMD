import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

// OpenClaw's exec tool intentionally runs with a minimal environment. This deterministic fixture
// therefore uses the explicit agent assigned by the orchestration scenario rather than relying on
// container-only environment variables being forwarded into a tool subprocess.
const agentName = "agent-a";

const candidates = await Promise.all((await readdir("/tmp", { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("bloommd-agent-task-"))
  .map(async (entry) => ({ path: join("/tmp", entry.name), modified: (await stat(join("/tmp", entry.name))).mtimeMs })));
const taskDirectory = candidates.sort((left, right) => right.modified - left.modified)[0]?.path;
if (!taskDirectory) throw new Error("BloomMD runner did not provide a task directory.");

const task = JSON.parse(await readFile(join(taskDirectory, "task.json"), "utf8"));
if (task.context.node?.id !== "e2e-node" || !task.context.markdown.includes("Only this node is supplied")) {
  throw new Error("The model received context outside its selected node.");
}
const result = {
  summary: `OpenClaw ${agentName} prepared a scoped proposal.`,
  proposal: {
    nodeContent: `${task.context.node.content}\n\nProcessed by ${agentName}: ${task.command}`,
    rationale: "The proposal is limited to the selected node supplied with this task.",
  },
};
await writeFile(join(taskDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
// OpenClaw forwards an exec tool's stdout to the model. Emit the actual agent contract so the
// deterministic model can return it as the final structured assistant answer.
console.log(JSON.stringify(result));
await writeFile(`/e2e/${agentName}.model-completed`, "completed", { encoding: "utf8", mode: 0o600 });
