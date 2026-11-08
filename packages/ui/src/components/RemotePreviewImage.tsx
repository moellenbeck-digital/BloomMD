import { useState } from "react";
import { useLocale } from "../i18n/LocaleContext";

/** Host of an http(s) URL without a leading `www.`, or null for anything else. */
export function remoteHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * A stored preview image from a third-party server, loaded only when asked.
 *
 * Rendering `<img src={remoteUrl}>` on open would tell that server who reads the map, including
 * readers who never asked for a preview. The image therefore needs a click, except directly after
 * the user's own fetch (`autoLoad`), which the disclosure above the button already covers.
 */
export function RemotePreviewImage({ src, alt, className, autoLoad = false }: { src: string; alt: string; className?: string; autoLoad?: boolean }) {
  const { t } = useLocale();
  const [requested, setRequested] = useState(false);
  const host = remoteHost(src);
  if (!host) return null;

  if (!requested && !autoLoad) {
    return (
      <button
        type="button"
        data-testid="node-preview-image-request"
        onClick={() => setRequested(true)}
        className="inline-flex min-h-9 pointer-coarse:min-h-11 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
      >
        {t.previewImageRequest.replace("{host}", host)}
      </button>
    );
  }

  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={className} data-testid="node-preview-image" />;
}
