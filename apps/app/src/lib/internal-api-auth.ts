import { timingSafeEqual } from "node:crypto";

function matches(candidate: string, expected: string) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isInternalInviteRequestAuthorized(request: Request) {
  const expected = process.env.BLOOMMD_INTERNAL_INVITE_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const candidate = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return Boolean(expected && candidate && matches(candidate, expected));
}

export function internalInviteUnauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
