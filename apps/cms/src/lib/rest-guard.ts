import config from "@payload-config";
import { getPayload } from "payload";

/**
 * Guard in front of the REST route `/api` (ADR 3, layer 4, spike section 3 D). Payload serves its REST
 * API for every collection from one catch-all route; the admin UI needs it in the browser, so it cannot
 * be switched off. The guard answers 404 for everything unless the caller has a session of the collection
 * `operators`. The only paths open without a session are the sign-in paths of the operators. The default
 * auth endpoints of `users` are closed for everybody, also for operators: end users sign in only through
 * `/svc/v1/auth/login`.
 */
const OPERATOR_PUBLIC = /^\/api\/operators\/(login|logout|me|refresh-token)$/;
const USER_AUTH_ENDPOINTS = /^\/api\/users\/(login|logout|me|refresh-token|forgot-password|reset-password|first-register|init|unlock|verify(\/.*)?)$/;

export type RestDecision = "allow" | "not_found";

/** Pure decision: is this REST request allowed to reach Payload? */
export function decideRestAccess(pathname: string, hasOperatorSession: boolean): RestDecision {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (USER_AUTH_ENDPOINTS.test(normalized)) return "not_found";
  if (OPERATOR_PUBLIC.test(normalized)) return "allow";
  return hasOperatorSession ? "allow" : "not_found";
}

export type SessionResolver = (headers: Headers) => Promise<boolean>;

/** True when the request carries a valid session of an operator (cookie plus matching origin, checked by Payload). */
export const resolveOperatorSession: SessionResolver = async (headers) => {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers });
  return (user as { collection?: string } | null)?.collection === "operators";
};

const notFound = () => new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });

export function createRestGuard(resolve: SessionResolver = resolveOperatorSession) {
  return function guarded<Args>(handler: (request: Request, args: Args) => Promise<Response>) {
    return async (request: Request, args: Args): Promise<Response> => {
      const { pathname } = new URL(request.url);
      // Paths blocked for everybody and public sign-in paths are decided without a session lookup.
      if (decideRestAccess(pathname, true) === "not_found") return notFound();
      if (decideRestAccess(pathname, false) === "allow") return handler(request, args);
      const hasSession = await resolve(request.headers).catch(() => false);
      return hasSession ? handler(request, args) : notFound();
    };
  };
}

export const guarded = createRestGuard();
