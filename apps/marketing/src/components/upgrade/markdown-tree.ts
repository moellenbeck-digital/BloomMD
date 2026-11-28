/* Heading tree of a short example file. Only headings become nodes, as in the map preview. */
export interface GrowthNode {
  line: number;
  title: string;
  depth: number;
  parent: number | null;
  order: number;
}

export function headingTree(markdown: string): GrowthNode[] {
  const stack: GrowthNode[] = [];
  const nodes: GrowthNode[] = [];
  markdown.split("\n").forEach((text, line) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(text);
    if (!match) return;
    const depth = match[1]!.length;
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const node = { line, title: match[2]!, depth, parent: stack[stack.length - 1]?.line ?? null, order: nodes.length };
    nodes.push(node);
    stack.push(node);
  });
  return nodes;
}

/* The node and all its ancestors: the branch that lights up on hover and focus. */
export function branchOf(nodes: GrowthNode[], line: number | null): Set<number> {
  const branch = new Set<number>();
  let current = nodes.find((node) => node.line === line);
  while (current) {
    branch.add(current.line);
    const parent = current.parent;
    current = nodes.find((node) => node.line === parent);
  }
  return branch;
}
