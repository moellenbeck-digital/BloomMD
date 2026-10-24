import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../lib/auth";
import { revokeMobileAppToken } from "../../../../lib/db";

/** Sign-out from the app: the bearer token revokes itself. Sessions and other keys cannot use it. */
export async function POST(request: Request) {
  const identity = await getApiRequestIdentity(request);
  if (identity?.authKind !== "access-token" || !identity.userId || !identity.tokenId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const revoked = await revokeMobileAppToken(identity.userId, identity.tokenId);
    return revoked ? NextResponse.json({ revoked: true }) : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (error) {
    console.error("[BloomMD] App sign-out failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
