import { signMfaCookie } from "../lib/mfa-session";

/**
 * Requests of a signed-in operator for tests of the access functions: the session token (only its claims count for
 * the second-factor cookie, Payload checks the signature in production) and, unless `mfa: false`, the signed
 * second-factor cookie. Needs `PAYLOAD_SECRET` in the environment.
 */
export function operatorHeaders(id: string | number, options: { mfa?: boolean; sid?: string } = {}): Headers {
  const sid = options.sid ?? `sid-${id}`;
  const token = `h.${Buffer.from(JSON.stringify({ id, collection: "operators", sid })).toString("base64url")}.s`;
  const cookies = [`payload-token=${token}`];
  if (options.mfa !== false) cookies.push(`payload-mfa=${signMfaCookie(String(id), sid)}`);
  return new Headers({ cookie: cookies.join("; ") });
}

export function operatorReq(role: string, options: { id?: string | number; mfa?: boolean; blocked?: boolean } = {}) {
  const id = options.id ?? "o";
  return { req: { user: { collection: "operators", id, role, email: `${role}@example.test`, blocked: options.blocked ?? false }, headers: operatorHeaders(id, options) } } as never;
}
