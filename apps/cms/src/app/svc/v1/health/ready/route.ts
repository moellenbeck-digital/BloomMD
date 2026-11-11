import { access, constants } from "node:fs/promises";
import { handlePublicInternal } from "@/lib/svc";
import { poolOf } from "@/lib/shared-store";

export const dynamic = "force-dynamic";

/** Readiness for Kubernetes: database and media directory, answer without data (ADR 3). */
export async function GET(request: Request) {
  return handlePublicInternal(request, async ({ payload }) => {
    try {
      await poolOf(payload).query("select 1");
      const mediaDir = (payload.collections.media.config.upload as { staticDir?: string }).staticDir;
      if (mediaDir) await access(mediaDir, constants.W_OK);
      return { body: { ready: true } };
    } catch {
      return { status: 503, body: { ready: false } };
    }
  });
}
