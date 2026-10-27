import { NextResponse } from "next/server";
import { getSession } from "../../../../../../lib/auth";
import { assertSameOrigin, RequestSecurityError } from "../../../../../../lib/request-security";
import { approveAndApplyWikiProposal, reviewerName, wikiProposalsConfig } from "../../../../../../lib/wiki-proposals";

export const dynamic = "force-dynamic";

/**
 * Approve and apply in one step. The reviewer is the signed-in user from the session; nothing about
 * who approves is taken from the request. POST only — a GET must never change the Wiki.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = wikiProposalsConfig();
  if (!config) return NextResponse.json({ enabled: false, message: "Wiki proposals are not enabled." }, { status: 404 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;
  const result = await approveAndApplyWikiProposal(config, id, reviewerName(session));
  if (result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ error: result.error, code: result.code, ...(result.paths ? { paths: result.paths } : {}) }, { status: result.status });
}
