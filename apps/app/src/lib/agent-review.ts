import { accessFor, outlineDiff, type OutlineChange } from "@bloommd/core/agent-ledger";
import { NextResponse } from "next/server";
import { isAgentTokenIdentity } from "./agent-gate";
import { getApiRequestIdentity, type ApiRequestIdentity } from "./auth";
import {
  completeAgentTokenUndo,
  createAgentTokenProposal,
  finishAgentTokenProposal,
  getAgentTokenChangeForUndo,
  getAgentTokenProposal,
  getAgentTokenRights,
  getWorkspaceForUser,
  normalizeUuid,
  readCloudDocument,
  type AgentTokenProposalRecord,
  type WorkspaceRecord,
} from "./db";
import { assertRateLimit, assertSameOriginForIdentity } from "./request-security";
import { createThroughSyncServer, deleteThroughSyncServer, SyncMutationError, writeThroughSyncServer } from "./sync-room-status";
import { workspaceForIdentity } from "./token-workspace";

/** A refusal with a status and a code the clients show; anything else is an internal error. */
export class AgentReviewError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "AgentReviewError";
  }
}

export function agentReviewErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AgentReviewError) return NextResponse.json({ error: error.message, code: error.code, ...error.extra }, { status: error.status });
  if (error instanceof SyncMutationError) {
    // A whole-map save is refused while someone has the map open (it would overwrite live edits).
    if (error.code === "SYNC_ROOM_ACTIVE" || error.code === "SYNC_ROOM_PENDING") {
      return NextResponse.json({ error: "Die Map ist gerade in BloomMD geöffnet; schließe sie auf allen Geräten und versuche es dann erneut. / The map is open in BloomMD right now; close it on all devices and try again.", code: error.code }, { status: 409 });
    }
    if (error.code === "VERSION_CONFLICT") return NextResponse.json({ error: "The map changed while the change was applied.", code: "AGENT_PROPOSAL_CONFLICT" }, { status: 409 });
    if (error.code === "DOCUMENT_FILENAME_CONFLICT") return NextResponse.json({ error: "A map with this name exists already.", code: "AGENT_PROPOSAL_CONFLICT" }, { status: 409 });
    return NextResponse.json({ error: "The change could not be applied through the sync server.", code: error.code }, { status: 503 });
  }
  return null;
}

export interface OwnerContext {
  identity: ApiRequestIdentity;
  userId: string;
  workspace: WorkspaceRecord;
  /** Who is named in the change log: the signed-in name, else the email. */
  reviewerName: string;
}

/**
 * The person (browser session or personal token) who manages agent rights in a workspace.
 * `workspaceParam` is a workspace id or "personal". Agent tokens never manage anything: they
 * must not widen their own rights.
 */
export async function agentOwnerContext(request: Request, workspaceParam: string, options: { write: boolean }): Promise<OwnerContext> {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  if (!identity || !userId) throw new AgentReviewError(401, "UNAUTHORIZED", "A cloud session is required.");
  if (isAgentTokenIdentity(identity)) throw new AgentReviewError(403, "AGENT_FORBIDDEN", "Agent tokens cannot manage agent rights or proposals.");
  if (options.write) {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "agent-rights-manage", identifier: identity.email ?? userId, limit: 120, windowMs: 60 * 60 * 1000 });
  }
  const requested = workspaceParam === "personal" ? null : workspaceParam;
  const workspace = await getWorkspaceForUser(userId, workspaceForIdentity(identity, requested));
  // Rights, proposals, the log and the undo of any change belong to the workspace owner, not to every member.
  if (workspace.role !== "owner") throw new AgentReviewError(403, "OWNER_REQUIRED", "Only workspace owners can manage agent rights and proposals.");
  return { identity, userId, workspace, reviewerName: identity.name?.trim() || identity.email || "Owner" };
}

/** What a proposal changes, as a short outline, and whether the map moved on since it was made. */
export async function describeProposal(context: OwnerContext, proposal: AgentTokenProposalRecord) {
  const current = await readCloudDocument(context.userId, proposal.filename, context.workspace.id);
  const stale = proposal.baseVersion === null ? current !== null : current === null || current.version !== proposal.baseVersion;
  const { proposedMarkdown: _markdown, ...rest } = proposal;
  return { ...rest, stale, changes: outlineDiff(current?.markdown ?? null, proposal.proposedMarkdown).slice(0, 60) as OutlineChange[] };
}

/**
 * Applies a proposal as the signed-in owner. When the map changed since the proposal, the owner
 * has to decide knowingly (`overwrite`): the log keeps what was replaced.
 */
