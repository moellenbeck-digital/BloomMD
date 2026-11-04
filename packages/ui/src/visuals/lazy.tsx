"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import type { CodeBlockEditorDescriptor, CodeBlockEditorProps } from "@mdxeditor/editor";

/**
 * The visuals of the node editor load when a node needs them. The node editor itself is a lazy chunk
 * with a size budget, and a note without a diagram or image should not pay for the viewer, the Mermaid
 * view or the image code. Mermaid itself is imported on top of that, on the first diagram.
 */

const MermaidCodeBlock = lazy(() => import("./MermaidCodeBlock").then((module) => ({ default: module.MermaidCodeBlock })));
const NodeImageGallery = lazy(() => import("./NodeImageGallery").then((module) => ({ default: module.NodeImageGallery })));
const VisualViewer = lazy(() => import("./VisualViewer").then((module) => ({ default: module.VisualViewer })));

function LazyMermaidCodeBlock(props: CodeBlockEditorProps) {
  return (
    <Suspense fallback={null}>
      <MermaidCodeBlock {...props} />
    </Suspense>
  );
}

export const mermaidCodeBlockDescriptor: CodeBlockEditorDescriptor = {
  // Higher than the generic code editor, so a mermaid block gets the diagram instead.
  priority: 100,
  match: (language) => language?.trim().toLowerCase() === "mermaid",
  Editor: LazyMermaidCodeBlock,
};

export function LazyNodeImageGallery(props: ComponentProps<typeof NodeImageGallery>) {
  return (
    <Suspense fallback={null}>
      <NodeImageGallery {...props} />
    </Suspense>
  );
}

export function LazyVisualViewer(props: ComponentProps<typeof VisualViewer>) {
  return (
    <Suspense fallback={null}>
      <VisualViewer {...props} />
    </Suspense>
  );
}
