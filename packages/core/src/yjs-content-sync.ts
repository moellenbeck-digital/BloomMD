import * as Y from "yjs";
import diff from "fast-diff";

/**
 * Apply character-level diff to Y.Text instead of replacing the entire content.
 * This enables proper CRDT merging when multiple users edit the same node.
 *
 * If oldContent === newContent, no Y.Text operations are performed (no broadcast).
 */
export function yUpdateContentDiff(
  yDoc: Y.Doc,
  nodeId: string,
  oldContent: string,
  newContent: string,
): void {
  if (oldContent === newContent) return;

  yDoc.transact(() => {
    const yNodeContents = yDoc.getMap<Y.Text>("nodeContents");
    let yContent = yNodeContents.get(nodeId);
    if (!yContent) {
      yContent = new Y.Text();
      yNodeContents.set(nodeId, yContent);
    }

    const changes = diff(oldContent, newContent);
    let index = 0;

    for (const [type, text] of changes) {
      if (type === diff.DELETE) {
        yContent.delete(index, text.length);
      } else if (type === diff.INSERT) {
        yContent.insert(index, text);
        index += text.length;
      } else {
        // EQUAL — advance index
        index += text.length;
      }
    }
  });
}
