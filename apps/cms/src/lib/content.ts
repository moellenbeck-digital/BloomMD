import type { Payload, Where } from "payload";
import { RATE_LIMITS } from "./env";
import { hitRateLimit, poolOf } from "./shared-store";
import { SvcError } from "./svc-error";
import { MIN_READ_TOKEN_LENGTH, hashToken } from "./token";

/**
 * Read access for marketing (option T, ADR 3 and 4): `GET /svc/v1/content/{blog|news}`. The bearer token is
 * checked here in the handler, never as a Payload authentication, so it does nothing on `/api` and
 * `/admin`. Only published entries are returned, never drafts, users or media write access. Misses count in
 * one shared window (so guessing is throttled without a counter per guess), a known token in its own
 * window. Audit is a counter and the time of the last use, no content.
 */
export type ContentKind = "blog" | "news";
export const isContentKind = (value: string): value is ContentKind => value === "blog" || value === "news";

const INVALID_BUCKET = "content-invalid";
const INVALID_LIMIT = { limit: 120, windowSeconds: 60 } as const;

export async function authenticateReadToken(payload: Payload, authorization: string | null): Promise<string> {
  const pool = poolOf(payload);
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (bearer.length < MIN_READ_TOKEN_LENGTH || bearer.length > 256) {
    await missed(pool);
    throw new SvcError(401, "unauthorized");
  }
  const found = await payload.find({ collection: "read-tokens", where: { tokenHash: { equals: hashToken(bearer) } }, limit: 1, depth: 0, overrideAccess: true });
  const token = found.docs[0];
  if (!token || (token.expiresAt && new Date(token.expiresAt) <= new Date())) {
    await missed(pool);
    throw new SvcError(401, "unauthorized");
  }
  const window = RATE_LIMITS.contentPerToken;
  const result = await hitRateLimit(pool, `content:${token.id}`, window.limit, window.windowSeconds);
  if (!result.allowed) throw new SvcError(429, "rate_limited", {}, { "retry-after": String(result.retryAfterSeconds) });
  await pool.query("update read_tokens set uses = coalesce(uses, 0) + 1, last_used_at = now() where id = $1", [token.id]);
  return String(token.id);
}

async function missed(pool: ReturnType<typeof poolOf>): Promise<void> {
  const result = await hitRateLimit(pool, INVALID_BUCKET, INVALID_LIMIT.limit, INVALID_LIMIT.windowSeconds);
  if (!result.allowed) throw new SvcError(429, "rate_limited", {}, { "retry-after": String(result.retryAfterSeconds) });
}

function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new SvcError(400, "invalid_request", { fields: { [name]: `integer ${min} to ${max}` } });
  return value;
}

export async function publishedContent(payload: Payload, kind: ContentKind, url: URL) {
  const locale = url.searchParams.get("locale");
  if (locale !== null && locale !== "de" && locale !== "en") throw new SvcError(400, "invalid_request", { fields: { locale: "de | en" } });
  const limit = intParam(url, "limit", 50, 1, 100);
  const page = intParam(url, "page", 1, 1, 10_000);
  const conditions: Where[] = [{ _status: { equals: "published" } }];
  if (locale) conditions.push({ locale: { equals: locale } });
  const result = await payload.find({
    collection: kind,
    where: { and: conditions },
    draft: false,
    sort: "-date",
    limit,
    page,
    depth: 1,
    overrideAccess: true,
  });
  return {
    kind,
    page: result.page ?? page,
    totalPages: result.totalPages,
    totalDocs: result.totalDocs,
    items: result.docs.map((entry) => {
      const image = entry.image && typeof entry.image === "object" ? entry.image : null;
      return {
        id: String(entry.id),
        slug: entry.slug,
        locale: entry.locale,
        title: entry.title,
        summary: entry.summary ?? null,
        body: entry.body ?? "",
        tags: entry.tags ?? [],
        version: entry.version ?? null,
        date: entry.date,
        updatedAt: entry.updatedAt,
        // No media URL yet: the delivery path of published media is open (O11).
        image: image ? { alt: image.alt, filename: image.filename ?? null, mimeType: image.mimeType ?? null, width: image.width ?? null, height: image.height ?? null } : null,
      };
    }),
  };
}
