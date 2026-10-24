import { AWARENESS_COLORS, type AwarenessIdentity } from "./types";

/**
 * Keeps the last known collaborators visible while an active provider reconnects.
 * The store clears them when the provider is explicitly destroyed or access is revoked.
 */
export function shouldShowPresence(
  hasProvider: boolean,
  remoteUserCount: number,
): boolean {
  return hasProvider && remoteUserCount > 0;
}

/** Returns a compact, stable two-letter label for a presence badge. */
export function getPresenceInitials(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = "?",
): string {
  const source = (name?.trim() || email?.split("@", 1)[0]?.trim() || fallback).trim();
  if (!source) return fallback.slice(0, 2).toUpperCase();

  const words = source.split(/\s+/u).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toLocaleUpperCase();
  }

  return Array.from(source).slice(0, 2).join("").toLocaleUpperCase();
}

/** Human-readable hover/accessibility text; e-mail is never rendered as badge text. */
export function getPresenceLabel(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = "Unbekannter Benutzer",
): string {
  const displayName = name?.trim() || fallback;
  return email?.trim() ? `${displayName} · ${email.trim()}` : displayName;
}

/** Stable palette choice used before a room has enough awareness state to resolve collisions. */
export function getAwarenessColor(identity: AwarenessIdentity | undefined, clientID: number): string {
  const normalizedIdentity = `${identity?.email?.trim().toLocaleLowerCase() ?? ""}\u0000${identity?.name?.trim() ?? ""}`;
  // Authenticated users keep the same initial colour across reconnects. Anonymous clients
  // fall back to their Yjs client ID because no stable account identity is available.
  const seed = normalizedIdentity !== "\u0000" ? normalizedIdentity : `anonymous\u0000${clientID}`;
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return AWARENESS_COLORS[(hash >>> 0) % AWARENESS_COLORS.length] ?? AWARENESS_COLORS[0];
}
