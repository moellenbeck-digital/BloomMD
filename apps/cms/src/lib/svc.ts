import { randomUUID } from "node:crypto";
import config from "@payload-config";
import { getPayload, type Payload } from "payload";
import { appSigningKeys } from "./env";
import { claimNonce, poolOf } from "./shared-store";
import { verifySignature } from "./signature";

/** Maximum size of a request body on `/svc/v1`. */
export const MAX_BODY_BYTES = 64 * 1024;

export { SvcError } from "./svc-error";
import { SvcError } from "./svc-error";

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** The request ID of a call: taken over from `X-Request-Id` when well-formed, else generated. It goes into every answer. */
export function requestIdOf(request: Request): string {
  const given = request.headers.get("x-request-id");
  return given && REQUEST_ID.test(given) ? given : randomUUID();
}

export function respond(requestId: string, body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ ...body, requestId }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId, ...headers },
  });
}

export interface SvcContext {
  payload: Payload;
  requestId: string;
  url: URL;
  request: Request;
  /** Parsed JSON body (`{}` when the call has none). */
  body: Record<string, unknown>;
}

export type SvcResult = Response | { status?: number; body: Record<string, unknown>; headers?: Record<string, string> };

function toResponse(requestId: string, result: SvcResult): Response {
  if (result instanceof Response) return result;
  return respond(requestId, result.body, result.status ?? 200, result.headers);
}

function failure(requestId: string, error: unknown): Response {
  if (error instanceof SvcError) return respond(requestId, { error: error.code, ...error.extra }, error.status, error.headers);
  // Log the kind of error and the request ID only: messages can contain e-mail addresses (no personal data in logs).
  console.error(`[svc] ${requestId} unhandled ${error instanceof Error ? error.name : typeof error}`);
  return respond(requestId, { error: "internal_error" }, 500);
}

async function readBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new SvcError(413, "payload_too_large");
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new SvcError(413, "payload_too_large");
  return text;
}

function parseJsonObject(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // falls through to the error below
  }
  throw new SvcError(400, "invalid_json");
}

/**
 * Wrapper of every endpoint that `apps/app` calls: signed call (`X-Svc-Signature`, timestamp +-60 s, nonce in
 * the shared store, two keys valid at the same time). Any failure of authentication is the same 401 so
 * the caller learns nothing about the reason. A missing key configuration is a 503, not an open door.
 */
export async function handleApp(request: Request, handler: (context: SvcContext) => Promise<SvcResult>): Promise<Response> {
  const requestId = requestIdOf(request);
  try {
    const text = await readBody(request);
    const url = new URL(request.url);
    const keys = appSigningKeys();
    if (keys.length === 0) throw new SvcError(503, "service_unavailable");
    const verified = verifySignature({ keys, method: request.method, pathAndQuery: url.pathname + url.search, body: text, headers: request.headers });
    if (!verified.ok) throw new SvcError(401, "unauthorized");
    const payload = await getPayload({ config });
    // The nonce is claimed only after the signature is valid: an unsigned caller cannot fill the table.
    if (!(await claimNonce(poolOf(payload), verified.nonce))) throw new SvcError(401, "unauthorized");
    const body = parseJsonObject(text);
    return toResponse(requestId, await handler({ payload, requestId, url, request, body }));
  } catch (error) {
    return failure(requestId, error);
  }
}

/** Wrapper of the endpoints without a signature (health, content with a read token): the handler authenticates itself. */
export async function handlePublicInternal(request: Request, handler: (context: Omit<SvcContext, "body">) => Promise<SvcResult>): Promise<Response> {
  const requestId = requestIdOf(request);
  try {
    const payload = await getPayload({ config });
    return toResponse(requestId, await handler({ payload, requestId, url: new URL(request.url), request }));
  } catch (error) {
    return failure(requestId, error);
  }
}
