import type { CollectionConfig } from "payload";
import { adminOnly, deny } from "../access";

/**
 * Read tokens for `GET /svc/v1/content/{blog|news}` (option T, ADR 3): at least 256 bits, only the hash
 * is stored. Not a Payload API key and not a session, so it is worthless on `/api` and `/admin`.
 * Rotation: two rows valid at the same time. Revocation: delete the row, effective at once. Audit: only a
 * counter and the time of the last use. Created by `bun run read-token create`, never through REST.
 */
export const ReadTokens: CollectionConfig = {
  slug: "read-tokens",
  admin: { useAsTitle: "label", defaultColumns: ["label", "uses", "lastUsedAt", "expiresAt"], group: "Betreiber" },
  access: { create: deny, read: adminOnly, update: deny, delete: adminOnly, readVersions: deny },
  fields: [
    { name: "label", type: "text", required: true },
    { name: "tokenHash", type: "text", required: true, unique: true, admin: { readOnly: true } },
    { name: "expiresAt", type: "date", admin: { description: "Optional: Ablauf für die Rotation." } },
    { name: "uses", type: "number", defaultValue: 0, admin: { readOnly: true } },
    { name: "lastUsedAt", type: "date", admin: { readOnly: true } },
  ],
};
