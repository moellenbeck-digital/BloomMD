"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { Bloom, Branch, type Timing } from "./branch";
import motion from "./branch.module.css";
import { bmdFonts } from "./fonts";
import { headingTree } from "./markdown-tree";
import t from "./tokens.module.css";
import type { TriebShape } from "./trieb";
import { useGrowOnView } from "./use-grow-on-view";
import styles from "./use-case-trieb.module.css";

export interface UseCase {
  id: string;
  label: string;
  file: string;
  heading: string;
  text: string;
  markdown: string;
}

const WIDE = { w: 1224, h: 430 };
const NARROW = { w: 350, tabs: 250, map: 336 };

/* The four use cases are four branches of one fork. */
const tabY = { wide: [76, 172, 268, 364], narrow: [44, 106, 168, 230] };
const fork = {
  /* Enters through the top edge of the section: the section is a branch of the page. */
  trunk: { from: [-52, -360], at: [18, 215], length: 0, w: [15, 11, 11], bend: "v" } satisfies TriebShape,
  wide: (i: number): TriebShape => ({ from: [18, 215], at: [86, tabY.wide[i]!], length: 262, w: [10, 5, 2.5] }),
  narrow: (i: number): TriebShape => ({ from: [8, -8], at: [40, tabY.narrow[i]!], length: 236, w: [9, 5, 2], bend: "v" }),
};

/* Every example file has the same shape: "#", two "##", two "###" under the second. */
const subWide = (selected: number): TriebShape[] => [
  { from: [348, tabY.wide[selected]!], at: [432, 215], length: 246, w: [8, 5.5, 4] },
  { from: [678, 215], at: [748, 108], length: 206, w: [5, 3, 1.4] },
  { from: [678, 215], at: [748, 322], length: 206, w: [5, 3, 1.4] },
  { from: [954, 322], at: [1006, 264], length: 196, w: [3, 1.8, 0.8] },
  { from: [954, 322], at: [1006, 382], length: 196, w: [3, 1.8, 0.8] },
];

const subNarrow: TriebShape[] = [
  { from: [8, -8], at: [22, 46], length: 244, w: [9, 6, 4], bend: "v" },
  { from: [32, 46], at: [62, 112], length: 196, w: [5, 3, 1.4], bend: "v" },
  { from: [32, 46], at: [62, 178], length: 214, w: [5, 3, 1.4], bend: "v" },
  { from: [72, 178], at: [108, 242], length: 206, w: [3, 1.8, 0.8], bend: "v" },
  { from: [72, 178], at: [108, 306], length: 206, w: [3, 1.8, 0.8], bend: "v" },
];

const at = (wide: TriebShape, narrow: TriebShape, delay: number) =>
  ({ "--x": wide.at[0], "--y": wide.at[1], "--nx": narrow.at[0], "--ny": narrow.at[1], "--d": `${delay}ms` }) as CSSProperties;

