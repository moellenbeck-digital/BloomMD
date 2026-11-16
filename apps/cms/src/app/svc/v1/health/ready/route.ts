import { access, constants, mkdir } from "node:fs/promises";
import { mediaStorage } from "@/lib/env";
import { checkMediaBucket } from "@/lib/media-storage";
import { handlePublicInternal } from "@/lib/svc";
import { poolOf } from "@/lib/shared-store";

export const dynamic = "force-dynamic";

/** Readiness for Kubernetes: database and media storage (S3 bucket or local directory), answer without data (ADR 3). */
export async function GET(request: Request) {
  return handlePublicInternal(request, async ({ payload }) => {
    try {
      await poolOf(payload).query("select 1");
      if (mediaStorage().mode === "s3") {
        // Only the bucket is probed; neither the name nor the credentials end up in the answer.
        await checkMediaBucket();
      } else {
        const mediaDir = (payload.collections.media.config.upload as { staticDir?: string }).staticDir;
        if (!mediaDir) throw new Error("no media directory");
        // The directory belongs to the service: create it when a fresh volume is empty, then it must be writable.
        await mkdir(mediaDir, { recursive: true });
        await access(mediaDir, constants.W_OK);
      }
      return { body: { ready: true } };
    } catch {
      return { status: 503, body: { ready: false } };
    }
  });
}
