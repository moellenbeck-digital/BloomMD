import { strictAccessConfig } from "@bloommd/core/agent-ledger";
import { NextResponse } from "next/server";
import { agentOwnerContext, agentReviewErrorResponse } from "../../../../../lib/agent-review";
import { listAgentTokensForWorkspace, setAgentTokenRights } from "../../../../../lib/db";
import { readJsonBody } from "../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/** GET → the agent tokens that can work in this workspace and their rights (workspace owners only). */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const context = await agentOwnerContext(request, (await params).workspaceId, { write: false });
    return NextResponse.json({ workspaceId: context.workspace.id, tokens: await listAgentTokensForWorkspace(context.userId, context.workspace.id) });
  } catch (error) {
    return agentReviewErrorResponse(error) ?? workspaceErrorResponse(error, "Agent rights could not be loaded.");
  }
}

/** PUT { tokenId, access, areas } → replaces the rights of one agent token ("propose" without an entry). */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const context = await agentOwnerContext(request, (await params).workspaceId, { write: true });
    const body = await readJsonBody<{ tokenId?: string; access?: unknown; areas?: unknown }>(request, 64 * 1024);
    if (!body.tokenId) return NextResponse.json({ error: "tokenId is required." }, { status: 400 });
    let rights;
    try {
      rights = strictAccessConfig({ access: body.access, areas: body.areas });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid rights.", code: "INVALID_RIGHTS" }, { status: 400 });
    }
    return NextResponse.json({ rights: await setAgentTokenRights({ userId: context.userId, workspaceId: context.workspace.id, tokenId: body.tokenId, rights }) });
  } catch (error) {
    return agentReviewErrorResponse(error) ?? workspaceErrorResponse(error, "Agent rights could not be saved.");
  }
}
