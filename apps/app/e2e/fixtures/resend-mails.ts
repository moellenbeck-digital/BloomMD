/**
 * Reads sent mails back through the Resend API, for the E2E proof against a test system (#274): the
 * test system sends its mails through Resend, so a spec cannot read an outbox file there.
 *
 * Uses two endpoints, `GET /emails` (list, newest first, with `to`, `subject`, `created_at`) and
 * `GET /emails/{id}` (adds `text` and `html`). The key is read from the environment by the caller
 * (`PLAYWRIGHT_RESEND_API_KEY`), never written down; it needs full access, a sending-only key cannot read.
 * Resend allows 2 requests per second by default, so requests are spaced and a 429 is retried.
 *
 * Only mails to the given address are returned. Use the Resend test addresses (`delivered+label@resend.dev`):
 * they accept mail without delivering it to a person.
 */

export interface ResendMail {
  id: string;
  to: string;
  subject: string;
  text: string;
  createdAt: number;
}

interface ListedEmail {
  id: string;
  to?: string[] | null;
  subject?: string | null;
  created_at?: string | null;
}

interface FetchLike {
  (input: string, init?: { headers?: Record<string, string> }): Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;
}

export interface ResendMailReaderOptions {
  apiKey: string;
  /** Only mails created at or after this instant (ms) are looked at; keeps the paging short. */
  since: number;
  fetch?: FetchLike;
  baseUrl?: string;
  /** Pause between two requests in ms (default 550, below Resend's 2 requests per second). */
  spacingMs?: number;
  /** Pages of 100 mails at most per read (default 5). */
  maxPages?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** `2026-04-03 22:13:42.674981+00` (Resend) or ISO 8601, as milliseconds; NaN when unreadable. */
export function parseResendTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const iso = value.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return Date.parse(iso);
}

/** Plain text of an HTML mail, with links kept as `text url`, for mails that were sent without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 $1")
    .replace(/<\/p>|<br\s*\/?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reader with a cache of mail bodies: each mail is fetched once, later reads only list. The error
 * messages never contain the key or the response body.
 */
export function createResendMailReader(options: ResendMailReaderOptions) {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const baseUrl = (options.baseUrl ?? "https://api.resend.com").replace(/\/$/, "");
  const spacingMs = options.spacingMs ?? 550;
  const maxPages = options.maxPages ?? 5;
  const sleep = options.sleep ?? defaultSleep;
  const bodies = new Map<string, string>();
  let lastRequestAt = 0;

  async function get(path: string): Promise<unknown> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const wait = lastRequestAt + spacingMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      const response = await doFetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${options.apiKey}` } });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1_000 * (attempt + 1));
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Resend API refused the key (HTTP ${response.status}). Reading sent mails needs a key with full access.`);
      }
      if (!response.ok) throw new Error(`Resend API request ${path.split("?")[0]} failed with HTTP ${response.status}.`);
      return response.json();
    }
    throw new Error("Resend API rate limit: still HTTP 429 after several retries.");
  }

  async function body(id: string): Promise<string> {
    const cached = bodies.get(id);
    if (cached !== undefined) return cached;
    const detail = (await get(`/emails/${encodeURIComponent(id)}`)) as { text?: string | null; html?: string | null };
    const text = detail.text?.trim() ? detail.text : htmlToText(detail.html ?? "");
    bodies.set(id, text);
    return text;
  }

  /** Mails to `address` created since `options.since`, oldest first. */
  async function mailsTo(address: string): Promise<ResendMail[]> {
    const wanted = address.toLowerCase();
    const found: Omit<ResendMail, "text">[] = [];
    let after: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const query = `limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
      const listed = (await get(`/emails?${query}`)) as { data?: ListedEmail[]; has_more?: boolean };
      const rows = listed.data ?? [];
      let reachedOlder = false;
      for (const row of rows) {
        const createdAt = parseResendTimestamp(row.created_at);
        if (Number.isFinite(createdAt) && createdAt < options.since) {
          reachedOlder = true;
          continue;
        }
        if ((row.to ?? []).some((recipient) => recipient.toLowerCase() === wanted)) {
          found.push({ id: row.id, to: wanted, subject: row.subject ?? "", createdAt });
        }
      }
      if (reachedOlder || !listed.has_more || rows.length === 0) break;
      after = rows[rows.length - 1]!.id;
    }
    const mails: ResendMail[] = [];
    for (const mail of found.sort((a, b) => a.createdAt - b.createdAt)) mails.push({ ...mail, text: await body(mail.id) });
    return mails;
  }

  return { mailsTo };
}
