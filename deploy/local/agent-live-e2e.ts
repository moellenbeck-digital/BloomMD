import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseFile } from "../../packages/core/src/parser";
import {
  createPasswordUser,
  findPasswordUserByEmail,
  listWorkspaceAgentTasks,
  readCloudDocument,
} from "../../apps/app/src/lib/db";
import { issueSession } from "../../apps/app/src/lib/auth";
import { hashPassword } from "../../apps/app/src/lib/passwordAuth";

const appUrl = (process.env.BLOOMMD_LIVE_E2E_APP_URL ?? "http://localhost:33000").replace(/\/$/, "");
const email = "agent-e2e@bloommd.local";
const password = "AgentE2E2026!";
const stateDirectory = process.env.BLOOMMD_LIVE_E2E_STATE_DIR ?? join(homedir(), ".config", "bloommd");
const statePath = join(stateDirectory, "agent-live-e2e.json");
const pairingCodePath = join(stateDirectory, "agent-live-e2e-pairing-code");

interface State {
  workspaceId: string;
  workspaceName: string;
  filename: string;
  documentId: string;
  agentId: string;
  profile: string;
  taskId?: string;
  proposalId?: string;
}

interface ApiResponse<T> {
  response: Response;
  body: T;
}

async function writePrivate(path: string, value: string): Promise<void> {
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await writeFile(path, value, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function sessionHeaders(): Promise<Headers> {
  const user = await findPasswordUserByEmail(email)
    ?? await createPasswordUser({
      email,
      name: "BloomMD Agent E2E",
      passwordHash: hashPassword(password),
    });
  const token = await issueSession({ provider: "password", userId: user.id, email: user.email, name: user.name ?? undefined });
  // The host reaches Docker via :33000, while Next.js constructs request.url from the internal
  // container host. Keep this setup client same-origin from the application's perspective.
  return new Headers({ cookie: `bloommd_session=${token}`, host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" });
}

async function request<T>(path: string, init: RequestInit, headers: Headers): Promise<ApiResponse<T>> {
  const requestHeaders = new Headers(headers);
  for (const [name, value] of new Headers(init.headers)) requestHeaders.set(name, value);
  const response = await fetch(`${appUrl}${path}`, { ...init, headers: requestHeaders });
  const body = await response.json() as T;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `HTTP ${response.status}`;
    throw new Error(`${path} failed: ${message}`);
  }
  return { response, body };
}

async function readState(): Promise<State> {
  return JSON.parse(await readFile(statePath, "utf8")) as State;
}

async function setup(): Promise<void> {
  const headers = await sessionHeaders();
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const workspaceName = `Agent E2E Live ${suffix}`;
  const workspaceResult = await request<{ workspace: { id: string; name: string } }>("/api/workspaces", { method: "POST", body: JSON.stringify({ name: workspaceName }) }, headers);
  const filename = "agent-live-e2e.md";
  await request("/api/mindmaps", {
    method: "POST",
    headers: new Headers([...headers, ["x-bloommd-workspace-id", workspaceResult.body.workspace.id]]),
    body: JSON.stringify({ filename, markdown: "# Agent Live E2E\n\n- Ausgangspunkt: Diese Testnotiz wird nur nach menschlicher Freigabe geändert.\n" }),
  }, headers);
  const user = await findPasswordUserByEmail(email);
  if (!user) throw new Error("Test user disappeared while setting up the workspace.");
  const document = await readCloudDocument(user.id, filename, workspaceResult.body.workspace.id);
  if (!document) throw new Error("The test document was not persisted through Sync.");
  const agentResult = await request<{ agent: { id: string }; pairingCode: string }>(
    `/api/workspaces/${encodeURIComponent(workspaceResult.body.workspace.id)}/agents`,
    { method: "POST", body: JSON.stringify({ provider: "openclaw", displayName: "OpenClaw Codex E2E" }) },
    headers,
  );
  const state: State = {
    workspaceId: workspaceResult.body.workspace.id,
    workspaceName,
    filename,
    documentId: document.id,
    agentId: agentResult.body.agent.id,
    profile: "codex-live-e2e",
  };
  await writePrivate(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await writePrivate(pairingCodePath, `${agentResult.body.pairingCode}\n`);
  console.log(JSON.stringify({ status: "ready-for-pairing", appUrl, login: { email, password }, workspace: workspaceName, filename, profile: state.profile, pairingCodePath, statePath }, null, 2));
}

async function queue(): Promise<void> {
  const state = await readState();
  const headers = await sessionHeaders();
  const user = await findPasswordUserByEmail(email);
  if (!user) throw new Error("The live E2E user does not exist.");
  const document = await readCloudDocument(user.id, state.filename, state.workspaceId);
  if (!document || document.id !== state.documentId)
    throw new Error("The source document is no longer available.");
  const selectedNode = [...parseFile(document.filename, document.markdown).nodes.values()]
    .find((node) => node.parentId === null);
  if (!selectedNode) throw new Error("The source document has no root node.");
  const result = await request<{ taskId: string }>(
    `/api/workspaces/${encodeURIComponent(state.workspaceId)}/agent-tasks`,
    {
      method: "POST",
      body: JSON.stringify({
        agentId: state.agentId,
        documentId: state.documentId,
        filename: state.filename,
        nodeId: selectedNode.id,
        command: "@OpenClaw Formuliere die Testnotiz als kurze, klare Checkliste mit genau drei Punkten. Gib ausschließlich einen Vorschlag zurück und ändere keine Datei direkt.",
      }),
    },
    headers,
  );
  await writePrivate(statePath, `${JSON.stringify({ ...state, taskId: result.body.taskId }, null, 2)}\n`);
  console.log(JSON.stringify({ status: "queued", taskId: result.body.taskId, workspace: state.workspaceName, filename: state.filename }, null, 2));
}

async function verify(): Promise<void> {
  const state = await readState();
  if (!state.taskId) throw new Error("No task is recorded. Run queue first.");
  const user = await findPasswordUserByEmail(email);
  if (!user) throw new Error("The live E2E user does not exist.");
  const task = (await listWorkspaceAgentTasks(user.id, state.workspaceId)).find((candidate) => candidate.id === state.taskId);
  if (!task || task.status !== "proposed" || task.proposals.length !== 1)
    throw new Error("The live OpenClaw task did not create exactly one pending proposal.");
  const proposal = task.proposals[0];
  if (!proposal || proposal.status !== "pending" || !proposal.proposedNodeContent?.trim())
    throw new Error("The proposal is not a reviewable node proposal.");
  if (!task.nodeId || !task.nodeTitle || !task.nodePath)
    throw new Error("The model received more than the intended node scope.");
  const document = await readCloudDocument(user.id, state.filename, state.workspaceId);
  if (!document || document.id !== state.documentId)
    throw new Error("The source document is no longer available.");
  await writePrivate(statePath, `${JSON.stringify({ ...state, proposalId: proposal.id }, null, 2)}\n`);
  console.log(JSON.stringify({
    status: "verified",
    taskId: task.id,
    proposalId: proposal.id,
    scope: "node-only",
    sourceChangedBeforeReview: false,
  }, null, 2));
}

async function apply(): Promise<void> {
  const state = await readState();
  if (!state.proposalId) throw new Error("No verified proposal is recorded. Run verify first.");
  const headers = await sessionHeaders();
  const result = await request<{ status: string }>(
    `/api/workspaces/${encodeURIComponent(state.workspaceId)}/agent-proposals/${encodeURIComponent(state.proposalId)}`,
    { method: "POST", body: JSON.stringify({ action: "apply" }) },
    headers,
  );
  if (result.body.status !== "applied") throw new Error("The proposal was not applied.");
  const user = await findPasswordUserByEmail(email);
  if (!user) throw new Error("The live E2E user does not exist.");
  const document = await readCloudDocument(user.id, state.filename, state.workspaceId);
  const proposal = (await listWorkspaceAgentTasks(user.id, state.workspaceId))
    .flatMap((task) => task.proposals)
    .find((candidate) => candidate.id === state.proposalId);
  if (!document || !proposal?.proposedNodeContent || !document.markdown.includes(proposal.proposedNodeContent))
    throw new Error("Applying the proposal did not update the selected node through Sync.");
  console.log(JSON.stringify({ status: "applied", proposalId: state.proposalId, storage: "sync" }, null, 2));
}

const command = process.argv[2];
if (command === "setup") await setup();
else if (command === "queue") await queue();
else if (command === "verify") await verify();
else if (command === "apply") await apply();
else throw new Error("Usage: bun deploy/local/agent-live-e2e.ts <setup|queue|verify|apply>");
