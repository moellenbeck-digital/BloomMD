import { computeVisibleLayout } from "@bloommd/ui/visible-layout";

type LayoutArguments = Parameters<typeof computeVisibleLayout>;
self.onmessage = (event: MessageEvent<{
  doc: LayoutArguments[0];
  collapsedIds: LayoutArguments[1];
  focusNodeId: LayoutArguments[2];
  edgeMode: LayoutArguments[3];
}>) => {
  const { doc, collapsedIds, focusNodeId, edgeMode } = event.data;
  self.postMessage(computeVisibleLayout(doc, collapsedIds, focusNodeId, edgeMode));
};
