import { accessState, etagOf, findUser, isUuid } from "@/lib/identity";
import { SvcError, handleApp, respond } from "@/lib/svc";

export const dynamic = "force-dynamic";

/** Rights state with `ETag` and a cache lifetime of 60 seconds (A3); `If-None-Match` answers 304. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApp(request, async ({ payload, requestId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) throw new SvcError(404, "not_found");
    const user = await findUser(payload, id);
    if (!user) throw new SvcError(404, "not_found");
    const state = await accessState(payload, user);
    const etag = etagOf(state);
    const headers = { etag, "cache-control": "private, max-age=60" };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...headers, "x-request-id": requestId } });
    return respond(requestId, { access: state }, 200, headers);
  });
}
