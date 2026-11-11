import path from "node:path";
import type { CollectionConfig } from "payload";
import { contentReaders, contentRoles, deny } from "../access";

/**
 * Images for blog and news. Raster formats only (no SVG: it can carry script). Files go to a local
 * directory (`CMS_MEDIA_DIR`) for now; the S3 storage at Hetzner and the delivery path of published
 * media (O11) come with the cluster tickets, and the media URL is therefore not part of `/svc/v1` yet.
 */
export const Media: CollectionConfig = {
  slug: "media",
  admin: { useAsTitle: "alt", group: "Inhalte" },
  access: { create: contentRoles, read: contentReaders, update: contentRoles, delete: contentRoles, readVersions: deny },
  upload: {
    staticDir: process.env.CMS_MEDIA_DIR?.trim() || path.resolve(process.cwd(), "media"),
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"],
  },
  fields: [{ name: "alt", type: "text", required: true, label: "Alternativtext" }],
};
