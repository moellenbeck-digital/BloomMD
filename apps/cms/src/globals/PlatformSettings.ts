import type { GlobalConfig } from "payload";
import { adminOnly, adminOrSupport, deny } from "../access";

/**
 * Platform-wide values. `defaultTrialDays` is the standard length of the trial period (30, adjustable,
 * ADR 6). A per-account override is `users.trialDaysOverride`. The value 60 days for beta participants
 * is decided in the O2 ticket; here is only the field.
 */
export const PlatformSettings: GlobalConfig = {
  slug: "platform-settings",
  label: "Plattform-Einstellungen",
  access: { read: adminOrSupport, update: adminOnly, readVersions: deny },
  fields: [{ name: "defaultTrialDays", type: "number", required: true, defaultValue: 30, min: 1, max: 3650 }],
};
