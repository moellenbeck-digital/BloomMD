import type { ConnectionProfile } from "./settings";

/**
 * Validate a connection before activating it. Keeping these operations separate is important:
 * a failed authentication or network request must not replace the currently active session.
 */
export async function validateAndActivateConnection<Validated>(
  profile: ConnectionProfile,
  validate: (profile: ConnectionProfile) => Promise<Validated>,
  activate: (profile: ConnectionProfile, validated: Validated) => Promise<unknown>,
): Promise<Validated> {
  const validated = await validate(profile);
  await activate(profile, validated);
  return validated;
}
