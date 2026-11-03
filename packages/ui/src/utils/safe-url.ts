/**
 * URL checks for the read-only reading mode. Markdown comes from files and shared documents, so a
 * link or image URL is never trusted: only an explicit allow-list of schemes becomes a link or image.
 */

// Browsers ignore control characters, whitespace and zero-width characters inside a scheme
// ("java\tscript:"), so they are removed before the scheme is looked at.
const IGNORED_IN_SCHEME = /[\u0000- \u007f-\u009f​-‍⁠﻿]/g;
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i;

export interface SafeLink {
  href: string;
  /** http(s) links leave the app: they open in a new tab with `rel="noreferrer noopener"`. */
  external: boolean;
}

function schemeOf(url: string): string | null {
  const match = SCHEME_RE.exec(url.replace(IGNORED_IN_SCHEME, ""));
  return match ? match[1]!.toLowerCase() : null;
}

function isProtocolRelative(url: string): boolean {
  return /^[/\\]{2}/.test(url.replace(IGNORED_IN_SCHEME, ""));
}

/** Returns the link target when the URL may become a link (http, https, mailto); otherwise null (render as text). */
export function toSafeLink(rawUrl: string): SafeLink | null {
  const url = rawUrl.trim();
  if (!url || isProtocolRelative(url)) return null;
  const scheme = schemeOf(url);
  if (scheme === "http" || scheme === "https") {
    try {
      return { href: new URL(url).toString(), external: true };
    } catch {
      return null;
    }
  }
  if (scheme === "mailto") {
    const clean = url.replace(IGNORED_IN_SCHEME, "");
    return clean.length > "mailto:".length ? { href: clean, external: false } : null;
  }
  return null;
}

/** Returns the image source when it is http(s), an embedded raster image or a relative path; otherwise null. */
export function toSafeImageSrc(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (!url || isProtocolRelative(url)) return null;
  const scheme = schemeOf(url);
  if (scheme === null) return url;
  if (scheme === "http" || scheme === "https") {
    try {
      return new URL(url).toString();
    } catch {
      return null;
    }
  }
  if (scheme === "data" && SAFE_DATA_IMAGE_RE.test(url)) return url;
  return null;
}
