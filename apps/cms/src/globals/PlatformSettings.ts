import type { GlobalConfig } from "payload";
import { adminOnly, adminOrSupport, deny } from "../access";
import { diffFields, recordAudit } from "../lib/audit";

/**
 * Platform-wide values. `defaultTrialDays` is the standard length of the trial period (30, adjustable,
 * ADR 6, O2). A per-account override is `users.trialDaysOverride`. The value 60 days for beta participants
 * stays as decided in #364: it is not a setting here. Only admins change it, and the change is audited.
 */
export const PlatformSettings: GlobalConfig = {
  slug: "platform-settings",
  label: "Plattform-Einstellungen",
  access: { read: adminOrSupport, update: adminOnly, readVersions: deny },
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        await recordAudit(req, { action: "settings.default_trial_days", targetType: "platform-settings", targetId: "platform-settings", changes: diffFields(previousDoc, doc, ["defaultTrialDays"]) });
        return doc;
      },
    ],
  },
  fields: [
    {
      name: "defaultTrialDays",
      type: "number",
      required: true,
      defaultValue: 30,
      min: 1,
      max: 3650,
      label: "Standard-Testdauer (Tage)",
      admin: {
        description:
          "Gilt für neue Konten: Das Testende wird einmal bei der E-Mail-Bestätigung gesetzt (Bestätigungstag plus diese Tage). Konten mit Testende, Bestandskonten und die Beta-Teilnehmer mit 60 Tagen (#364) ändern sich dadurch nicht; für ein einzelnes Konto gibt es die Dauer-Überschreibung. Jede Änderung wird im Audit festgehalten.",
        step: 1,
      },
    },
  ],
};
