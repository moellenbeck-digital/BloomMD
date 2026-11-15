import { randomUUID } from "node:crypto";
import type { CollectionBeforeValidateHook, CollectionConfig } from "payload";
import { adminOnly, adminOrSupport, deny, hiddenUnless } from "../access";
import { diffFields, recordFieldAudits } from "../lib/audit";
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
 *
 * The admin UI (#206) groups the fields in tabs (no change to the columns): account, trial period, access
 * (with the entitlements of the account as a join), technical values. Only admins change an account; support reads.
 * What an operator changes in the trial period and the access is audited (`operator-audit`).
 */
export const Users: CollectionConfig = {
  slug: "users",
  labels: { singular: "Benutzer", plural: "Benutzer" },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "status", "emailVerifiedAt", "trialEndsAt", "cloudAccess", "origin", "platformRole"],
    listSearchableFields: ["email"],
    group: "Plattform",
    hidden: hiddenUnless("admin", "support"),
    description: "Konten der Produkt-App. Support liest, nur Admins ändern. Suche nach E-Mail; Filter über „Filter“ (z. B. Status, Herkunft).",
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
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        // Only what an operator does is audited (the app's own changes through /svc/v1 are not operator actions).
        if (operation !== "update") return doc;
        const changes = diffFields(previousDoc, doc, ["trialEndsAt", "trialDaysOverride", "trialLegacy", "cloudAccess", "platformRole"]);
        await recordFieldAudits(req, { targetType: "users", targetId: doc.id, targetUser: String(doc.id) }, changes, {
          trialEndsAt: "account.trial_end",
          trialDaysOverride: "account.trial_days_override",
          trialLegacy: "account.trial_legacy",
          cloudAccess: "account.cloud_access",
          platformRole: "account.beta",
        });
        return doc;
      },
    ],
  },
  fields: [
    // The id has to stay a top-level field (inside a tab Payload would not see it as the id of the collection).
    {
      name: "id",
      type: "text",
      required: true,
      validate: (value: string | null | undefined) => (typeof value === "string" && UUID.test(value) ? true : "id must be a UUID"),
    },
    {
      type: "tabs",
      tabs: [
        {
          label: "Konto",
          fields: [
            { name: "name", type: "text", label: "Name" },
            {
              name: "locale",
              type: "select",
              required: true,
              defaultValue: "de",
              label: "Sprache",
              options: [
                { label: "Deutsch", value: "de" },
                { label: "English", value: "en" },
              ],
            },
            { name: "emailVerifiedAt", type: "date", label: "Bestätigt am", admin: { date: { pickerAppearance: "dayAndTime" } } },
            {
              name: "status",
              type: "select",
              required: true,
              defaultValue: "active",
              label: "Status",
              options: [
                { label: "Aktiv", value: "active" },
                { label: "Löschung angefragt", value: "deletion_requested" },
              ],
            },
            { name: "deletionRequestedAt", type: "date", label: "Löschung angefragt am" },
            {
              name: "origin",
              type: "select",
              required: true,
              defaultValue: "registration",
              label: "Herkunft",
              options: [
                { label: "Registrierung", value: "registration" },
                { label: "Warteliste (#105)", value: "waitlist" },
                { label: "Migration", value: "migration" },
              ],
            },
          ],
        },
        {
          label: "Testzeitraum",
          description: "Wie lange das Konto die App testen kann. Änderungen nur durch Admins; sie werden im Audit festgehalten und gelten in der App sofort.",
          fields: [
            {
              name: "trialEndsAt",
              type: "date",
              label: "Testende",
              admin: {
                date: { pickerAppearance: "dayAndTime" },
                components: { Cell: "@/components/TrialEndsCell#TrialEndsCell" },
                description: "Wird einmal bei der E-Mail-Bestätigung gesetzt (Bestätigungstag plus Standarddauer). Hier ändern verlängert oder verkürzt genau dieses Konto.",
              },
            },
            {
              name: "trialDaysOverride",
              type: "number",
              min: 1,
              max: 3650,
              label: "Dauer-Überschreibung (Tage)",
              admin: { description: "Überschreibt für dieses Konto die Standarddauer aus den Plattform-Einstellungen, sobald das Testende gesetzt wird. Ein schon gesetztes Testende ändert sich dadurch nicht." },
            },
            { name: "trialLegacy", type: "checkbox", defaultValue: false, label: "Bestandskonto (Legacy)", admin: { description: "Konto aus der Zeit vor dem CMS; sein Testende kommt aus der Migration." } },
            { name: "trialGuarded", type: "checkbox", defaultValue: true, label: "Geschützt (ein bestätigtes Konto je Postfach)", admin: { description: "Nur geschützte Konten fallen unter den Index „ein bestätigtes Konto je Postfach“ (#169)." } },
          ],
        },
        {
          label: "Zugänge",
          description: "Was das Konto nutzen darf. Änderungen nur durch Admins und mit Audit.",
          fields: [
            { name: "cloudAccess", type: "checkbox", defaultValue: true, label: "Cloud-Zugang" },
            {
              name: "platformRole",
              type: "select",
              required: true,
              defaultValue: "user",
              label: "Beta-Teilnehmer",
              options: [
                { label: "Nein", value: "user" },
                { label: "Ja", value: "beta" },
              ],
            },
            {
              name: "entitlementList",
              type: "join",
              collection: "entitlements",
              on: "user",
              label: "Zugänge (Entitlements)",
              admin: { allowCreate: true, defaultColumns: ["feature", "source", "active", "expiresAt"] },
            },
          ],
        },
        {
          label: "Technik",
          description: "Abgeleitete und interne Werte; nicht zum Bearbeiten gedacht.",
          fields: [
            { name: "emailCanonical", type: "text", index: true, label: "Postfach (kanonisch)", admin: { readOnly: true } },
            { name: "deletionKey", type: "text", label: "Löschschlüssel", admin: { readOnly: true } },
            { name: "waitlistMailSentAt", type: "date", label: "Wartelisten-Mail gesendet am" },
            { name: "passwordSetAt", type: "date", label: "Passwort gesetzt am", admin: { readOnly: true } },
            { name: "sessionsValidAfter", type: "date", label: "Sitzungen gültig ab", admin: { description: "Sitzungen der App, die vor diesem Zeitpunkt begonnen haben, sind ungültig." } },
          ],
        },
      ],
    },
  ],
};
