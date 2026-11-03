"use client";

import { useCallback, useEffect, useRef } from "react";

interface Loaded {
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
      // The preview code is loaded with the first image, not with the node editor.
      const pending = import("./image-preview").then(async ({ imageProblemText, loadImagePreview, problemImageUrl }) => {
        const result = await loadImagePreview(notePath, { syntax: "markdown", target: src });
        if (result.status === "ready") {
          loaded.current.set(result.url, { release: result.release });
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

  return { handler };
}