export async function approveAgentTokenProposal(context: OwnerContext, proposalId: string, options: { overwrite?: boolean } = {}) {
  const proposal = await getAgentTokenProposal({ userId: context.userId, workspaceId: context.workspace.id, proposalId });
  const current = await readCloudDocument(context.userId, proposal.filename, context.workspace.id);
  const changed = proposal.baseVersion === null ? current !== null : current === null || current.version !== proposal.baseVersion;
  if (changed && !options.overwrite) {
    throw new AgentReviewError(409, "AGENT_PROPOSAL_CONFLICT", `${proposal.filename} changed since the proposal was made; reject it and let the agent propose again, or apply it anyway.`, {
      changes: outlineDiff(current?.markdown ?? null, proposal.proposedMarkdown).slice(0, 60),
    });
  }
  // `overwrite` of a map that was removed meanwhile creates it again.
  const saved = current
    ? await writeThroughSyncServer(current.id, { filename: current.filename, markdown: proposal.proposedMarkdown, workspaceId: context.workspace.id, userId: context.userId, expectedVersion: current.version })
    : await createThroughSyncServer({ filename: proposal.filename, markdown: proposal.proposedMarkdown, workspaceId: context.workspace.id, userId: context.userId });
  const changeId = await finishAgentTokenProposal({
    userId: context.userId,
    workspaceId: context.workspace.id,
    proposal,
    action: "approved",
    reviewerName: context.reviewerName,
    applied: { beforeMarkdown: current?.markdown ?? null, createdMap: !current, afterVersion: saved.storage?.version ?? saved.version },
  });
  return { applied: proposal.id, changeId, path: proposal.filename, reviewer: context.reviewerName, ...(changed ? { overwrote: current?.version ?? null } : {}) };
}

export async function rejectAgentTokenProposal(context: OwnerContext, proposalId: string, reason?: string) {
  const proposal = await getAgentTokenProposal({ userId: context.userId, workspaceId: context.workspace.id, proposalId });
  const clean = reason?.trim().slice(0, 500) || undefined;
  await finishAgentTokenProposal({ userId: context.userId, workspaceId: context.workspace.id, proposal, action: "rejected", reviewerName: context.reviewerName, reason: clean });
  return { rejected: proposal.id, reviewer: context.reviewerName, ...(clean ? { reason: clean } : {}) };
}

export type UndoActor =
  | { kind: "owner"; userId: string; name: string }
  | { kind: "agent"; userId: string; tokenId: string; agentName: string };

/**
 * Restores the state before a change, unless the map was edited since. The owner may undo any
 * change. An agent only its own direct changes and only within its rights: where it may only
 * propose, the undo becomes a proposal; where it may only read, it is refused.
 */
export async function undoAgentChange(workspaceId: string, changeId: string, actor: UndoActor) {
  const change = await getAgentTokenChangeForUndo(workspaceId, changeId);
  if (!change) throw new AgentReviewError(404, "CHANGE_NOT_FOUND", `Change ${changeId} was not found.`);
  if (actor.kind === "agent" && (change.tokenId !== actor.tokenId || change.origin !== "agent")) {
    throw new AgentReviewError(403, "AGENT_UNDO_FORBIDDEN", `Change ${changeId} was approved or made by someone else; only the workspace owner can undo it.`);
  }
  if (change.undoneAt) throw new AgentReviewError(409, "CHANGE_UNDONE", `Change ${changeId} was undone already.`);
  if (!change.undoable || !change.filename) throw new AgentReviewError(409, "CHANGE_NOT_UNDOABLE", `Change ${changeId} cannot be undone (only the last 300 changes keep their old state).`);
  const current = await readCloudDocument(actor.userId, change.filename, workspaceId);
  if (!current || change.afterVersion === null || current.version !== change.afterVersion) {
    throw new AgentReviewError(409, "CHANGE_EDITED_LATER", `${change.filename} was edited after change ${changeId}; undo it by hand.`);
  }
  if (actor.kind === "agent") {
    const area = change.area;
    const access = accessFor(await getAgentTokenRights(actor.tokenId, workspaceId), area);
    if (access === "read") throw new AgentReviewError(403, "AGENT_READ_ONLY", `The agent may only read in "${area || "(top level)"}"; ask the owner to undo change ${changeId}.`, { area });
    if (access === "propose") {
      if (change.createdMap || change.beforeMarkdown === null) throw new AgentReviewError(403, "AGENT_WRITE_REQUIRED", `Removing a map needs the owner in "${area || "(top level)"}"; ask them to undo change ${changeId}.`, { area });
      const proposalId = await createAgentTokenProposal({ tokenId: actor.tokenId, workspaceId, agentName: actor.agentName, tool: "bloommd_undo", filename: current.filename, area, baseVersion: current.version, markdown: change.beforeMarkdown, summary: `Undo change ${changeId}` });
      return { proposed: proposalId, changeId, path: current.filename };
    }
  }
  const input = { filename: current.filename, workspaceId, userId: actor.userId, expectedVersion: current.version };
  if (change.createdMap) await deleteThroughSyncServer(current.id, input);
  else await writeThroughSyncServer(current.id, { ...input, markdown: change.beforeMarkdown ?? "" });
  await completeAgentTokenUndo({
    workspaceId,
    changeId,
    tokenId: change.tokenId,
    agentName: change.agentName,
    filename: current.filename,
    area: change.area,
    byName: actor.kind === "owner" ? actor.name : actor.agentName,
    byUserId: actor.kind === "owner" ? actor.userId : null,
    byAgent: actor.kind === "agent",
  });
  return { undone: changeId, path: current.filename };
}
