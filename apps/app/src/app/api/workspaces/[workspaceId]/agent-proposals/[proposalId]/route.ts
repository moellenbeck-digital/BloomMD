import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../../lib/auth";
import {
  getWorkspaceAgentProposalForApply,
  getWorkspaceForUser,
  markWorkspaceAgentProposalApplied,
  normalizeUuid,
  readCloudDocument,
  reviewWorkspaceAgentProposal,
} from "../../../../../../lib/db";
import { createHash } from "node:crypto";
import { assertRateLimit, assertSameOriginForIdentity, readJsonBody } from "../../../../../../lib/request-security";
import { applyNodeContentThroughSyncServer, writeThroughSyncServer, SyncMutationError } from "../../../../../../lib/sync-room-status";
import { workspaceErrorResponse } from "../../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string; proposalId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId, proposalId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-agent-proposal-review", identifier: identity.email ?? userId, limit: 30, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ action?: "apply" | "reject" }>(request, 16 * 1024);
    if (body.action !== "apply" && body.action !== "reject") return NextResponse.json({ error: "A review action is required." }, { status: 400 });
    if (body.action === "reject") {
      await reviewWorkspaceAgentProposal({ userId, workspaceId, proposalId, action: "reject" });
      return NextResponse.json({ status: "rejected" });
    }

    const workspace = await getWorkspaceForUser(userId, workspaceId);
    const proposal = await getWorkspaceAgentProposalForApply(userId, workspace.id, proposalId);
    const current = await readCloudDocument(userId, proposal.filename, workspace.id);
    if (!current || current.id !== proposal.documentId) {
      await reviewWorkspaceAgentProposal({ userId, workspaceId: workspace.id, proposalId, action: "mark_stale" });
      return NextResponse.json({ error: "The source document changed after this proposal was created.", code: "AGENT_PROPOSAL_STALE" }, { status: 409 });
    }
    if (typeof proposal.proposedNodeContent === "string" || (proposal.proposedChildNodes?.length ?? 0) > 0) {
      if (!proposal.nodeId || proposal.sourceNodeTitle == null || proposal.sourceNodeContent == null) {
        await reviewWorkspaceAgentProposal({ userId, workspaceId: workspace.id, proposalId, action: "mark_stale" });
        return NextResponse.json({ error: "The node changed or was removed after this proposal was created.", code: "AGENT_PROPOSAL_STALE" }, { status: 409 });
      }
      try {
        const saved = await applyNodeContentThroughSyncServer(proposal.documentId, {
          filename: proposal.filename,
          workspaceId: workspace.id,
          userId,
          nodeId: proposal.nodeId,
          expectedNodeTitle: proposal.sourceNodeTitle,
          expectedNodeContent: proposal.sourceNodeContent,
          nextNodeContent: proposal.proposedNodeContent ?? proposal.sourceNodeContent,
          childNodes: proposal.proposedChildNodes ?? [],
        });
        await markWorkspaceAgentProposalApplied({ userId, workspaceId: workspace.id, proposalId });
        return NextResponse.json({ status: "applied", storage: saved.storage, version: saved.version });
      } catch (error) {
        if (error instanceof SyncMutationError && error.code === "AGENT_NODE_STALE") {
          await reviewWorkspaceAgentProposal({ userId, workspaceId: workspace.id, proposalId, action: "mark_stale" });
          return NextResponse.json({ error: "The node changed or was removed after this proposal was created.", code: "AGENT_PROPOSAL_STALE" }, { status: 409 });
        }
        throw error;
      }
    }
    const sourceMatches = current.version === proposal.beforeVersion && createHash("sha256").update(current.markdown).digest("hex") === proposal.beforeMarkdownHash;
    if (!sourceMatches) {
      await reviewWorkspaceAgentProposal({ userId, workspaceId: workspace.id, proposalId, action: "mark_stale" });
      return NextResponse.json({ error: "The source document changed after this proposal was created.", code: "AGENT_PROPOSAL_STALE" }, { status: 409 });
    }
    try {
      const saved = await writeThroughSyncServer(proposal.documentId, {
        filename: proposal.filename,
        markdown: proposal.proposedMarkdown,
        workspaceId: workspace.id,
        userId,
        expectedVersion: current.version,
      });
      await markWorkspaceAgentProposalApplied({ userId, workspaceId: workspace.id, proposalId });
      return NextResponse.json({ status: "applied", storage: saved.storage, version: saved.version });
    } catch (error) {
      if (error instanceof SyncMutationError && error.code === "VERSION_CONFLICT") {
        await reviewWorkspaceAgentProposal({ userId, workspaceId: workspace.id, proposalId, action: "mark_stale" });
        return NextResponse.json({ error: "The source document changed before the proposal could be applied.", code: "AGENT_PROPOSAL_STALE" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return workspaceErrorResponse(error, "Agent proposal could not be reviewed.");
  }
}
