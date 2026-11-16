import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { s3Storage } from "@payloadcms/storage-s3";
import type { Plugin } from "payload";
import { mediaStorage, s3ClientConfig, type EnvLike } from "./env";

/**
 * Storage plugin of the media collection, active only with all `CMS_S3_*` variables set. The bucket stays
 * private: no ACL, no public prefix, no signed downloads and no client uploads, so every read goes through
 * `/api/media/file/...` with the access functions and the guard in front of `/api`.
 *
 * The plugin is always registered: `alwaysInsertFields` gives the collection the same fields (`prefix`,
 * `_objectKey`) with and without S3, so the database schema (migrations only, `push: false`) does not depend
 * on the environment and switching to S3 needs no migration of its own.
 */
export function mediaStoragePlugins(env: EnvLike = process.env): Plugin[] {
  const storage = mediaStorage(env);
  const s3 = storage.mode === "s3" ? storage.s3 : undefined;
  return [
    s3Storage({
      enabled: Boolean(s3),
      alwaysInsertFields: true,
      collections: { media: true },
      bucket: s3?.bucket ?? "",
      config: s3 ? s3ClientConfig(s3) : {},
    }),
  ];
}

export const MEDIA_HEALTH_TIMEOUT_MS = 3000;

/** Readiness of the S3 bucket (`HeadBucket`, short timeout). Throws when it is not reachable; the caller must not pass the error on. */
export async function checkMediaBucket(env: EnvLike = process.env, timeoutMs = MEDIA_HEALTH_TIMEOUT_MS): Promise<void> {
  const storage = mediaStorage(env);
  if (storage.mode !== "s3") throw new Error("S3 storage is not configured.");
  const client = new S3Client({ ...s3ClientConfig(storage.s3), maxAttempts: 1 });
  try {
    await client.send(new HeadBucketCommand({ Bucket: storage.s3.bucket }), { abortSignal: AbortSignal.timeout(timeoutMs) });
  } finally {
    client.destroy();
  }
}
