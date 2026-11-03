"use client";

import { useCodeBlockEditorContext, type CodeBlockEditorDescriptor, type CodeBlockEditorProps } from "@mdxeditor/editor";
import { MermaidBlockView } from "./MermaidBlockView";

/** Connects the rich-text editor's code block to the Mermaid view; the editor stores the source. */
export function MermaidCodeBlock({ code }: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  return <MermaidBlockView code={code} onCodeChange={setCode} />;
}

export const mermaidCodeBlockDescriptor: CodeBlockEditorDescriptor = {
  // Higher than the generic code editor, so a mermaid block gets the diagram instead.
  priority: 100,
  match: (language) => language?.trim().toLowerCase() === "mermaid",
  Editor: MermaidCodeBlock,
};
