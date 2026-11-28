"use client";

import { useState, type KeyboardEvent } from "react";
import { GrowthStage } from "./growth-stage";
import styles from "./use-case-growth.module.css";

export interface UseCase {
  id: string;
  label: string;
  file: string;
  heading: string;
  text: string;
  markdown: string;
}

/* Prototype of the use-case tabs: every tab plants its file, the map grows from it. Arrow keys move
   between tabs (roving tab index). */
export function UseCaseGrowth({ items, label }: { items: readonly UseCase[]; label: string }) {
  const [activeId, setActiveId] = useState(items[0]!.id);
  const [switched, setSwitched] = useState(false);
  const active = items.find((item) => item.id === activeId) ?? items[0]!;

  const select = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    setSwitched(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === active.id);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = items[(target + items.length) % items.length]!;
    select(next.id);
    document.getElementById(`usecase-tab-${next.id}`)?.focus();
  };

  return (
    <div className={styles.root}>
      <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {items.map((item) => (
          <button
            key={item.id}
            id={`usecase-tab-${item.id}`}
            type="button"
            role="tab"
            tabIndex={active.id === item.id ? 0 : -1}
            aria-selected={active.id === item.id}
            aria-controls={`usecase-panel-${item.id}`}
            onClick={() => select(item.id)}
            className={styles.tab}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id={`usecase-panel-${active.id}`} role="tabpanel" aria-labelledby={`usecase-tab-${active.id}`} className={styles.panel}>
        <div className={styles.intro}>
          <h3>{active.heading}</h3>
          <p>{active.text}</p>
        </div>
        <GrowthStage
          key={active.id}
          markdown={active.markdown}
          file={active.file}
          trigger={switched ? "load" : "view"}
          mapLabel={`${active.label} Markdown mind map preview`}
          lineLabel={(title) => `Zweig „${title}“ in der Map hervorheben`}
        />
      </div>
    </div>
  );
}
