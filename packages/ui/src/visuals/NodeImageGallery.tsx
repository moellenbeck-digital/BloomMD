"use client";

import { useEffect, useMemo, useState } from "react";
import { extractImageRefs, type ImageRef } from "@bloommd/core/browser";
import { ImageOff, Maximize2 } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";
import { canSaveOriginal, deliverExportFile, imageExportFile } from "./visual-export";
import { imageProblemText, loadImagePreview, type ImagePreviewResult } from "./image-preview";
import { useVisuals } from "./visuals-context";

type ThumbState = { status: "loading" } | ImagePreviewResult;

function ImageThumb({ imageRef, notePath }: { imageRef: ImageRef; notePath: string }) {
  const { t } = useLocale();
  const visuals = useVisuals();
  const [state, setState] = useState<ThumbState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | null = null;
    setState({ status: "loading" });
    void loadImagePreview(notePath, { syntax: imageRef.syntax, target: imageRef.target }).then((result) => {
      if (cancelled) {
        if (result.status === "ready") result.release();
        return;
      }
      if (result.status === "ready") release = result.release;
      setState(result);
    });
    return () => {
      cancelled = true;
      release?.();
    };
  }, [notePath, imageRef.syntax, imageRef.target]);

  const label = imageRef.alt || imageRef.target;

  if (state.status === "loading") {
    return <li className="flex h-24 w-32 items-center justify-center rounded-md border border-[var(--color-border)] text-[11px] text-[var(--color-ink-faint)]" aria-busy="true" data-testid="node-image-loading">{t.visualImageLoading}</li>;
  }
  if (state.status === "unavailable") {
    return (
      <li className="flex max-w-full items-start gap-2 rounded-md border border-dashed border-[#FF6B35] bg-[#FFF4EE] px-3 py-2 text-xs text-[#1A1A1A]" data-testid="node-image-problem" role="status">
        <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B35]" aria-hidden="true" />
        <span className="min-w-0 break-words">{imageProblemText(state, { notFound: t.visualImageNotFound, rejected: t.visualImagePathRejected })}</span>
      </li>
    );
  }

  const { url, path, blob } = state;
  return (
    <li>
      <button
        type="button"
        data-testid="node-image-thumb"
        data-image-path={path}
        aria-label={`${t.visualEnlarge}: ${label}`}
        title={t.visualEnlarge}
        className="group relative block overflow-hidden rounded-md border border-[var(--color-border)] bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B35]"
        onClick={() =>
          visuals.openViewer({
            kind: "image",
            src: url,
            alt: imageRef.alt || label,
            actions: canSaveOriginal(path) ? [{ id: "image-original", label: t.visualSaveImage, run: async () => deliverExportFile(await imageExportFile({ url, blob }, path)) }] : [],
          })
        }
      >
        <img src={url} alt={imageRef.alt} draggable={false} className="block max-h-24 max-w-[10rem] object-contain" />
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

/**
 * Every image the node's Markdown refers to — `![](path)` and Obsidian `![[image.png]]` — as
 * thumbnails that open in the enlarged view. The rich-text editor cannot draw Obsidian embeds, and
 * this is the preview for them; for Markdown images it is the keyboard- and click-friendly way to zoom.
 * It reads the content and never writes it.
 */
export function NodeImageGallery({ content }: { content: string }) {
  const { t } = useLocale();
  const { notePath } = useVisuals();
  const refs = useMemo(() => {
    const seen = new Set<string>();
    return extractImageRefs(content).filter((ref) => {
      const key = `${ref.syntax}:${ref.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [content]);

  if (refs.length === 0) return null;
  return (
    <section className="border-t border-[var(--color-border)] px-5 py-3" data-testid="node-image-gallery" aria-label={t.visualEmbeddedImages}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{t.visualEmbeddedImages}</h3>
      <ul className="flex flex-wrap gap-2">
        {refs.map((ref) => (
          <ImageThumb key={`${ref.syntax}:${ref.target}`} imageRef={ref} notePath={notePath} />
        ))}
      </ul>
    </section>
  );
}
