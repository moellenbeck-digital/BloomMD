import type { CollectionConfig } from "payload";
import { adminOrSupport, deny } from "../access";

/** Reminder mails of the trial period (#274): at most one per account and kind, claimed before sending. */
export const TrialReminders: CollectionConfig = {
  slug: "trial-reminders",
  admin: { useAsTitle: "kind", defaultColumns: ["user", "kind", "claimedAt", "sentAt"], group: "Plattform" },
  access: { create: deny, read: adminOrSupport, update: deny, delete: deny, readVersions: deny },
  indexes: [{ fields: ["user", "kind"], unique: true }],
  fields: [
    { name: "user", type: "relationship", relationTo: "users", required: true, index: true },
    { name: "kind", type: "select", required: true, options: ["15", "23"] },
    { name: "claimedAt", type: "date", required: true },
    { name: "sentAt", type: "date" },
  ],
};
