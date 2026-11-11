/**
 * Password rule of the platform (same as `assertStrongPassword` in `apps/app/src/lib/passwordAuth.ts`):
 * at least 10 characters, letters and digits. Payload only checks the length (default 3), so the rule
 * is enforced by hooks on every path that sets a password: create, update and the reset
 * (`beforeOperation` for `resetPassword`, because `beforeValidate` is skipped there, spike deviation 8).
 */
export const PASSWORD_MIN_LENGTH = 10;

export function passwordRuleError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "Das Passwort muss mindestens 10 Zeichen lang sein.";
  if (!/[a-z]/i.test(password) || !/[0-9]/.test(password)) return "Das Passwort muss Buchstaben und Zahlen enthalten.";
  return null;
}
