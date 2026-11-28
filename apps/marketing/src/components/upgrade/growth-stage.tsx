"use client";

import { useState, type CSSProperties } from "react";
import styles from "./growth-stage.module.css";
import { branchOf, headingTree, type GrowthNode } from "./markdown-tree";
import { useGrowOnView } from "./use-grow-on-view";

type Placed = GrowthNode & { x: number; y: number; w: number; h: number };

const STEP_MS = 190;
const widthOf = (node: GrowthNode) => Math.round(node.title.length * (node.depth === 1 ? 8.6 : 7.7) + 30);
const heightOf = (node: GrowthNode) => (node.depth === 1 ? 44 : node.depth === 2 ? 38 : 34);
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/* Wide: classic map from left to right. Leaves take one row each, parents sit in the middle of their children. */
function layoutWide(nodes: GrowthNode[]) {
  const children = (line: number) => nodes.filter((node) => node.parent === line);
  const leaves = nodes.filter((node) => children(node.line).length === 0);
  const height = Math.max(300, leaves.length * 58 + 56);
  const gap = (height - 56) / leaves.length;
  const ys = new Map<number, number>();
  const yOf = (node: GrowthNode): number => {
    const known = ys.get(node.line);
    if (known !== undefined) return known;
    const kids = children(node.line);
    const y = kids.length ? (yOf(kids[0]!) + yOf(kids[kids.length - 1]!)) / 2 : 28 + gap * (leaves.indexOf(node) + 0.5);
    ys.set(node.line, y);
    return y;
  };
  const columns: number[] = [];
  let x = 18;
  for (const depth of [1, 2, 3]) {
    columns[depth] = x;
    x += Math.max(0, ...nodes.filter((node) => node.depth === depth).map(widthOf)) + 46;
  }
  const placed: Placed[] = nodes.map((node) => ({ ...node, x: columns[node.depth]!, y: yOf(node), w: widthOf(node), h: heightOf(node) }));
  return { width: Math.max(460, x - 46 + 26), height, placed };
}

/* Narrow (phones): the same tree as an outline growing downwards, so the labels stay readable. */
function layoutNarrow(nodes: GrowthNode[]) {
  const placed: Placed[] = nodes.map((node, index) => ({ ...node, x: 16 + (node.depth - 1) * 36, y: 34 + index * 50, w: widthOf(node), h: heightOf(node) }));
  return { width: 340, height: nodes.length * 50 + 20, placed };
}

function Blossom({ x, y, ms }: { x: number; y: number; ms: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <g className={styles.blossom} style={delay(ms)}>
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse key={angle} cx="0" cy="-4.6" rx="2.7" ry="4.4" transform={`rotate(${angle})`} />
        ))}
        <circle r="2.1" />
      </g>
    </g>
  );
}

function MapSvg({ nodes, narrow, branch, onHover, className }: { nodes: GrowthNode[]; narrow: boolean; branch: Set<number>; onHover: (line: number | null) => void; className: string }) {
  const { width, height, placed } = narrow ? layoutNarrow(nodes) : layoutWide(nodes);
  const byLine = new Map(placed.map((node) => [node.line, node]));
  const dim = (line: number) => (branch.size && !branch.has(line) ? "off" : branch.has(line) ? "on" : undefined);
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" focusable="false">
      {placed.map((node) => {
        const from = node.parent === null ? null : byLine.get(node.parent)!;
        if (!from) return null;
        let d: string;
        if (narrow) {
          const x = from.x + 16;
          const y = from.y + from.h / 2;
          d = `M ${x} ${y} C ${x} ${node.y - 8}, ${x} ${node.y}, ${node.x} ${node.y}`;
        } else {
          const x = from.x + from.w;
          const bend = (node.x - x) * 0.62;
          d = `M ${x} ${from.y} C ${x + bend} ${from.y}, ${node.x - bend} ${node.y}, ${node.x} ${node.y}`;
        }
        return <path key={node.line} d={d} pathLength={1} className={styles.branch} data-depth={node.depth} data-focus={dim(node.line)} style={delay(node.order * STEP_MS)} />;
      })}
      {placed.map((node) => (
        <g key={node.line} className={styles.node} data-depth={node.depth} data-focus={dim(node.line)} onPointerEnter={() => onHover(node.line)} onPointerLeave={() => onHover(null)}>
          <g className={styles.pop} style={delay(node.order * STEP_MS + 240)}>
            <rect x={node.x} y={node.y - node.h / 2} width={node.w} height={node.h} rx={node.h / 2} />
            <text x={node.x + node.w / 2} y={node.y} dy="0.35em" textAnchor="middle">{node.title}</text>
          </g>
          {!nodes.some((other) => other.parent === node.line) && <Blossom x={node.x + node.w - 3} y={node.y - node.h / 2 + 3} ms={node.order * STEP_MS + 600} />}
        </g>
      ))}
    </svg>
  );
}

export interface GrowthStageProps {
  markdown: string;
  file: string;
  badge?: string;
  /** Text equivalent of the picture for screen readers. */
  mapLabel: string;
  /** Accessible name of a heading line button. */
  lineLabel: (title: string) => string;
  /** load: grows with the page (above the fold, CSS only). view: grows when scrolled into view. */
  trigger: "load" | "view";
  replay?: boolean;
}

/* A Markdown file on the left, the map that grows out of it on the right. Hover or focus a heading and its
   branch lights up in both. Only transform, opacity and stroke-dashoffset move; one shot, under 3 s.
   The default styles are the final image (no JS, prefers-reduced-motion). */
export function GrowthStage({ markdown, file, badge, mapLabel, lineLabel, trigger, replay }: GrowthStageProps) {
  const nodes = headingTree(markdown);
  const [ref, state] = useGrowOnView<HTMLDivElement>(replay);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const branch = branchOf(nodes, hover ?? pinned);

  return (
    <div ref={ref} className={styles.stage} data-grow={trigger === "load" ? "play" : state} data-testid="growth-stage">
      <div className={styles.source}>
        <div className={styles.sourceHead}>
          <span>{file}</span>
          {badge && <span className={styles.badge}>{badge}</span>}
        </div>
        <ol className={styles.lines}>
          {markdown.split("\n").map((text, line) => {
            const node = nodes.find((item) => item.line === line);
            if (!node) return <li key={line} className={styles.plain}>{text || "\u00a0"}</li>;
            return (
              <li key={line}>
                <button
                  type="button"
                  className={styles.line}
                  style={delay(node.order * STEP_MS)}
                  data-focus={branch.has(line) ? "on" : undefined}
                  aria-pressed={pinned === line}
                  aria-label={lineLabel(node.title)}
                  onClick={() => setPinned((value) => (value === line ? null : line))}
                  onPointerEnter={() => setHover(line)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(line)}
                  onBlur={() => setHover(null)}
                >
                  {text}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className={styles.canvas} role="img" aria-label={mapLabel}>
        <MapSvg nodes={nodes} narrow={false} branch={branch} onHover={setHover} className={styles.wide!} />
        <MapSvg nodes={nodes} narrow branch={branch} onHover={setHover} className={styles.narrow!} />
      </div>
    </div>
  );
}
