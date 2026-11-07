import { Globe2, Link2 } from "lucide-react";
import type { MindMapNode } from "@bloommd/core/browser";
import { useLocale } from "../i18n/LocaleContext";
import { RemotePreviewImage, remoteHost } from "./RemotePreviewImage";

/** The website card of the presentation view: stored text is shown at once, the image only on a click. */
export function WebsitePreviewCard({ node }: { node: MindMapNode }) {
  const { t } = useLocale();
  const metadata = node.metadata;
  if ((metadata?.kind !== "web" && metadata?.kind !== "source") || !metadata.url) return null;
  const host = remoteHost(metadata.url) ?? "";
  return (
    <article className="mt-7 max-w-2xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-sm" data-testid="presentation-website-preview">
      {metadata.previewImage && <RemotePreviewImage key={`${node.id}:${metadata.previewImage}`} src={metadata.previewImage} alt={metadata.previewTitle || node.title} className="max-h-64 w-full object-cover" />}
      <div className="grid gap-2 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#C94D20]"><Globe2 size={14} /> {host || t.website}</div>
        <h2 className="text-xl font-semibold text-[var(--color-ink)]">{metadata.previewTitle || node.title}</h2>
        {(metadata.previewDescription || node.content) && <p className="text-sm leading-6 text-[var(--color-ink-muted)]">{metadata.previewDescription || node.content.slice(0, 280)}</p>}
        <a href={metadata.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#C94D20] hover:underline">{t.openWebsite} <Link2 size={14} /></a>
      </div>
    </article>
  );
}
