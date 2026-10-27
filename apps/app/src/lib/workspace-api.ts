import { NextResponse } from "next/server";
import { RateLimitError, RequestSecurityError } from "./request-security";

export function workspaceErrorResponse(error: unknown, fallback: string) {
  if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof RateLimitError) {
    return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
  }
  if (error instanceof Error) {
    const badRequest = new Set([
      "Please enter a valid email address.",
      "You cannot invite yourself.",
      "New invitations must use the editor or viewer role.",
      "Invalid invitation id.",
      "Invalid member role.",
      "Invalid workspace invitation.",
      "Invalid workspace id.",
      "Agent name is required.",
      "Unsupported workspace agent provider.",
      "Invalid workspace agent.",
      "Invalid agent task target.",
      "Agent task must contain between 1 and 4000 characters.",
      "Invalid agent task.",
      "Invalid agent proposal.",
      "Invalid shared document.",
    ]);
    if (badRequest.has(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.message === "LAST_OWNER") return NextResponse.json({ error: "The last workspace owner cannot leave, be removed, or be demoted." }, { status: 409 });
    if (error.message === "INVITATION_INVALID") return NextResponse.json({ error: "This invitation is expired, revoked, or already used." }, { status: 410 });
    if (error.message === "INVITATION_EMAIL_MISMATCH") return NextResponse.json({ error: "Sign in with the invited email address to accept this invitation." }, { status: 403 });
    if (error.message === "INVITATION_HANDOFF_INVALID") return NextResponse.json({ error: "This invitation handoff is invalid or expired." }, { status: 400 });
    if (error.message === "This user is already a workspace member.") return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.message.includes("Only workspace") || error.message === "Use leave workspace for your own membership." || error.message === "This workspace is read-only.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (
      error.message === "Workspace member not found." ||
      error.message === "Personal workspaces cannot be left." ||
      error.message === "Workspace agent or document not found." ||
      error.message === "Shared document not found." ||
      error.message === "Agent task is not available." ||
      error.message === "Agent proposal is not available." ||
      error.message === "Agent token not found."
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.message === "Workspace not found or access denied.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
  }
  console.error("[BloomMD] Workspace API failed:", error instanceof Error ? error.name : "unknown");
  return NextResponse.json({ error: fallback }, { status: 500 });
}
