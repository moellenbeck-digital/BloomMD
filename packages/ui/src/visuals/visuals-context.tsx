"use client";

import { createContext, useContext } from "react";
import type { VisualViewerAction } from "./VisualViewer";

export interface ViewerRequest {
  kind: "image" | "diagram";
  src: string;
  alt: string;
  actions: VisualViewerAction[];
}

export interface VisualsContextValue {
  /** Workspace path of the open note; relative image paths resolve against it. */
  notePath: string;
  /** Title of the node, used to name saved diagrams. */
  title: string;
  readOnly: boolean;
  openViewer: (request: ViewerRequest) => void;
}

const fallback: VisualsContextValue = { notePath: "", title: "", readOnly: false, openViewer: () => undefined };

export const VisualsContext = createContext<VisualsContextValue>(fallback);

/** What the node editor offers to the diagrams and images inside it; harmless defaults outside it. */
export function useVisuals(): VisualsContextValue {
  return useContext(VisualsContext);
}
