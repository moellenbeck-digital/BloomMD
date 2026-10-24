import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../lib/auth";

/** The app checks its stored token on launch: who is signed in and until when. */
export async function GET(request: Request) {
  const identity = await getApiRequestIdentity(request);
  if (identity?.authKind !== "access-token" || !identity.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    user: { email: identity.email ?? null, name: identity.name ?? null },
    tokenId: identity.tokenId,
    expiresAt: identity.tokenExpiresAt ?? null,
    client: identity.tokenClient ?? null,
  });
}
