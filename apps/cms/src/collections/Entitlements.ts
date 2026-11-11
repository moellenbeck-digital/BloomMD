import type { CollectionConfig } from "payload";
import { adminOnly, adminOrSupport, deny } from "../access";

/** Access rights of an account (cloud features). Mirrors `bloom_entitlements` of the app: unique per (user, feature, source). */
export const Entitlements: CollectionConfig = {
  slug: "entitlements",
  admin: { useAsTitle: "feature", defaultColumns: ["user", "feature", "source", "active", "expiresAt"], group: "Plattform" },
  access: { create: adminOnly, read: adminOrSupport, update: adminOnly, delete: adminOnly, readVersions: deny },
  indexes: [{ fields: ["user", "feature", "source"], unique: true }],
  fields: [
    { name: "user", type: "relationship", relationTo: "users", required: true, index: true },
    { name: "feature", type: "text", required: true },
    { name: "source", type: "text", required: true, defaultValue: "manual" },
    { name: "active", type: "checkbox", defaultValue: true, index: true },
    { name: "expiresAt", type: "date" },
  ],
};
