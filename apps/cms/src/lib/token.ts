import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** SHA-256 hex of a token. 256 bits of randomness make a plain hash sufficient (ADR 3, option T). */
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A random opaque token of 256 bits, URL-safe. Only its hash is ever stored. */
export function generateToken(prefix = ""): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function safeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Minimum length of a bearer token we accept to look up at all: 256 bits = 43 base64url characters. */
export const MIN_READ_TOKEN_LENGTH = 43;
