import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Mail outbox of the open-signup suite. The app writes mails here instead of sending them when
 * `BLOOMMD_E2E_TEST_MODE=1` and `BLOOMMD_E2E_MAIL_OUTBOX` are set (see `lib/email.ts`). The file is
 * append-only; tests find their mail by their own unique address.
 */
export const MAIL_OUTBOX_PATH = join(tmpdir(), "bloommd-e2e-open-signup-mail.jsonl");

interface OutboxMail {
  to: string;
  subject: string;
  text: string;
}

export function readMails(to?: string): OutboxMail[] {
  if (!existsSync(MAIL_OUTBOX_PATH)) return [];
  return readFileSync(MAIL_OUTBOX_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxMail)
    .filter((mail) => !to || mail.to.toLowerCase() === to.toLowerCase());
}

/**
 * Path and query of the newest link in a mail to `to` whose URL contains `pathPart`, or null while
 * no such mail exists. Only path and query are returned: a production server builds mail links for
 * the public app domain, and the test must stay on its own origin.
 */
export function latestLink(to: string, pathPart: string): string | null {
  const mails = readMails(to).reverse();
  for (const mail of mails) {
    const link = mail.text.split(/\s+/).find((word) => /^https?:\/\//.test(word) && word.includes(pathPart));
    if (link) {
      const url = new URL(link);
      return `${url.pathname}${url.search}`;
    }
  }
  return null;
}
