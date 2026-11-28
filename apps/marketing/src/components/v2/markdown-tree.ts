/* Heading tree of a short example file. Only headings become nodes, as in the map preview. */
export interface TreeNode {
  line: number;
  title: string;
  depth: number;
  parent: number | null;
  /* Bullet lines directly under the heading: node content, not nodes. */
  notes: string[];
}

export function headingTree(markdown: string): TreeNode[] {
  const stack: TreeNode[] = [];
  const nodes: TreeNode[] = [];
  markdown.split("\n").forEach((text, line) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(text);
    if (!match) {
      const note = /^-\s+(.+)$/.exec(text);
      if (note) nodes[nodes.length - 1]?.notes.push(note[1]!);
      return;
    }
    const depth = match[1]!.length;
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const node: TreeNode = { line, title: match[2]!, depth, parent: stack[stack.length - 1]?.line ?? null, notes: [] };
    nodes.push(node);
    stack.push(node);
  });
  return nodes;
}

/* The node and all its ancestors: the branch that lights up on hover, focus and selection. */
export function branchOf(nodes: TreeNode[], line: number | null): Set<number> {
  const branch = new Set<number>();
  let current = nodes.find((node) => node.line === line);
  while (current) {
    branch.add(current.line);
    const parent = current.parent;
    current = nodes.find((node) => node.line === parent);
  }
  return branch;
}
