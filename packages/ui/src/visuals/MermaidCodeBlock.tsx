"use client";

import { useCodeBlockEditorContext, type CodeBlockEditorProps } from "@mdxeditor/editor";
import { MermaidBlockView } from "./MermaidBlockView";

/** Connects the rich-text editor's code block to the Mermaid view; the editor stores the source. */
export function MermaidCodeBlock({ code }: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  return <MermaidBlockView code={code} onCodeChange={setCode} />;
}
