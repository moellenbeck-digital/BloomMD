import config from "@payload-config";
import { getPayload } from "payload";
import { operatorRole } from "../../../../access";
import { isContentKind } from "../../../../lib/content";
import { previewHtml } from "../../../../lib/preview";

export const dynamic = "force-dynamic";

const headers = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};
const notFound = () => new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });

/**
 * Preview of a blog or news entry for operators (ticket #206): the latest draft (or the published version when there
 * is no draft), as plain, escaped HTML. There is no marketing read path yet (#366), so the preview is a page of the
 * admin app itself. Only for a signed-in operator who passed the second factor; everybody else gets the same 404 as
 * for any unknown path. Drafts reach no other route: `/svc/v1/content` reads only what is published.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isContentKind(kind) || !/^\d{1,12}$/.test(id)) return notFound();
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers }).catch(() => ({ user: null }));
  // Every operator role may read content (access/index.ts: contentReaders), so the role check is the access check.
  if (!operatorRole({ user, headers: request.headers })) return notFound();
  const doc = await payload.findByID({ collection: kind, id: Number(id), draft: true, depth: 1, overrideAccess: true }).catch(() => null);
  if (!doc) return notFound();
  return new Response(previewHtml(kind, doc as unknown as Record<string, unknown>), { status: 200, headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
}
