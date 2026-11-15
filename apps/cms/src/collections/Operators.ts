import { AuthenticationError, ValidationError } from "payload";
import type { CollectionBeforeDeleteHook, CollectionConfig } from "payload";
import { adminOnly, adminOnlyField, allowRoles, anyOperator, denyField, hiddenUnless, operatorRole, signedInOperator } from "../access";
import { diffFields, recordAudit, recordFieldAudits } from "../lib/audit";
import { beginSetup, confirmSetup, resetFactor, verifyCode } from "../lib/operator-mfa";
import { passwordHooks } from "../lib/password-hooks";

/**
 * Operators: people who use the admin UI (ADR 2, 3, O9; ticket #206). Roles `admin`, `support`, `editor` (the
 * matrix is in `access/index.ts`); new operators default to the least privileged role. The second factor is
 * mandatory (own build, `lib/operator-mfa.ts`): a session counts only after it, and an operator without a
 * factor sees only the setup. The secret, the pending secret, the last used step and the recovery hashes are
 * fields nobody can read or write through the API; the endpoints use the Local API. `blocked` closes an account
 * without deleting it; the last active admin can be neither blocked, demoted nor deleted. The password rule
 * applies to operators as well (spike: only with the hook). Every change is audited (`operator-audit`).
 */
const secret = { read: denyField, create: denyField, update: denyField };

async function otherActiveAdmins(req: Parameters<CollectionBeforeDeleteHook>[0]["req"], exceptId: string | number): Promise<number> {
  const result = await req.payload.count({
    collection: "operators",
    where: { and: [{ role: { equals: "admin" } }, { blocked: { not_equals: true } }, { id: { not_equals: exceptId } }] },
    overrideAccess: true,
  });
  return result.totalDocs;
}

const lastAdminError = () => new ValidationError({ errors: [{ message: "Es muss mindestens ein aktiver Admin bleiben.", path: "role" }] });

