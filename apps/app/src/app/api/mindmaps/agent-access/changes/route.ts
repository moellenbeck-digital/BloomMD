import { NextResponse } from "next/server";
import { resolveAgentSelf } from "../../../../../lib/agent-self";
import { listAgentTokenChanges } from "../../../../../lib/db";

/** GET ?limit= → the calling agent token's own change log, newest first, with the ids for undo. */
export async function GET(request: Request) {
  const result = await resolveAgentSelf(request);
  if (result instanceof Response) return result;
  if (!result.agent) return NextResponse.json({ changes: [] });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  return NextResponse.json({ changes: await listAgentTokenChanges({ workspaceId: result.workspaceId, tokenId: result.agent.tokenId, limit: Number.isFinite(limit) ? limit : 20 }) });
}
