import { randomUUID } from "node:crypto";
import type { CollectionBeforeValidateHook, CollectionConfig } from "payload";
import { adminOnly, adminOrSupport, deny } from "../access";
import { canonicalEmail } from "../lib/email-canonical";
import { passwordHooks } from "../lib/password-hooks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sets the derived fields of an account: lowercase address, the canonical address of the mailbox
 * (#169, same rule as `apps/app`; the partial unique index in migration `*_svc_support` makes it a
 * guarantee), and a UUID for accounts created in the admin UI.
 */
const deriveAccountFields: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data) return data;
  const next = data as Record<string, unknown>;
  if (operation === "create" && !next.id) next.id = randomUUID();
  const email = next.email;
  if (typeof email === "string") {
    const normalized = email.trim().toLowerCase();
    next.email = normalized;
    next.emailCanonical = canonicalEmail(normalized);
  }
  return next;
};

const markPasswordSet: NonNullable<NonNullable<CollectionConfig["hooks"]>["beforeChange"]>[number] = ({ data }) => {
  const next = data as Record<string, unknown>;
  if (typeof next.password === "string") next.passwordSetAt = new Date().toISOString();
  return next;
};

/**
 * End users: the platform identity of the product app (ADR 5). The single source for account, access
 * and trial period. No REST access for anybody but admins/support in the UI; the app reaches accounts
 * only through `/svc/v1`. The text field `id` carries the UUID of the app (A2, spike deviation 10); with
 * `idType: 'uuid'` Payload would ignore a given id.
 *
 * Waitlist accounts (#105) are accounts without a password (`origin: waitlist`, no hash): they exist in
 * the data model and can be activated through a `waitlist_activation` token. Trial period (#274) is
 * `trialEndsAt` (set once at the confirmation), `trialLegacy`, an optional per-account override of the
 * length and the default in the global `platform-settings`; the value 60 days belongs to a later ticket.
 */
export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "status", "emailVerifiedAt", "trialEndsAt", "origin"],
    group: "Plattform",
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    // The CMS issues no sessions or tokens to end users; the app keeps its own sessions (A1).
    useSessions: false,
    removeTokenFromResponses: true,
    verify: false,
  },
  access: {
    create: adminOnly,
    read: adminOrSupport,
    update: adminOnly,
    delete: adminOnly,
    unlock: adminOnly,
    readVersions: deny,
    // Nobody signs in to the admin UI with an end-user account.
    admin: () => false,
  },
  hooks: {
    ...passwordHooks(),
    beforeValidate: [...(passwordHooks().beforeValidate ?? []), deriveAccountFields],
    beforeChange: [markPasswordSet],
  },
  fields: [
    {
      name: "id",
      type: "text",
      required: true,
      validate: (value: string | null | undefined) => (typeof value === "string" && UUID.test(value) ? true : "id must be a UUID"),
    },
    { name: "name", type: "text" },
    {
      name: "locale",
      type: "select",
      required: true,
      defaultValue: "de",
      options: [
        { label: "Deutsch", value: "de" },
        { label: "English", value: "en" },
      ],
    },
    { name: "emailCanonical", type: "text", index: true, admin: { readOnly: true } },
    { name: "emailVerifiedAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [
        { label: "Aktiv", value: "active" },
        { label: "Löschung angefragt", value: "deletion_requested" },
      ],
    },
    { name: "deletionRequestedAt", type: "date" },
    { name: "deletionKey", type: "text", admin: { readOnly: true } },
    {
      name: "origin",
      type: "select",
      required: true,
      defaultValue: "registration",
      options: [
        { label: "Registrierung", value: "registration" },
        { label: "Warteliste (#105)", value: "waitlist" },
        { label: "Migration", value: "migration" },
      ],
    },
    {
      name: "platformRole",
      type: "select",
      required: true,
      defaultValue: "user",
      options: [
        { label: "Nutzer", value: "user" },
        { label: "Beta-Teilnehmer", value: "beta" },
      ],
    },
    { name: "cloudAccess", type: "checkbox", defaultValue: true, label: "Cloud-Zugang" },
    { name: "waitlistMailSentAt", type: "date" },
    { name: "passwordSetAt", type: "date", admin: { readOnly: true } },
    { name: "trialEndsAt", type: "date", label: "Testende", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "trialLegacy", type: "checkbox", defaultValue: false },
    { name: "trialGuarded", type: "checkbox", defaultValue: true, admin: { description: "Nur geschützte Konten fallen unter den Index „ein bestätigtes Konto je Postfach“ (#169)." } },
    { name: "trialDaysOverride", type: "number", min: 1, max: 3650, admin: { description: "Überschreibt die Standarddauer aus den Plattform-Einstellungen für dieses Konto." } },
    { name: "sessionsValidAfter", type: "date", admin: { description: "Sitzungen der App, die vor diesem Zeitpunkt begonnen haben, sind ungültig." } },
  ],
};
