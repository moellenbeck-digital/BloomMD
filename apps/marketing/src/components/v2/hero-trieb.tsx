"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Bloom, Branch, type Timing } from "./branch";
import { bmdFonts } from "./fonts";
import { branchOf, headingTree, type TreeNode } from "./markdown-tree";
import t from "./tokens.module.css";
import type { TriebShape } from "./trieb";
import styles from "./hero-trieb.module.css";

interface Layout {
  w: number;
  h: number;
  /* One shape per heading, in file order: root, Leitbild, Initiativen, its three children. */
  shapes: TriebShape[];
}

const wide: Layout = {
  w: 968,
  h: 466,
  shapes: [
    { from: [-114, 96], at: [22, 250], length: 256, w: [15, 9, 6] },
    { from: [278, 250], at: [346, 112], length: 214, w: [8, 5, 3] },
    { from: [278, 250], at: [346, 372], length: 188, w: [8, 5, 3] },
    { from: [534, 372], at: [624, 302], length: 214, w: [4.5, 2.6, 1] },
    { from: [534, 372], at: [624, 377], length: 226, w: [4.5, 2.6, 1] },
    { from: [534, 372], at: [624, 452], length: 238, w: [4.5, 2.6, 1] },
  ],
};

const narrow: Layout = {
  w: 350,
  h: 482,
  shapes: [
    { from: [8, -4], at: [18, 52], length: 262, w: [10, 7, 4], bend: "v" },
    { from: [26, 52], at: [58, 120], length: 206, w: [7, 4, 2], bend: "v" },
    { from: [26, 52], at: [58, 264], length: 172, w: [7, 4, 2], bend: "v" },
    { from: [68, 264], at: [104, 332], length: 196, w: [4, 2.4, 1], bend: "v" },
    { from: [68, 264], at: [104, 396], length: 210, w: [4, 2.4, 1], bend: "v" },
    { from: [68, 264], at: [104, 460], length: 222, w: [4, 2.4, 1], bend: "v" },
  ],
};

/* The focused node of the example: the inspector note and the bloom belong to it. */
const FOCUS = 1;

function timings(nodes: TreeNode[]): Timing[] {
  const result: Timing[] = [];
  nodes.forEach((node, i) => {
    if (i === 0) {
      result.push({ delay: 120, duration: 560 });
      return;
    }
    const p = nodes.findIndex((other) => other.line === node.parent);
    const sibling = nodes.slice(0, i).filter((other) => other.parent === node.parent).length;
    const parent = result[p]!;
    result.push({ delay: Math.round(parent.delay + parent.duration * 0.55) + sibling * 70, duration: 520 - node.depth * 50 });
  });
  return result;
}

function TriebMap({ id, layout, nodes, branch, pinned, onActive, onPin, children }: {
  id: string;
  layout: Layout;
  nodes: TreeNode[];
  branch: Set<number>;
  pinned: number | null;
  onActive: (line: number | null) => void;
  onPin: (line: number) => void;
  children?: ReactNode;
}) {
  const time = timings(nodes);
  const focus = layout.shapes[FOCUS]!;
  const focusLine = nodes[FOCUS]?.line;
  const pos = (x: number, y: number) => ({ left: `${(x / layout.w) * 100}%`, top: `${(y / layout.h) * 100}%` }) as CSSProperties;

  return (
    <div className={styles.map} data-layout={id} style={{ "--w": layout.w, aspectRatio: `${layout.w} / ${layout.h}` } as CSSProperties} role="group" aria-label="BloomMD Product Strategy Markdown mind map preview">
      <svg viewBox={`0 0 ${layout.w} ${layout.h}`} aria-hidden="true" focusable="false">
        {nodes.map((node, i) => {
          const shape = layout.shapes[i];
          if (!shape) return null;
          return <Branch key={node.line} id={`hero-${id}-${node.line}`} shape={shape} timing={time[i]!} lit={branch.has(node.line)} />;
        })}
        <Bloom at={[focus.at[0] + focus.length + 3, focus.at[1]]} timing={{ delay: time[FOCUS]!.delay + time[FOCUS]!.duration - 80, duration: 460 }} />
      </svg>
      {nodes.map((node, i) => {
        const shape = layout.shapes[i];
        if (!shape) return null;
        const arrive = { "--d": `${Math.round(time[i]!.delay + time[i]!.duration * 0.6)}ms` } as CSSProperties;
        return (
          <div key={node.line} className={styles.node} data-depth={node.depth} style={{ ...pos(shape.at[0], shape.at[1]), ...arrive }}>
            <button
              type="button"
              className={styles.word}
              data-lit={branch.has(node.line) || undefined}
              aria-pressed={pinned === node.line}
              aria-label={`Zweig „${node.title}“ in der Map hervorheben`}
              onMouseEnter={() => onActive(node.line)}
              onMouseLeave={() => onActive(null)}
              onFocus={() => onActive(node.line)}
              onBlur={() => onActive(null)}
              onClick={() => onPin(node.line)}
            >
              {node.title}
            </button>
            {node.notes.length > 0 && (
              <ul className={styles.notes} data-focus={node.line === focusLine || undefined}>
                {node.notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            )}
          </div>
        );
      })}
      {children}
    </div>
  );
}

/* The hero is the map: the headline is the root, the file's "#" line sends out the trunk. */
export function HeroTrieb({ markdown, intro }: { markdown: string; intro: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const nodes = headingTree(markdown);
  // At rest the focused branch is lit, in the file and in the map.
  const branch = branchOf(nodes, hover ?? pinned ?? nodes[FOCUS]?.line ?? null);
  const lines = markdown.split("\n");
  const map = { nodes, branch, pinned, onActive: setHover, onPin: (line: number) => setPinned((value) => (value === line ? null : line)) };

  const inspector = (
    <aside className={styles.inspector} aria-label="Inspector">
      <p className={styles.inspectorLabel}>Inspector</p>
      <p className={styles.inspectorTitle}>North Star</p>
      <p>Der ausgewählte Abschnitt bleibt editierbar, während seine Position in der Map sichtbar ist.</p>
      <ul>
        {["Markdown bleibt Quelle", "Node ist fokussiert", "Änderung speichert zurück"].map((item) => <li key={item}>{item}</li>)}
      </ul>
    </aside>
  );

  return (
    <section className={`${t.ground} ${bmdFonts} ${styles.hero}`}>
      <div className={t.wrap}>
        {intro}
        <div id="produkt" className={styles.stage} data-grow="play" data-testid="hero-trieb">
          <div className={styles.file}>
            <p className={styles.workspace}>BloomMD Workspace <span>/ files / strategy.md</span></p>
            <p className={styles.filename}><strong>strategy.md</strong> <span>Quelle</span></p>
            <pre>
              {lines.map((line, i) => (
                <span key={i} className={styles.line} data-lit={branch.has(i) || undefined} data-heading={line.startsWith("#") || undefined}
                  onMouseEnter={line.startsWith("#") ? () => setHover(i) : undefined}
                  onMouseLeave={line.startsWith("#") ? () => setHover(null) : undefined}>
                  {line || " "}
                </span>
              ))}
            </pre>
            <p className={styles.status}><span>?</span> <span>⌘S</span> <span>lokal gespeichert</span></p>
          </div>
          <div className={styles.wide}>
            <TriebMap id="wide" layout={wide} {...map}>{inspector}</TriebMap>
          </div>
          <div className={styles.narrow}>
            <TriebMap id="narrow" layout={narrow} {...map} />
            {inspector}
          </div>
        </div>
      </div>
    </section>
  );
}
