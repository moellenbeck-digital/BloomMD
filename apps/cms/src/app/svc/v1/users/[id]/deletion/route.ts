import { deleteUser, isUuid } from "@/lib/identity";
import { SvcError, handleApp } from "@/lib/svc";

export const dynamic = "force-dynamic";

const KEY = /^[A-Za-z0-9._:-]{8,128}$/;

/** Deletion order, idempotent through the `Idempotency-Key` header: `request` locks, `complete` deletes (ADR 13). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApp(request, async ({ payload, body }) => {
    const { id } = await context.params;
    if (!isUuid(id)) throw new SvcError(404, "not_found");
    const key = request.headers.get("idempotency-key") ?? "";
    if (!KEY.test(key)) throw new SvcError(400, "invalid_request", { fields: { "Idempotency-Key": "8 to 128 characters" } });
    const phase = body.phase === undefined ? "request" : body.phase;
    if (phase !== "request" && phase !== "complete") throw new SvcError(400, "invalid_request", { fields: { phase: "request | complete" } });
    const result = await deleteUser(payload, id, key, phase);
    return { status: phase === "request" ? 202 : 200, body: result };
  });
}
