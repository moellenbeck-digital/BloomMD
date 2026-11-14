"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { isUnintendedClear, pendingEditorContent } from "../utils/node-content-guard";
import { restoreWikiLinks } from "../utils/wiki-links-escape";
import { useMindMapStore } from "./useMindMapStore";

/** The part of the rich-text editor's imperative handle this hook needs. */
export interface EditorMarkdownSource {
  getMarkdown: () => string;
}

/**
 * Keeps the node content safe between the rich-text editor and the store (#394).
 *
 * - `handleEditorChange` writes the editor's markdown to the node, but never lets an empty report that
 *   did not come from the user (mount, `setMarkdown`, hiding) replace stored content.
 * - When the editor component goes away (Cmd/Ctrl/Alt+Enter, Escape), text the user typed that was not
 *   reported yet is written to the node first.
 * - `attachEditorRegion` is the ref callback for the element that wraps the editor; it notes user input.
 */
export function useEditorContentGuard(editorRef: RefObject<EditorMarkdownSource | null>, nodeId: string | null) {
  const updateNodeContent = useMindMapStore((s) => s.updateNodeContent);
  // The user typed, pasted, cut or dropped in the editor since it was shown for this node.
  const userEditedRef = useRef(false);
  const regionCleanupRef = useRef<(() => void) | null>(null);
  const renderedNodeIdRef = useRef<string | null>(null);
  renderedNodeIdRef.current = nodeId;

  useEffect(() => {
    userEditedRef.current = false;
  }, [nodeId]);

  // Lexical handles most input itself and prevents the browser's `input` event, so `beforeinput` counts too.
  // A ref callback without a returned cleanup keeps this working in the Preact build of the plugin.
  const attachEditorRegion = useCallback((region: HTMLElement | null) => {
    regionCleanupRef.current?.();
    regionCleanupRef.current = null;
    if (!region) return;
    const markEdited = () => {
      userEditedRef.current = true;
    };
    const events = ["beforeinput", "input", "paste", "cut", "drop"] as const;
    for (const name of events) region.addEventListener(name, markEdited, true);
    regionCleanupRef.current = () => {
      for (const name of events) region.removeEventListener(name, markEdited, true);
    };
  }, []);

  // Layout cleanups of a parent run before the child's ref is detached, so the editor can still be read.
  useLayoutEffect(() => {
    return () => {
      const renderedNodeId = renderedNodeIdRef.current;
      const editor = editorRef.current;
      if (!renderedNodeId || !editor) return;
      const stored = useMindMapStore.getState().document?.nodes.get(renderedNodeId)?.content ?? "";
      const pending = pendingEditorContent({ editorMarkdown: editor.getMarkdown(), stored, userEdited: userEditedRef.current });
      userEditedRef.current = false;
      if (pending !== null) useMindMapStore.getState().updateNodeContent(renderedNodeId, pending);
    };
  }, [editorRef]);

  const handleEditorChange = useCallback(
    (markdown: string, initialMarkdownNormalize?: boolean) => {
      if (!nodeId) return;
      // Keep Obsidian links and handwriting embeds intact; the editor escapes `[[`.
      const next = restoreWikiLinks(markdown);
      const stored = useMindMapStore.getState().document?.nodes.get(nodeId)?.content ?? "";
      if (isUnintendedClear({ next, stored, fromInitialImport: initialMarkdownNormalize === true, userEdited: userEditedRef.current })) return;
      updateNodeContent(nodeId, next);
    },
    [nodeId, updateNodeContent],
  );

  return { handleEditorChange, attachEditorRegion };
}