export const Operators: CollectionConfig = {
  slug: "operators",
  labels: { singular: "Betreiber", plural: "Betreiber" },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "role", "blocked", "totpEnabledAt"],
    group: "Betreiber",
    hidden: hiddenUnless("admin"),
    description: "Betreiberkonten der Admin-Oberfläche. Anlegen, Rolle ändern, zweiten Faktor zurücksetzen, sperren und löschen dürfen nur Admins.",
  },
  auth: {
    tokenExpiration: 8 * 60 * 60,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    useSessions: true,
    removeTokenFromResponses: true,
    cookies: { sameSite: "Strict", secure: process.env.NODE_ENV === "production" },
  },
  access: {
    // The admin UI is only for operators; the guard in front of /api lets only operator sessions in. A session without
    // the second factor (or a blocked account) has no role and therefore no access to the UI either.
    admin: ({ req }) => operatorRole(req) !== null,
    create: adminOnly,
    // Everybody who is signed in sees themselves, also before the second factor (Payload's `me` needs it, and the
    // secret fields are closed for everybody anyway); the list of all operators is for admins.
    read: ({ req }) => {
      const operator = signedInOperator(req);
      if (!operator || operator.blocked) return false;
      if (operatorRole(req) === "admin") return true;
      return { id: { equals: operator.id } };
    },
    update: ({ req }) => {
      const role = operatorRole(req);
      if (role === "admin") return true;
      if (role && req.user) return { id: { equals: req.user.id } };
      return false;
    },
    delete: adminOnly,
    unlock: adminOnly,
    readVersions: adminOnly,
  },
  endpoints: [
    { path: "/mfa/begin", method: "post", handler: beginSetup },
    { path: "/mfa/confirm", method: "post", handler: confirmSetup },
    { path: "/mfa/verify", method: "post", handler: verifyCode },
    { path: "/:id/mfa-reset", method: "post", handler: resetFactor },
  ],
  fields: [
    { name: "name", type: "text", label: "Name" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "editor",
      label: "Rolle",
      admin: { description: "Admin: alles. Support: liest Benutzer, Zugänge, Testende und Inhalte, ändert nichts. Editor: nur Blog, News und Medien." },
      options: [
        { label: "Admin", value: "admin" },
        { label: "Support", value: "support" },
        { label: "Editor", value: "editor" },
      ],
      access: {
        // Only admins assign roles; nobody raises their own.
        create: adminOnlyField,
        update: adminOnlyField,
      },
    },
    {
      name: "blocked",
      type: "checkbox",
      defaultValue: false,
      label: "Gesperrt",
      admin: { description: "Ein gesperrter Betreiber kann sich nicht anmelden und hat keinen Zugriff mehr. Beim Ausscheiden: sperren, danach löschen (docs/LOESCHKONZEPT.md)." },
      access: { create: adminOnlyField, update: adminOnlyField },
    },
    { name: "blockedAt", type: "date", label: "Gesperrt seit", admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } }, access: { create: denyField, update: denyField } },
    {
      name: "totpEnabledAt",
      type: "date",
      label: "Zweiter Faktor eingerichtet am",
      admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" }, description: "Leer: der Betreiber sieht nach der Anmeldung nur die Einrichtung." },
      access: { create: denyField, update: denyField },
    },
    {
      name: "mfaReset",
      type: "ui",
      admin: { components: { Field: "@/components/ResetMfa#ResetMfa" } },
    },
    // Never readable or writable through the API; only the endpoints of lib/operator-mfa.ts use them.
    { name: "totpSecret", type: "text", access: secret, admin: { hidden: true } },
    { name: "totpPending", type: "text", access: secret, admin: { hidden: true } },
    { name: "totpLastStep", type: "number", access: secret, admin: { hidden: true } },
    { name: "recoveryHashes", type: "json", access: secret, admin: { hidden: true } },
  ],
  hooks: {
    ...passwordHooks(),
    beforeLogin: [
      ({ user, req }) => {
        if ((user as { blocked?: boolean }).blocked) throw new AuthenticationError(req.t);
        return user;
      },
    ],
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        const next = data as Record<string, unknown>;
        // afterChange does not see the password; the audit only learns that it was set (never the value).
        if (typeof next.password === "string") (req.context as Record<string, unknown>).passwordChanged = true;
        if (operation === "update" && originalDoc) {
          const before = originalDoc as { id: string | number; role?: string; blocked?: boolean };
          const losesAdmin = before.role === "admin" && !before.blocked && ((next.role !== undefined && next.role !== "admin") || next.blocked === true);
          if (losesAdmin && (await otherActiveAdmins(req, before.id)) === 0) throw lastAdminError();
          if (next.blocked === true && !before.blocked) next.blockedAt = new Date().toISOString();
          if (next.blocked === false && before.blocked) next.blockedAt = null;
        }
        if (operation === "create" && next.blocked === true) next.blockedAt = new Date().toISOString();
        return next;
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const doc = (await req.payload.findByID({ collection: "operators", id, depth: 0, overrideAccess: true, req })) as { role?: string; blocked?: boolean };
        if (doc.role === "admin" && !doc.blocked && (await otherActiveAdmins(req, id)) === 0) throw lastAdminError();
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        const base = { targetType: "operators" as const, targetId: doc.id, targetLabel: doc.email };
        if (operation === "create") {
          await recordAudit(req, { ...base, action: "operator.create", changes: [{ field: "role", from: null, to: doc.role }] });
          return doc;
        }
        const changes = diffFields(previousDoc, doc, ["role", "blocked", "email", "name"]);
        await recordFieldAudits(req, base, changes, { role: "operator.role", email: "operator.profile", name: "operator.profile" });
        const blocked = changes.find((change) => change.field === "blocked");
        if (blocked) await recordAudit(req, { ...base, action: doc.blocked ? "operator.block" : "operator.unblock", changes: [blocked] });
        if ((req.context as { passwordChanged?: boolean }).passwordChanged) {
          await recordAudit(req, { ...base, action: "operator.password", changes: [{ field: "password", from: null, to: "geändert" }] });
        }
        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        await recordAudit(req, { action: "operator.delete", targetType: "operators", targetId: doc.id, targetLabel: doc.email, changes: [{ field: "role", from: doc.role ?? null, to: null }] });
      },
    ],
  },
};

export { anyOperator, allowRoles };
