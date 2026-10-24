"use client";

import { useEffect, useCallback } from "react";
import { useMindMapStore } from "./useMindMapStore";
import { useLocale } from "../i18n/LocaleContext";
import { requestNodeFocus } from "../utils/nodeFocus";

interface ShortcutActions {
  onNew: () => void;
  onImport: () => void;
  onExport: () => void;
  onSave: () => void;
  onReload: () => void;
  onToggleFileBrowser: () => void;
  onToggleCommandPalette: () => void;
  onToggleHelp: () => void;
  onBackToWorkspace?: () => boolean | void;
  onForwardToFile?: () => boolean | void;
}

/** Move focus back to the React Flow canvas so subsequent keyboard shortcuts work. */
function focusCanvas() {
  // Try multiple times — Electrobun webview and React re-renders may delay element availability
  const tryFocus = () => {
    const el =
      window.document.getElementById("mindmap-canvas") ??
      (window.document.querySelector(".react-flow") as HTMLElement | null);
    if (el) {
      el.focus();
      return true;
    }
    return false;
  };

  requestAnimationFrame(() => {
    if (!tryFocus()) {
      setTimeout(tryFocus, 50);
    }
  });
}

function isInteractiveControl(target: HTMLElement): boolean {
  return Boolean(target.closest("button, a, input, textarea, select, [role='button'], [role='menuitem']"));
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  const { t } = useLocale();
  const document = useMindMapStore((s) => s.document);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useMindMapStore((s) => s.setSelectedNodeId);
  const setAutoEditNodeId = useMindMapStore((s) => s.setAutoEditNodeId);
  const requestAutoEditNode = useMindMapStore((s) => s.requestAutoEditNode);
  const editorVisible = useMindMapStore((s) => s.editorVisible);
  const toggleEditor = useMindMapStore((s) => s.toggleEditor);
  const setEditorVisible = useMindMapStore((s) => s.setEditorVisible);
  const undo = useMindMapStore((s) => s.undo);
  const redo = useMindMapStore((s) => s.redo);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const addSiblingNode = useMindMapStore((s) => s.addSiblingNode);
  const deleteNodeAction = useMindMapStore((s) => s.deleteNodeAction);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.isComposing || e.defaultPrevented) return;
      // Modal surfaces own their keyboard interaction, including Escape.
      if (target.closest("[role=dialog], [role=alertdialog], dialog, [role=menu], [role=listbox]")) return;
      const key = e.key.toLowerCase();
      // isEditing: any text input (inline rename, MDXEditor, etc.)
      const isEditing =
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.closest("[contenteditable]") ||
        target.closest(".mdxeditor");

      const isInlineRename = target.matches("[data-testid='node-rename-input']");

      // isInRichEditor: only the MDXEditor (has its own undo/redo)
      const isInRichEditor =
        target.isContentEditable ||
        target.closest("[contenteditable]") ||
        target.closest(".mdxeditor");

      // ── Global shortcuts (work even when editing text) ──
      const primaryKey = e.metaKey || e.ctrlKey;

      // Inline rename owns Return/Escape and native text-field undo. The window capture listener
      // must not intercept those events before the input's own handler can process them.
      if (isInlineRename && (
        e.key === "Escape" ||
        (!primaryKey && !e.altKey && e.key === "Enter") ||
        (primaryKey && (key === "z" || key === "y"))
      )) {
        return;
      }

      // Cmd/Ctrl+ArrowLeft/ArrowRight → Navigate between the workspace overview and the
      // previously opened file. Leave the browser shortcut alone when the app has no matching
      // navigation state, and never interrupt text editing or focused controls.
      if (primaryKey && !e.altKey && !e.shiftKey && !isEditing && !isInteractiveControl(target)) {
        const navigationAction = e.key === "ArrowLeft"
          ? actions.onBackToWorkspace
          : e.key === "ArrowRight"
            ? actions.onForwardToFile
            : undefined;
        if (navigationAction) {
          const handled = navigationAction();
          if (handled !== false) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }

      // F1 → Toggle help
      if (e.key === "F1") {
        e.preventDefault();
        actions.onToggleHelp();
        return;
      }

      // ? / Cmd/Ctrl+/ → Toggle help when focus is on the canvas or app chrome.
      if (!isEditing && (e.key === "?" || (primaryKey && e.key === "/"))) {
        e.preventDefault();
        actions.onToggleHelp();
        return;
      }

      // Cmd/Ctrl+Z → Undo. Text inputs and the MDXEditor retain native/editor undo behavior.
      if (primaryKey && !e.shiftKey && key === "z" && !isEditing && !isInRichEditor) {
        e.preventDefault();
        undo();
        return;
      }

      // Cmd/Ctrl+Shift+Z → Redo. Text inputs and the MDXEditor retain native/editor redo behavior.
      if (primaryKey && e.shiftKey && key === "z" && !isEditing && !isInRichEditor) {
        e.preventDefault();
        redo();
        return;
      }

      // Cmd/Ctrl+S → Save (ALWAYS intercept, even in editor)
      if (primaryKey && key === "s") {
        e.preventDefault();
        actions.onSave();
        return;
      }

      // Cmd/Ctrl+N → New (ALWAYS intercept to prevent browser new-window)
      if (primaryKey && key === "n") {
        e.preventDefault();
        actions.onNew();
        return;
      }

      // Cmd/Ctrl+I → Import
      if (primaryKey && !isEditing && key === "i") {
        e.preventDefault();
        actions.onImport();
        return;
      }

      // Cmd/Ctrl+E → Export (ALWAYS intercept to prevent browser address-bar focus)
      if (primaryKey && key === "e") {
        e.preventDefault();
        actions.onExport();
        return;
      }

      // Cmd/Ctrl+R → Reload from disk
      if (primaryKey && key === "r") {
        e.preventDefault();
        actions.onReload();
        return;
      }

      // Cmd/Ctrl+O → Toggle file browser
      if (primaryKey && key === "o") {
        e.preventDefault();
        actions.onToggleFileBrowser();
        return;
      }

      // Cmd/Ctrl+K → Toggle command palette
      if (primaryKey && !isEditing && key === "k") {
        e.preventDefault();
        actions.onToggleCommandPalette();
        return;
      }

      // Cmd/Ctrl+Enter or Alt+Enter -> Toggle editor/panel everywhere, including inside MDXEditor.
      if ((primaryKey || e.altKey) && e.key === "Enter") {
        e.preventDefault();
        if (editorVisible) {
          setEditorVisible(false);
          if (selectedNodeId) requestNodeFocus(selectedNodeId);
        } else if (selectedNodeId) {
          toggleEditor();
          setTimeout(() => {
            const editor = window.document.querySelector(
              ".mdxeditor [contenteditable]",
            ) as HTMLElement | null;
            editor?.focus();
          }, 100);
        }
        return;
      }

      // Escape → If editor open: close editor, keep node selected.
      //          If on canvas with selection: deselect node.
      if (e.key === "Escape" && !isEditing && !isInteractiveControl(target)) {
        e.preventDefault();
        if (editorVisible) {
          setEditorVisible(false);
          if (selectedNodeId) requestNodeFocus(selectedNodeId);
        } else {
          setSelectedNodeId(null);
          focusCanvas();
        }
        return;
      }

      // ── Canvas-only shortcuts (only when NOT editing text) ──
      if (isEditing || isInteractiveControl(target)) return;
      const currentState = useMindMapStore.getState();
      const activeDocument = currentState.document;
      const activeSelectedNodeId = currentState.selectedNodeId;
      if (!activeDocument || !activeSelectedNodeId) return;

      if (primaryKey && key === "c") {
        e.preventDefault();
        currentState.copyBranches();
        return;
      }

      if (primaryKey && key === "v") {
        e.preventDefault();
        currentState.pasteBranches(activeSelectedNodeId);
        focusCanvas();
        return;
      }

      const selectedNode = activeDocument.nodes.get(activeSelectedNodeId);
      if (!selectedNode) return;

      // Unmodified canvas keys must not swallow OS navigation or Shift+Tab.
      if (primaryKey || e.altKey || e.shiftKey) return;

      // R -> Rename selected node.
      if (key === "r" && !currentState.readOnly) {
        e.preventDefault();
        setAutoEditNodeId(activeSelectedNodeId);
        return;
      }

      // ── Arrow key navigation between nodes ──
      // stopPropagation prevents React Flow from using arrows for panning

      // ArrowRight → Select first child
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (selectedNode.children.length > 0) {
          // Compact workspaces hide children until their parent is expanded.
          // The canvas retains the focus request until the worker layout arrives.
          if (currentState.collapsedIds.has(activeSelectedNodeId)) {
            currentState.toggleCollapse(activeSelectedNodeId);
          }
          const targetId = selectedNode.children[0]!;
          setSelectedNodeId(targetId);
          requestNodeFocus(targetId);
        }
        return;
      }

      // ArrowLeft → Select parent
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (selectedNode.parentId) {
          setSelectedNodeId(selectedNode.parentId);
          requestNodeFocus(selectedNode.parentId);
        }
        return;
      }

      // ArrowDown → Select next sibling
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        if (selectedNode.parentId) {
          const parent = activeDocument.nodes.get(selectedNode.parentId);
          if (parent) {
            const idx = parent.children.indexOf(activeSelectedNodeId);
            if (idx >= 0 && idx < parent.children.length - 1) {
              const targetId = parent.children[idx + 1]!;
              setSelectedNodeId(targetId);
              requestNodeFocus(targetId);
            }
          }
        }
        return;
      }

      // ArrowUp → Select previous sibling
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (selectedNode.parentId) {
          const parent = activeDocument.nodes.get(selectedNode.parentId);
          if (parent) {
            const idx = parent.children.indexOf(activeSelectedNodeId);
            if (idx > 0) {
              const targetId = parent.children[idx - 1]!;
              setSelectedNodeId(targetId);
              requestNodeFocus(targetId);
            }
          }
        }
        return;
      }

      // Tab → Add child node
      if (e.key === "Tab" && !currentState.readOnly) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        const newId = addChildNode(activeSelectedNodeId, t.newNodeTitle);
        if (newId) {
          setSelectedNodeId(newId);
          requestAutoEditNode(newId);
        }
        return;
      }

      // Enter → Add sibling node
      if (e.key === "Enter" && !currentState.readOnly) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        const newId = addSiblingNode(activeSelectedNodeId, t.newNodeTitle);
        if (newId) {
          setSelectedNodeId(newId);
          requestAutoEditNode(newId);
        }
        return;
      }

      // Delete/Backspace → Delete selected node
      if (!currentState.readOnly && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        if (activeSelectedNodeId === activeDocument.rootId) return;
        if (!selectedNode.parentId) return;
        deleteNodeAction(activeSelectedNodeId);
        return;
      }
    },
    [document, selectedNodeId, setSelectedNodeId, setAutoEditNodeId, requestAutoEditNode, editorVisible, toggleEditor, setEditorVisible, actions, undo, redo, addChildNode, addSiblingNode, deleteNodeAction, t.newNodeTitle],
  );

  useEffect(() => {
    // Use capture phase so we fire BEFORE CodeMirror/MDXEditor can stopPropagation
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);
}
