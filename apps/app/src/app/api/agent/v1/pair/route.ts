import { NextResponse } from "next/server";
import { pairWorkspaceAgent } from "../../../../../lib/db";
import { assertRateLimit, readJsonBody } from "../../../../../lib/request-security";

export async function POST(request: Request) {
  try {
    await assertRateLimit(request, { action: "workspace-agent-pair", identifier: request.headers.get("x-forwarded-for") ?? "anonymous", limit: 10, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ pairingCode?: string }>(request, 16 * 1024);
    if (!body.pairingCode) return NextResponse.json({ error: "pairingCode is required." }, { status: 400 });
    const result = await pairWorkspaceAgent(body.pairingCode);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent pairing failed.";
    return NextResponse.json({ error: message }, { status: message === "Invalid or expired pairing code." ? 401 : 400 });
  }
}
