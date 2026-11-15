import type { CollectionConfig } from "payload";
import { adminOnly, adminOrSupport, deny, hiddenUnless } from "../access";
import { diffFields, recordAudit } from "../lib/audit";

const AUDITED = ["feature", "source", "active", "expiresAt"] as const;

/**
 * Access rights of an account (cloud features). Mirrors `bloom_entitlements` of the app: unique per (user, feature, source).
 * Admins maintain them (also on the account itself, as a list in the tab "Zugänge"); support reads. Every change an
 * operator makes is audited.
 */
export const Entitlements: CollectionConfig = {
  slug: "entitlements",
  labels: { singular: "Zugang (Entitlement)", plural: "Zugänge (Entitlements)" },
  admin: {
    useAsTitle: "feature",
    defaultColumns: ["user", "feature", "source", "active", "expiresAt"],
    group: "Plattform",
    hidden: hiddenUnless("admin", "support"),
    description: "Einzelne Zugänge eines Kontos (z. B. Cloud-Funktionen). Nur Admins ändern.",
  },
  access: { create: adminOnly, read: adminOrSupport, update: adminOnly, delete: adminOnly, readVersions: deny },
  indexes: [{ fields: ["user", "feature", "source"], unique: true }],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        const user = typeof doc.user === "object" && doc.user ? String((doc.user as { id: unknown }).id) : String(doc.user);
        const base = { targetType: "entitlements" as const, targetId: doc.id, targetUser: user };
        if (operation === "create") await recordAudit(req, { ...base, action: "entitlement.create", changes: diffFields({}, doc, AUDITED) });
        else await recordAudit(req, { ...base, action: "entitlement.update", changes: diffFields(previousDoc, doc, AUDITED) });
        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const user = typeof doc.user === "object" && doc.user ? String((doc.user as { id: unknown }).id) : String(doc.user);
        await recordAudit(req, { action: "entitlement.delete", targetType: "entitlements", targetId: doc.id, targetUser: user, changes: diffFields(doc, {}, AUDITED) });
      },
    ],
  },
  fields: [
    { name: "user", type: "relationship", relationTo: "users", required: true, index: true, label: "Konto" },
    { name: "feature", type: "text", required: true, label: "Funktion" },
    { name: "source", type: "text", required: true, defaultValue: "manual", label: "Quelle" },
    { name: "active", type: "checkbox", defaultValue: true, index: true, label: "Aktiv" },
    { name: "expiresAt", type: "date", label: "Läuft ab am" },
  ],
};
