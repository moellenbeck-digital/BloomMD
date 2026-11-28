"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Bloom, Branch, type Timing } from "./branch";
import motion from "./branch.module.css";
import { bmdFonts } from "./fonts";
import { branchOf, headingTree, type TreeNode } from "./markdown-tree";
import t from "./tokens.module.css";
import type { Point, TriebShape } from "./trieb";
import styles from "./hero-trieb.module.css";
import type { MarketingLocale } from "@/lib/locale";

const copy = {
  de: {
    anchor: "produkt",
    source: "Quelle",
    saved: "lokal gespeichert",
    note: "Der ausgewählte Abschnitt bleibt editierbar, während seine Position in der Map sichtbar ist.",
    facts: ["Markdown bleibt Quelle", "Node ist fokussiert", "Änderung speichert zurück"],
    /* Accessible name of a word; without one the heading itself names the button. */
    highlight: (title: string): string | undefined => `Zweig „${title}“ in der Map hervorheben`,
  },
  en: {
    anchor: "product",
    source: "Source",
    saved: "saved locally",
    note: "The selected section stays editable while its place in the map remains visible.",
    facts: ["Markdown stays the source", "Node is focused", "Change writes back"],
    highlight: (): string | undefined => undefined,
  },
} as const;

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

/* One map for both widths: the words exist once, CSS picks the drawing and the word positions. */
function TriebMap({ nodes, branch, pinned, onActive, onPin, children, locale }: {
  locale: MarketingLocale;
  nodes: TreeNode[];
  branch: Set<number>;
  pinned: number | null;
  onActive: (line: number | null) => void;
  onPin: (line: number) => void;
  children?: ReactNode;
}) {
  const time = timings(nodes);
  const pos = (layout: Layout, [x, y]: Point) => [`${(x / layout.w) * 100}%`, `${(y / layout.h) * 100}%`] as const;
  const size = { "--wn": narrow.w, "--an": `${narrow.w} / ${narrow.h}`, "--ww": wide.w, "--aw": `${wide.w} / ${wide.h}` } as CSSProperties;

  return (
    <div className={styles.mapwrap}>
      <div className={styles.map} style={size} role="group" aria-label="BloomMD Product Strategy Markdown mind map preview">
        {([["wide", wide], ["narrow", narrow]] as const).map(([id, layout]) => {
          const focus = layout.shapes[FOCUS]!;
          return (
            <svg key={id} data-layout={id} viewBox={`0 0 ${layout.w} ${layout.h}`} aria-hidden="true" focusable="false">
              {nodes.map((node, i) => {
                const shape = layout.shapes[i];
                if (!shape) return null;
                return <Branch key={node.line} id={`hero-${id}-${node.line}`} shape={shape} timing={time[i]!} lit={branch.has(node.line)} />;
              })}
              <Bloom at={[focus.at[0] + focus.length + 3, focus.at[1]]} timing={{ delay: time[FOCUS]!.delay + time[FOCUS]!.duration - 80, duration: 460 }} />
            </svg>
          );
        })}
        {nodes.map((node, i) => {
          if (!wide.shapes[i] || !narrow.shapes[i]) return null;
          const [xw, yw] = pos(wide, wide.shapes[i].at);
          const [xn, yn] = pos(narrow, narrow.shapes[i].at);
          const place = { "--xw": xw, "--yw": yw, "--xn": xn, "--yn": yn, "--d": `${Math.round(time[i]!.delay + time[i]!.duration * 0.6)}ms` } as CSSProperties;
          return (
            <div key={node.line} className={`${styles.node} ${motion.arrive}`} data-depth={node.depth} style={place}>
              <button
                type="button"
                className={styles.word}
                data-lit={branch.has(node.line) || undefined}
                aria-pressed={pinned === node.line}
                aria-label={copy[locale].highlight(node.title)}
                onMouseEnter={() => onActive(node.line)}
                onMouseLeave={() => onActive(null)}
                onFocus={() => onActive(node.line)}
                onBlur={() => onActive(null)}
                onClick={() => onPin(node.line)}
              >
                {node.title}
              </button>
              {node.notes.length > 0 && (
                <ul className={styles.notes} data-focus={node.line === nodes[FOCUS]?.line || undefined}>
                  {node.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}

/* The hero is the map: the headline is the root, the file's "#" line sends out the trunk. */
export function HeroTrieb({ markdown, intro, locale = "de" }: { markdown: string; intro: ReactNode; locale?: MarketingLocale }) {
  const c = copy[locale];
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const nodes = headingTree(markdown);
  // At rest the focused branch is lit, in the file and in the map.
  const branch = branchOf(nodes, hover ?? pinned ?? nodes[FOCUS]?.line ?? null);
  const lines = markdown.split("\n");
  const map = { locale, nodes, branch, pinned, onActive: setHover, onPin: (line: number) => setPinned((value) => (value === line ? null : line)) };

  const inspector = (
    <aside className={styles.inspector} aria-label="Inspector">
      <p className={styles.inspectorLabel}>Inspector</p>
      <p className={styles.inspectorTitle}>North Star</p>
      <p>{c.note}</p>
      <ul>
        {c.facts.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </aside>
  );

  return (
    // Same entrance as the hero before v2. Content that starts at opacity 0 is no LCP candidate, so the
    // elements measured as LCP stay the same: header logo (narrow), demo section heading (wide).
    <section className={`${t.ground} ${bmdFonts} ${styles.hero} motion-safe:animate-[sectionIn_.45s_ease-out_both]`}>
      <div className={t.wrap}>
        {intro}
        <div id={c.anchor} className={styles.stage} data-grow="play" data-testid="hero-trieb">
          <div className={styles.file}>
            <p className={styles.workspace}>BloomMD Workspace <span>/ files / strategy.md</span></p>
            <p className={styles.filename}><strong>strategy.md</strong> <span>{c.source}</span></p>
            <pre>
              {lines.map((line, i) => (
                <span key={i} className={styles.line} data-lit={branch.has(i) || undefined} data-heading={line.startsWith("#") || undefined}
                  onMouseEnter={line.startsWith("#") ? () => setHover(i) : undefined}
                  onMouseLeave={line.startsWith("#") ? () => setHover(null) : undefined}>
                  {line || " "}
                </span>
              ))}
            </pre>
            <p className={styles.status}><span>?</span> <span>⌘S</span> <span>{c.saved}</span></p>
          </div>
          <TriebMap {...map}>{inspector}</TriebMap>
        </div>
      </div>
    </section>
  );
}
