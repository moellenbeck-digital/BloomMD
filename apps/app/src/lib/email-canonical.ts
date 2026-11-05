/**
 * Canonical form of an email address (#277), used only to recognise several addresses of one
 * mailbox when the free trial is granted. It is never used to send mail: mails go to the address
 * the person entered.
 *
 * - lowercase;
 * - `+tag` in the local part is dropped (all domains);
 * - gmail.com / googlemail.com additionally lose the dots of the local part, and googlemail.com
 *   becomes gmail.com. Dots stay for every other domain.
 *
 * A local part that would end up empty (`+tag@x.de`) is left as it was. The column
 * `bloom_users.email_canonical` computes the same rules in SQL (db/014_email_canonical.sql); the
 * two must stay in sync.
 */

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function canonicalEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return normalized;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const gmail = GMAIL_DOMAINS.has(domain);
  let stripped = local.split("+")[0]!;
  if (gmail) stripped = stripped.replaceAll(".", "");
  return `${stripped || local}@${gmail ? "gmail.com" : domain}`;
}
