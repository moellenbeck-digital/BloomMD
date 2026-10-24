import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createPasswordUser,
  markEmailVerified,
  migrateMarketSchema,
} from "../../../apps/app/src/lib/db";
import {
  issueSession,
  sessionCookieName,
} from "../../../apps/app/src/lib/auth";
import { hashPassword } from "../../../apps/app/src/lib/passwordAuth";

const appUrl = process.env.BLOOMMD_E2E_APP_URL ?? "http://web:3000";
const artifacts = process.env.BLOOMMD_E2E_ARTIFACT_DIR ?? "/e2e";
const email = `openclaw-e2e-${randomUUID()}@bloommd.invalid`;
const password = `OpenClaw-${randomUUID()}-A1`;

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${appUrl}${path}`, init);
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} failed with ${response.status}: ${await response.text()}`,
    );
  return response;
}

async function waitForFile(filename: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return (await readFile(`${artifacts}/${filename}`, "utf8")).trim();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      )
        throw error;
    }
    await Bun.sleep(500);
  }
  throw new Error(`Timed out waiting for E2E artifact ${filename}.`);
}

interface AgentTaskResponse {
  tasks?: Array<{
    id: string;
    status: string;
    proposals?: Array<{ id: string; status: string }>;
  }>;
}

async function waitForProposal(
  workspaceId: string,
  taskId: string,
  timeoutMs = 180_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request(
      `/api/workspaces/${workspaceId}/agent-tasks`,
      { headers },
    );
    const payload = (await response.json()) as AgentTaskResponse;
    const task = payload.tasks?.find((candidate) => candidate.id === taskId);
    const proposal = task?.proposals?.find(
      (candidate) => candidate.status === "pending",
    );
    if (task?.status === "proposed" && proposal) return proposal.id;
    await Bun.sleep(500);
  }
  throw new Error(
    `Timed out waiting for plugin-submitted proposal for task ${taskId}.`,
  );
}

await mkdir(artifacts, { recursive: true, mode: 0o700 });
await migrateMarketSchema();
const user = await createPasswordUser({
  email,
  name: "OpenClaw E2E owner",
  passwordHash: hashPassword(password),
});
await markEmailVerified(user.id);
const session = await issueSession({
  provider: "password",
  userId: user.id,
  email: user.email,
  name: user.name ?? undefined,
});
const headers = {
  Origin: appUrl,
  Cookie: `${sessionCookieName()}=${session}`,
  "Content-Type": "application/json",
};

const workspaceResponse = await request("/api/workspaces", {
  method: "POST",
  headers,
  body: JSON.stringify({ name: "OpenClaw E2E Team" }),
});
const workspace = (await workspaceResponse.json()) as {
  workspace: { id: string };
};
const documentResponse = await request("/api/mindmaps", {
  method: "POST",
  headers: { ...headers, "X-BloomMD-Workspace-ID": workspace.workspace.id },
  body: JSON.stringify({
    filename: "agent-e2e.md",
    markdown:
      "# E2E source for agent <!-- bloommd:id=e2e-root -->\n\n## Scoped node <!-- bloommd:id=e2e-node -->\n\nOnly this node is supplied to the worker.\n\n## Untouched node <!-- bloommd:id=e2e-untouched -->\n\nThis content must remain unchanged.",
  }),
});
const document = (await documentResponse.json()) as {
  storage?: { documentId?: string };
  filePath?: string;
};
if (!document.storage?.documentId || !document.filePath)
  throw new Error("The E2E document was not persisted through sync.");

async function createAgent(name: string) {
  const response = await request(
    `/api/workspaces/${workspace.workspace.id}/agents`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "openclaw", displayName: name }),
    },
  );
  const payload = (await response.json()) as {
    agent: { id: string };
    pairingCode: string;
  };
  await writeFile(`${artifacts}/${name}.pair`, payload.pairingCode, {
    encoding: "utf8",
    mode: 0o600,
  });
  return payload.agent.id;
}

const agentA = await createAgent("agent-a");
const agentB = await createAgent("agent-b");
await Promise.all([
  waitForFile("agent-a.paired"),
  waitForFile("agent-b.paired"),
]);
// Pairing persists a token before OpenClaw has started its plugin service. Queue only after both
// authenticated SSE streams are established so this assertion covers task wake-up, not gateway boot.
await Promise.all([
  waitForFile("agent-a.realtime-ready"),
  waitForFile("agent-b.realtime-ready"),
]);

const taskResponse = await request(
  `/api/workspaces/${workspace.workspace.id}/agent-tasks`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      agentId: agentA,
      documentId: document.storage.documentId,
      filename: document.filePath,
      nodeId: "e2e-node",
      command: "Add a reviewable OpenClaw proposal.",
    }),
  },
);
const task = (await taskResponse.json()) as { taskId?: string };
if (!task.taskId) throw new Error("The E2E task was not queued.");
const queuedAt = Date.now();
await Promise.race([
  waitForFile("agent-a.model-completed", 25_000),
  waitForFile("agent-b.model-completed").then(() => {
    throw new Error("Agent B consumed a task assigned to agent A.");
  }),
]);
if (Date.now() - queuedAt >= 25_000)
  throw new Error(
    "The plugin did not wake from its realtime task event before the polling fallback window.",
  );
const proposalId = await waitForProposal(workspace.workspace.id, task.taskId);

const applyResponse = await request(
  `/api/workspaces/${workspace.workspace.id}/agent-proposals/${proposalId}`,
  { method: "POST", headers, body: JSON.stringify({ action: "apply" }) },
);
const apply = (await applyResponse.json()) as {
  status?: string;
  storage?: { mode?: string };
};
if (apply.status !== "applied" || apply.storage?.mode !== "database")
  throw new Error(
    "Human proposal application did not complete through database-backed sync.",
  );

const readResponse = await request(
  `/api/mindmaps?file=${encodeURIComponent(document.filePath)}`,
  { headers: { ...headers, "X-BloomMD-Workspace-ID": workspace.workspace.id } },
);
const applied = (await readResponse.json()) as {
  storage?: { version?: number };
  nodes?: Record<string, { content?: string; title?: string }>;
};
const serialized = JSON.stringify(applied.nodes);
if (!serialized.includes("Processed by agent-a"))
  throw new Error("Applied proposal is not visible in the synced document.");
if (!serialized.includes("This content must remain unchanged."))
  throw new Error(
    "Node-scoped proposal overwrote content outside the selected node.",
  );
if (!applied.storage?.version || applied.storage.version < 2)
  throw new Error(
    "The sync-server write did not advance the document version.",
  );

await request(`/api/workspaces/${workspace.workspace.id}/agents/${agentA}`, {
  method: "DELETE",
  headers,
});
await writeFile(
  `${artifacts}/success.json`,
  JSON.stringify(
    {
      workspaceId: workspace.workspace.id,
      documentId: document.storage.documentId,
      taskId: task.taskId,
      proposalId,
      checks: [
        "plugin-pairing",
        "plugin-realtime-wake",
        "node-only-context",
        "agent-isolation",
        "plugin-submitted-node-only-proposal",
        "human-apply-through-sync",
        "revocation-pending",
      ],
    },
    null,
    2,
  ),
  { encoding: "utf8", mode: 0o600 },
);
console.log(
  "BloomMD OpenClaw E2E passed: plugin pairing, realtime task wake, node-only context, multi-agent isolation, plugin proposal and sync apply.",
);
// postgres.js keeps an idle pool alive for its normal application lifetime. This is a one-shot
// verifier, so terminate after every invariant was persisted and checked.
process.exit(0);
