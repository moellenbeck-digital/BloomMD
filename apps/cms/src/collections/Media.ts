import path from "node:path";
import type { CollectionConfig } from "payload";
import { contentReaders, contentRoles, deny } from "../access";
import { mediaStorage, type EnvLike } from "../lib/env";

/**
 * Images for blog and news. Raster formats only (no SVG: it can carry script). The files live in a private
 * S3 bucket when all `CMS_S3_*` variables are set (storage plugin in `lib/media-storage.ts`, `docs/CMS-MEDIEN-S3.md`),
 * otherwise in a local directory (`CMS_MEDIA_DIR`, development fallback only: it does not survive a pod restart).
 * The collection stays private either way: access is the access functions below behind `/api/media/file/...`,
 * the bucket has no public access. The delivery path of published media (O11) comes with the cluster tickets,
 * and the media URL is therefore not part of `/svc/v1` yet.
 */
export function buildMedia(env: EnvLike = process.env): CollectionConfig {
  const local = mediaStorage(env).mode !== "s3";
  return {
    slug: "media",
    admin: { useAsTitle: "alt", group: "Inhalte" },
    access: { create: contentRoles, read: contentReaders, update: contentRoles, delete: contentRoles, readVersions: deny },
    upload: {
      // With S3 the plugin turns the local storage off; the directory is only needed for the fallback.
      ...(local ? { staticDir: env.CMS_MEDIA_DIR?.trim() || path.resolve(process.cwd(), "media") } : {}),
      mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"],
    },
    fields: [{ name: "alt", type: "text", required: true, label: "Alternativtext" }],
  };
}

export const Media = buildMedia();
