"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { imageProblemText, loadImagePreview, problemImageUrl } from "./image-preview";

interface Loaded {
  path: string;
  blob?: Blob;
  release: () => void;
}

/**
 * Preview handler for the images the rich-text editor shows (`![](path)`).
 *
 * The editor hands over the path as written; the handler resolves it against the note and returns a
 * URL the `<img>` can load, or an image-shaped hint with the path when it cannot be shown. Results
 * are cached per path while the note is open, so editing text next to an image does not reload it.
 */
export function useInlineImagePreview(notePath: string, copy: { notFound: string; rejected: string }) {
  const urls = useRef(new Map<string, Promise<string>>());
  const loaded = useRef(new Map<string, Loaded>());

  useEffect(() => {
    const cachedLoads = loaded.current;
    const cachedUrls = urls.current;
    return () => {
      for (const entry of cachedLoads.values()) entry.release();
      cachedLoads.clear();
      cachedUrls.clear();
    };
  }, [notePath]);

  const handler = useCallback(
    (src: string): Promise<string> => {
      const cached = urls.current.get(src);
      if (cached) return cached;
      const pending = loadImagePreview(notePath, { syntax: "markdown", target: src }).then((result) => {
        if (result.status === "ready") {
          loaded.current.set(result.url, { path: result.path, blob: result.blob, release: result.release });
          return result.url;
        }
        // A hint is not cached: the next render looks again, in case the file has appeared meanwhile.
        urls.current.delete(src);
        return problemImageUrl(imageProblemText(result, copy));
      });
      urls.current.set(src, pending);
      return pending;
    },
    [notePath, copy.notFound, copy.rejected], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Path and file behind a URL this hook returned, to name and save the original image. */
  const sourceFor = useCallback((url: string) => {
    const entry = loaded.current.get(url);
    return entry ? { path: entry.path, source: { url, blob: entry.blob } } : null;
  }, []);

  return { handler, sourceFor };
}

const IMAGE_SELECTOR = "[data-editor-block-type='image'] img";

/**
 * Lets the images in the editor be enlarged: double-click, or Enter/Space on a focused image. The
 * rich-text editor does not make its images focusable, so they are marked up here (role, label,
 * tab stop); the single click stays with the editor, where it selects the image.
 */
export function useEditorImageZoom(
  container: RefObject<HTMLElement | null>,
  onOpen: (image: { src: string; alt: string }) => void,
  label: string,
) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const root = container.current;
    if (!root) return;

    const mark = () => {
      for (const image of root.querySelectorAll<HTMLImageElement>(IMAGE_SELECTOR)) {
        // Only child-list changes are observed, so setting attributes here cannot retrigger this.
        image.tabIndex = 0;
        image.setAttribute("role", "button");
        image.setAttribute("aria-label", image.alt ? `${label}: ${image.alt}` : label);
      }
    };
    mark();
    const observer = typeof window.MutationObserver === "function" ? new window.MutationObserver(mark) : null;
    observer?.observe(root, { childList: true, subtree: true });

    const open = (target: EventTarget | null) => {
      const image = (target as HTMLElement | null)?.closest?.(IMAGE_SELECTOR) as HTMLImageElement | null;
      if (!image?.src) return false;
      onOpenRef.current({ src: image.src, alt: image.alt });
      return true;
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (open(event.target)) event.preventDefault();
    };
    // Capture phase: the editor must not also act on the same Enter or Space.
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== "Enter" && event.key !== " ") || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.matches?.(IMAGE_SELECTOR) && open(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    root.addEventListener("dblclick", onDoubleClick);
    root.addEventListener("keydown", onKeyDown, true);
    return () => {
      observer?.disconnect();
      root.removeEventListener("dblclick", onDoubleClick);
      root.removeEventListener("keydown", onKeyDown, true);
    };
  }, [container, label]);
}
