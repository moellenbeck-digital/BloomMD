import type { CollectionConfig } from "payload";
import { adminOnly, deny, hiddenUnless } from "../access";
import { AUDIT_ACTIONS, AUDIT_RETENTION_DAYS } from "../lib/audit";

/**
 * Audit of operator actions: append-only. Only `admin` reads; nobody creates, changes or deletes through the
 * UI or the API (only the Local API writes, `lib/audit.ts`). The database enforces the same: a trigger
 * (migration `*_operator_audit`) refuses any change of a row except the relation to the account, which
 * `ON DELETE SET NULL` clears when the account is deleted, and refuses deleting a row younger than 365 days.
 * Entries hold no passwords and no secrets (`lib/audit.ts` lists the fields that may enter).
 */
export const OperatorAudit: CollectionConfig = {
  slug: "operator-audit",
  labels: { singular: "Audit-Eintrag", plural: "Audit" },
  admin: {
    useAsTitle: "action",
    defaultColumns: ["createdAt", "actorEmail", "action", "targetType", "targetUser", "changes"],
    group: "Betreiber",
    hidden: hiddenUnless("admin"),
    description: `Betreiberaktionen: wer, wann, was, alt → neu. Nur anfügbar, nicht änderbar; Aufbewahrung ${AUDIT_RETENTION_DAYS} Tage.`,
    pagination: { defaultLimit: 50 },
  },
  defaultSort: "-createdAt",
  access: { create: deny, read: adminOnly, update: deny, delete: deny, readVersions: deny },
  fields: [
    { name: "actorEmail", type: "text", label: "Wer (E-Mail)", index: true },
    { name: "actorId", type: "text", label: "Wer (ID)" },
    { name: "actorRole", type: "text", label: "Rolle" },
    { name: "action", type: "select", required: true, label: "Was", index: true, options: AUDIT_ACTIONS.map((action) => ({ label: action.label, value: action.value })) },
    { name: "targetType", type: "text", label: "Objekt" },
    { name: "targetId", type: "text", label: "Objekt-ID" },
    { name: "targetUser", type: "relationship", relationTo: "users", label: "Konto", admin: { description: "Wird geleert, wenn das Konto gelöscht wird." } },
    { name: "targetLabel", type: "text", label: "Bezeichnung" },
    { name: "changes", type: "json", label: "Änderungen (Feld, alt → neu)" },
  ],
};
