import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { buildWikiProposalViews, readWikiSourceHashes, reviewerName, wikiProposalsConfig } from "../../../../lib/wiki-proposals";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Open Wiki proposals for review. Separate from the public `GET /api/wiki`, which never carries
 * proposals: they hold unpublished page content and are only for a signed-in reviewer.
 */
export async function GET() {
  const config = wikiProposalsConfig();
  if (!config) return NextResponse.json({ enabled: false, message: "Wiki proposals are not enabled." }, { status: 404, headers: NO_STORE });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  try {
    const result = await buildWikiProposalViews(config, await readWikiSourceHashes());
    return NextResponse.json({ enabled: true, reviewer: reviewerName(session), ...result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[BloomMD] Wiki proposals could not be listed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ enabled: true, error: "Wiki proposals could not be read." }, { status: 500, headers: NO_STORE });
  }
}
