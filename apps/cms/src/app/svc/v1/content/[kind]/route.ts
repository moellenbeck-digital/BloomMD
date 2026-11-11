import { authenticateReadToken, isContentKind, publishedContent } from "@/lib/content";
import { SvcError, handlePublicInternal } from "@/lib/svc";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  return handlePublicInternal(request, async ({ payload, url }) => {
    const { kind } = await context.params;
    if (!isContentKind(kind)) throw new SvcError(404, "not_found");
    await authenticateReadToken(payload, request.headers.get("authorization"));
    return { body: await publishedContent(payload, kind, url) };
  });
}
