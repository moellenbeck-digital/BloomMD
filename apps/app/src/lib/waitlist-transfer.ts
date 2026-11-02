import {
  claimWaitlistInvitation,
  createAuthToken,
  createPreparedWaitlistAccount,
  findWaitlistTransferState,
  releaseWaitlistInvitation,
  type WaitlistLocale,
  type WaitlistTransferState,
} from "./db";
import { sendWaitlistActivationEmail } from "./email";
import { assertAccountMailBudget, MailBudgetError } from "./mail-budget";
import { WAITLIST_ACTIVATION_TTL_DAYS } from "./waitlist-transfer-constants";

/**
 * Transfer of the ended waitlist to accounts (#105). Every confirmed, not unsubscribed address of
 * the `waitlist export` CSV gets a prepared account (no password, address not confirmed) and one
 * activation mail. Nobody can sign in before the person redeems the link: that confirms the
 * address, sets the password and records the consent to privacy policy and terms.
 */

export interface WaitlistCsvEntry {
  email: string;
  source: string | null;
}

export interface ParsedWaitlistExport {
  /** Data rows of the CSV, whatever their status. */
  rows: number;
  /** Rows with status "bestätigt" (the export only has unsubscribed ones under "abgemeldet"). */
  confirmed: WaitlistCsvEntry[];
  /** The closing line "N Einträge, davon bestätigt M" when the file carries it. */
  trailer: { total: number; confirmed: number } | null;
}

const EXPORT_HEADER = ["email", "status", "zeitpunkt", "quelle"];
const EXPORT_STATUS = new Set(["bestätigt", "offen", "abgemeldet"]);
const TRAILER = /^(\d+) Einträge, davon bestätigt (\d+)$/;

/** Minimal RFC 4180 reader for the cells `waitlist export` writes (quotes, commas, line breaks). */
function readCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === "\"" && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === "\"") {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The CSV ends inside a quoted cell; the file is cut off or damaged.");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => !(entry.length === 1 && entry[0]!.trim() === ""));
}

/**
 * Reads the CSV of `waitlist export`. Refuses anything that does not look like it (header, status
 * values, cell count), because a wrong file must stop the run before anybody is written to. If the
 * file ends with the export's summary line, its numbers must equal what was read.
 */
export function parseWaitlistExportCsv(text: string): ParsedWaitlistExport {
  const all = readCsvRows(text.replace(/^﻿/, ""));
  let trailer: ParsedWaitlistExport["trailer"] = null;
  const last = all[all.length - 1];
  const trailerMatch = last && last.length === 1 ? TRAILER.exec(last[0]!.trim()) : null;
  if (trailerMatch) {
    trailer = { total: Number(trailerMatch[1]), confirmed: Number(trailerMatch[2]) };
    all.pop();
  }

  const [header, ...data] = all;
  if (!header || header.map((cell) => cell.trim().toLowerCase()).join(",") !== EXPORT_HEADER.join(",")) {
    throw new Error(`The CSV is not a waitlist export: the header must be "${EXPORT_HEADER.join(",")}".`);
  }

  const confirmed: WaitlistCsvEntry[] = [];
  for (const [index, cells] of data.entries()) {
    if (cells.length !== EXPORT_HEADER.length) throw new Error(`CSV row ${index + 2} has ${cells.length} cells, expected ${EXPORT_HEADER.length}.`);
    const status = cells[1]!.trim().normalize("NFC");
    if (!EXPORT_STATUS.has(status)) throw new Error(`CSV row ${index + 2} has an unknown status.`);
    if (status === "bestätigt") confirmed.push({ email: cells[0]!.trim(), source: cells[3]!.trim() || null });
  }

  if (trailer && (trailer.total !== data.length || trailer.confirmed !== confirmed.length)) {
    throw new Error(`The summary line of the CSV (${trailer.total}/${trailer.confirmed}) does not match its rows (${data.length}/${confirmed.length}); the file is cut off or was edited.`);
  }
  return { rows: data.length, confirmed, trailer };
}

/** The English landing page records a source ending in `-en` (`landing-en`); everything else gets German. */
export function waitlistTransferLocale(source: string | null): WaitlistLocale {
  return source?.endsWith("-en") ? "en" : "de";
}

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface WaitlistTransferDeps {
  find: (email: string) => Promise<WaitlistTransferState | null>;
  /** Creates the prepared account; null when the address has an account by now. */
  create: (email: string, locale: WaitlistLocale) => Promise<string | null>;
  /** Takes the one-time mail; null when it was taken already. */
  claim: (userId: string) => Promise<WaitlistLocale | null>;
  release: (userId: string) => Promise<void>;
  /** Reserves one mail of the global budget or throws {@link MailBudgetError}. */
  budget: () => Promise<void>;
  /** Issues the single-use token and sends the mail. */
  send: (user: { id: string; email: string }, locale: WaitlistLocale) => Promise<{ sent: boolean }>;
}

/** Numbers only; no address ever leaves the run. */
export interface WaitlistTransferResult {
  dryRun: boolean;
  /** Data rows of the CSV. */
  rows: number;
  /** Rows that are not "bestätigt" (open or unsubscribed): neither transferred nor mailed. */
  notConfirmed: number;
  /** Rows "bestätigt"; equals `created + retried + alreadyRegistered + alreadyInvited + deferred + duplicates + invalid`. */
  confirmed: number;
  /** Prepared account created (dry run: would be created). */
  created: number;
  /** Account of an earlier run whose mail had not gone out; tried again (dry run: would be). */
  retried: number;
  /** Address already has an account that is not an unfinished transfer: nothing created, changed or mailed. */
  alreadyRegistered: number;
  /** Prepared by an earlier run and its mail was sent (or is being sent by another run). */
  alreadyInvited: number;
  /** Would have been mailed, but the run stopped first (mail budget, `--limit`); run again. */
  deferred: number;
  /** Same address twice in the CSV. */
  duplicates: number;
  /** Address that is not an email address. */
  invalid: number;
  mailSent: number;
  /** Mail not sent; the claim was given back, so the next run tries this address again. */
  mailFailed: number;
}

