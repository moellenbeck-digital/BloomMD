import { NextResponse } from "next/server";
import { parseFile } from "@bloommd/core/parser";
import { getApiRequestIdentity } from "../../../../../lib/auth";
import {
  createWorkspaceAgentTask,
  getWorkspaceForUser,
  listWorkspaceAgentTasks,
  normalizeUuid,
  readCloudDocument,
} from "../../../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity, readJsonBody } from "../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    return NextResponse.json({ tasks: await listWorkspaceAgentTasks(userId, workspaceId) });
  } catch (error) {
    return workspaceErrorResponse(error, "Agent tasks could not be loaded.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-agent-task", identifier: identity.email ?? userId, limit: 15, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ agentId?: string; documentId?: string; filename?: string; command?: string; nodeId?: string }>(request, 512 * 1024);
    if (!body.agentId || !body.documentId || !body.filename || typeof body.command !== "string") {
      return NextResponse.json({ error: "agentId, documentId, filename and command are required." }, { status: 400 });
    }
    const command = body.command.replace(/^@openclaw\b\s*/i, "").trim();
    const workspace = await getWorkspaceForUser(userId, workspaceId);
    const document = await readCloudDocument(userId, body.filename, workspace.id);
    if (!document || document.id !== body.documentId) return NextResponse.json({ error: "The selected document is not available in this workspace." }, { status: 404 });
    if (!command || command.length > 4000) return NextResponse.json({ error: "Agent task must contain between 1 and 4000 characters." }, { status: 400 });
    const parsed = parseFile(document.filename, document.markdown);
    const node = body.nodeId ? parsed.nodes.get(body.nodeId) : null;
    if (body.nodeId && !node) return NextResponse.json({ error: "The selected node is no longer available." }, { status: 409 });
    const path = node ? (() => { const titles: string[] = []; let current: typeof node | undefined = node; while (current) { titles.unshift(current.title); current = current.parentId ? parsed.nodes.get(current.parentId) : undefined; } return titles.join(" → "); })() : null;
    const task = await createWorkspaceAgentTask({ userId, workspaceId: workspace.id, agentId: body.agentId, documentId: document.id, filename: document.filename, prompt: command, ...(node && path ? { node: { id: node.id, title: node.title, path, content: node.content } } : {}) });
    return NextResponse.json({ taskId: task.id, status: "queued" }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Agent task must contain between 1 and 4000 characters.") return NextResponse.json({ error: error.message }, { status: 400 });
    return workspaceErrorResponse(error, "Agent task could not be queued.");
  }
}
