import type { CollectionConfig } from "payload";
import { deny } from "../access";

/**
 * One-time links (ADR 8, spike deviation 6): e-mail confirmation, password set/reset and waitlist
 * activation. Only the SHA-256 of the token is stored, never the token. A token has a purpose, an
 * expiry and is redeemed once, by an atomic update of `usedAt`. No REST access for anybody; the services
 * use the Local API. Payload's own reset and verification tokens (clear text, no expiry) are not used.
 */
export const AuthTokens: CollectionConfig = {
  slug: "auth-tokens",
  admin: { hidden: true },
  access: { create: deny, read: deny, update: deny, delete: deny, readVersions: deny },
  fields: [
    { name: "user", type: "relationship", relationTo: "users", required: true, index: true },
    {
      name: "purpose",
      type: "select",
      required: true,
      options: ["email_verification", "password_reset", "waitlist_activation"],
    },
    { name: "tokenHash", type: "text", required: true, unique: true },
    { name: "expiresAt", type: "date", required: true, index: true },
    { name: "usedAt", type: "date" },
  ],
};