export function UseCaseTrieb({ items, kicker, title }: { items: UseCase[]; kicker: string; title: string }) {
  const [view, state] = useGrowOnView<HTMLElement>();
  const [selected, setSelected] = useState(0);
  /* null: nothing chosen yet. Pointer choices grow, keyboard choices appear at once. */
  const [choice, setChoice] = useState<"pointer" | "key" | null>(null);
  const active = items[selected]!;
  const nodes = headingTree(active.markdown);
  const subState = choice === null ? state : choice === "pointer" ? "play" : "end";
  const base = choice === null ? 560 : 0;
  /* A new choice finishes growing within 700 ms. */
  const subTime: Timing[] = [
    { delay: base, duration: 300 },
    { delay: base + 120, duration: 320 },
    { delay: base + 160, duration: 320 },
    { delay: base + 260, duration: 260 },
    { delay: base + 300, duration: 260 },
  ];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    const next = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = (next + items.length) % items.length;
    setChoice("key");
    setSelected(target);
    document.getElementById(`usecase-tab-${items[target]!.id}`)?.focus();
  }

  return (
    <section ref={view} className={`${t.ground} ${bmdFonts} ${styles.section}`} aria-labelledby="usecase-title" data-testid="usecase-trieb">
      <div className={t.wrap}>
        <header className={styles.head}>
          <p className={t.kicker}>{kicker}</p>
          <h2 id="usecase-title" className={`${t.title} ${styles.title}`}>{title}</h2>
        </header>
        <div className={styles.board}>
          <div className={styles.tabs} data-grow={choice === null ? state : "end"}>
            <svg className={styles.wideSvg} viewBox={`0 0 ${WIDE.w} ${WIDE.h}`} aria-hidden="true" focusable="false">
              <Branch id="use-trunk" shape={fork.trunk} timing={{ delay: 0, duration: 460 }} lit />
              {items.map((item, i) => <Branch key={item.id} id={`use-w-${item.id}`} shape={fork.wide(i)} timing={{ delay: 240 + i * 70, duration: 420 }} />)}
              {/* Painted last, so the chosen branch is never covered at the fork. */}
              <Branch id="use-w-lit" shape={fork.wide(selected)} timing={{ delay: 240 + selected * 70, duration: 420 }} lit />
            </svg>
            <svg className={styles.narrowSvg} viewBox={`0 0 ${NARROW.w} ${NARROW.tabs}`} aria-hidden="true" focusable="false">
              {items.map((item, i) => <Branch key={item.id} id={`use-n-${item.id}`} shape={fork.narrow(i)} timing={{ delay: i * 70, duration: 460 }} />)}
              <Branch id="use-n-lit" shape={fork.narrow(selected)} timing={{ delay: selected * 70, duration: 460 }} lit />
            </svg>
            <div role="tablist" aria-label={kicker} aria-orientation="vertical">
              {items.map((item, i) => (
                <div key={item.id} className={`${styles.node} ${motion.arrive}`} style={at(fork.wide(i), fork.narrow(i), 420 + i * 70)}>
                  <button
                    id={`usecase-tab-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={i === selected}
                    aria-controls="usecase-panel"
                    tabIndex={i === selected ? 0 : -1}
                    className={styles.tab}
                    onClick={(event) => {
                      if (i === selected) return;
                      setChoice(event.detail === 0 ? "key" : "pointer");
                      setSelected(i);
                    }}
                    onKeyDown={(event) => onKeyDown(event, i)}
                  >
                    {item.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div id="usecase-panel" role="tabpanel" tabIndex={0} aria-labelledby={`usecase-tab-${active.id}`} className={styles.panel}>
            <div key={active.id} className={styles.sub} data-grow={subState} role="img" aria-label={`${active.label} Markdown mind map preview`}>
              <svg className={styles.wideSvg} viewBox={`0 0 ${WIDE.w} ${WIDE.h}`} aria-hidden="true" focusable="false">
                {subWide(selected).map((shape, i) => <Branch key={i} id={`sub-w-${active.id}-${i}`} shape={shape} timing={subTime[i]!} lit={i === 0} />)}
                <Bloom at={[352, tabY.wide[selected]!]} size={15} timing={{ delay: base, duration: 420 }} />
              </svg>
              <svg className={styles.narrowSvg} viewBox={`0 0 ${NARROW.w} ${NARROW.map}`} aria-hidden="true" focusable="false">
                {subNarrow.map((shape, i) => <Branch key={i} id={`sub-n-${active.id}-${i}`} shape={shape} timing={subTime[i]!} lit={i === 0} />)}
                <Bloom at={[subNarrow[0]!.at[0] + subNarrow[0]!.length + 4, subNarrow[0]!.at[1]]} size={15} timing={{ delay: base + 180, duration: 420 }} />
              </svg>
              {nodes.map((node, i) => (
                <div key={node.line} className={`${styles.node} ${motion.arrive}`} style={at(subWide(selected)[i]!, subNarrow[i]!, subTime[i]!.delay + 60)} aria-hidden="true">
                  <span className={styles.word} data-depth={node.depth}>{node.title}</span>
                </div>
              ))}
            </div>
            <div className={styles.copy}>
              <h3>{active.heading}</h3>
              <p>{active.text}</p>
            </div>
            <div className={styles.file}>
              <p>{active.file}</p>
              <pre>{active.markdown}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