export interface WaitlistTransferBalance {
  /** The categories add up to "bestätigt" and, when applied, every account attempted ended as sent or failed. */
  balanced: boolean;
  /** "bestätigt M" of the export equals the rows read; null when no expected number is known. */
  matchesExport: boolean | null;
}

export function checkWaitlistTransferBalance(result: WaitlistTransferResult, expectedConfirmed: number | null): WaitlistTransferBalance {
  const categories = result.created + result.retried + result.alreadyRegistered + result.alreadyInvited + result.deferred + result.duplicates + result.invalid;
  const mailsAccounted = result.dryRun || result.mailSent + result.mailFailed === result.created + result.retried;
  return {
    balanced: categories === result.confirmed && result.confirmed + result.notConfirmed === result.rows && mailsAccounted,
    matchesExport: expectedConfirmed == null ? null : expectedConfirmed === result.confirmed,
  };
}

const defaultDeps: WaitlistTransferDeps = {
  find: findWaitlistTransferState,
  create: (email, locale) => createPreparedWaitlistAccount({ email, locale }),
  claim: claimWaitlistInvitation,
  release: releaseWaitlistInvitation,
  budget: () => assertAccountMailBudget("waitlist-activation"),
  send: async (user, locale) => {
    const activation = await createAuthToken({
      userId: user.id,
      email: user.email,
      purpose: "waitlist_activation",
      ttlMinutes: WAITLIST_ACTIVATION_TTL_DAYS * 24 * 60,
    });
    if (!activation) return { sent: false };
    return sendWaitlistActivationEmail(user.email, activation.token, { lang: locale });
  },
};

/**
 * Prepares the accounts and sends the one-time mails.
 *
 * Dry run (default) only looks: it writes and sends nothing. With `apply`, an address is handled
 * like this:
 *  - it has an account that is not an unfinished transfer: nothing happens ("already registered");
 *  - it was prepared and mailed by an earlier run: nothing happens ("already invited");
 *  - otherwise the mail is taken first (marked in `bloom_waitlist_transfers`), then sent, so a
 *    second run or a crash halfway never mails anybody twice. A failed send gives the mark back,
 *    which makes exactly this address repeatable. The global mail budget applies as for sign-up;
 *    when it is used up the run stops sending and reports the rest as deferred.
 */
export async function runWaitlistTransfer(
  entries: WaitlistCsvEntry[],
  options: { apply?: boolean; rows?: number; limit?: number } = {},
  deps: WaitlistTransferDeps = defaultDeps,
): Promise<WaitlistTransferResult> {
  const apply = options.apply ?? false;
  const result: WaitlistTransferResult = {
    dryRun: !apply,
    rows: options.rows ?? entries.length,
    notConfirmed: (options.rows ?? entries.length) - entries.length,
    confirmed: entries.length,
    created: 0,
    retried: 0,
    alreadyRegistered: 0,
    alreadyInvited: 0,
    deferred: 0,
    duplicates: 0,
    invalid: 0,
    mailSent: 0,
    mailFailed: 0,
  };
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const seen = new Set<string>();
  let stopped = false;
  let attempted = 0;

  for (const entry of entries) {
    const email = entry.email.trim().toLowerCase();
    if (!ADDRESS.test(email)) {
      result.invalid += 1;
      continue;
    }
    if (seen.has(email)) {
      result.duplicates += 1;
      continue;
    }
    seen.add(email);

    const state = await deps.find(email);
    const locale = waitlistTransferLocale(entry.source);
    if (state?.transfer?.invitedAt) {
      result.alreadyInvited += 1;
      continue;
    }
    // An account that is not an unfinished transfer, or one the person has taken over meanwhile
    // (signed up or confirmed by themselves): leave it alone.
    if (state && (!state.transfer || state.hasPassword || state.emailVerified)) {
      result.alreadyRegistered += 1;
      continue;
    }

    if (!apply) {
      if (state) result.retried += 1;
      else result.created += 1;
      continue;
    }
    if (stopped || attempted >= limit) {
      result.deferred += 1;
      continue;
    }

    try {
      await deps.budget();
    } catch (error) {
      if (!(error instanceof MailBudgetError)) throw error;
      stopped = true;
      result.deferred += 1;
      continue;
    }
    attempted += 1;

    let userId = state?.userId ?? null;
    if (!userId) {
      userId = await deps.create(email, locale);
      if (!userId) {
        result.alreadyRegistered += 1;
        continue;
      }
      result.created += 1;
    }
    const claimedLocale = await deps.claim(userId);
    if (!claimedLocale) {
      // Another run took it, or the person activated in the meantime. A new account was counted as created above.
      if (state) result.alreadyInvited += 1;
      else result.mailFailed += 1;
      continue;
    }
    if (state) result.retried += 1;

    let delivered = false;
    try {
      delivered = (await deps.send({ id: userId, email }, claimedLocale)).sent;
    } catch (error) {
      console.error("[BloomMD] Waitlist activation mail failed:", error instanceof Error ? error.name : "unknown");
    }
    if (delivered) {
      result.mailSent += 1;
    } else {
      result.mailFailed += 1;
      try {
        await deps.release(userId);
      } catch (error) {
        console.error("[BloomMD] Waitlist claim could not be released:", error instanceof Error ? error.name : "unknown");
      }
    }
  }
  return result;
}
