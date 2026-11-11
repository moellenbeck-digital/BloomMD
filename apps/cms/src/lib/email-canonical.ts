/**
 * Canonical form of an email address (#169, #277): used only to recognise several addresses of one
 * mailbox when the free trial is granted. Never used to send mail.
 *
 * Same rules as `apps/app/src/lib/email-canonical.ts` (the SQL variant of the app, migration 014,
 * is replaced here by this function; the rule exists once in TypeScript):
 * - lowercase;
 * - `+tag` in the local part is dropped (all domains);
 * - gmail.com / googlemail.com additionally lose the dots of the local part, and googlemail.com
 *   becomes gmail.com;
 * - a local part that would end up empty (`+tag@x.de`) is left as it was.
 */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function canonicalEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return normalized;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const gmail = GMAIL_DOMAINS.has(domain);
  let stripped = local.split("+")[0] ?? local;
  if (gmail) stripped = stripped.replaceAll(".", "");
  return `${stripped || local}@${gmail ? "gmail.com" : domain}`;
}
