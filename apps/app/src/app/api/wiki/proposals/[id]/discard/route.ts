import { NextResponse } from "next/server";
import { getSession } from "../../../../../../lib/auth";
import { assertSameOrigin, readJsonBody, RequestSecurityError } from "../../../../../../lib/request-security";
import { discardWikiProposalAs, reviewerName, wikiProposalsConfig } from "../../../../../../lib/wiki-proposals";

export const dynamic = "force-dynamic";

/** Discard with a mandatory reason. The Wiki bundle is not touched; the proposal file stays as history. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = wikiProposalsConfig();
  if (!config) return NextResponse.json({ enabled: false, message: "Wiki proposals are not enabled." }, { status: 404 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let reason: unknown;
  try {
    assertSameOrigin(request);
    const body = await readJsonBody<{ reason?: unknown } | null>(request, 16 * 1024);
    reason = body && typeof body === "object" ? body.reason : undefined;
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const { id } = await params;
  const result = await discardWikiProposalAs(config, id, reason, reviewerName(session));
  if (result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
}
