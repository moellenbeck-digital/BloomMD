"use client";

import type { CSSProperties } from "react";
import styles from "./vision-growth.module.css";
import { useGrowOnView } from "./use-grow-on-view";

export interface VisionCopy {
  today: string;
  todayText: string;
  pilot: string;
  pilotText: string;
  exploring: string;
  foundation: string;
  fields: readonly { number: string; issues: readonly number[]; title: string; question: string; detail: string }[];
}

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/* Three growth stages carry the status of each text: open blossom (usable today), bud (internal pilot),
   dashed branches with empty buds (exploring, nothing shipped). The words stay the status; the drawing repeats it. */
function Stage({ kind }: { kind: "bloom" | "bud" | "seed" }) {
  return (
    <svg className={styles.mark} data-kind={kind} viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true" focusable="false">
      <circle r="18" className={styles.halo} />
      {kind === "bloom" && (
        <g className={styles.petals}>
          {[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} cy="-7" rx="4.4" ry="7" transform={`rotate(${angle})`} />)}
          <circle r="3.6" />
        </g>
      )}
      {kind === "bud" && (
        <g className={styles.petals}>
          <path d="M0 -11 C 7 -5, 7 4, 0 7 C -7 4, -7 -5, 0 -11 Z" />
          <path className={styles.sepal} d="M0 11 C -8 10, -10 3, -9 0 C -4 2, -1 5, 0 11 C 1 5, 4 2, 9 0 C 10 3, 8 10, 0 11 Z" />
        </g>
      )}
      {kind === "seed" && <circle r="6.5" className={styles.empty} />}
    </svg>
  );
}

export function VisionGrowth({ copy }: { copy: VisionCopy }) {
  const [ref, state] = useGrowOnView<HTMLDivElement>();

  return (
    <div ref={ref} className={styles.root} data-grow={state} data-testid="vision-growth">
      <div className={styles.stages}>
        <div className={`${styles.stage} ${styles.today}`} style={delay(0)}>
          <Stage kind="bloom" />
          <div className={styles.card}>
            <p className={styles.status}>{copy.today}</p>
            <p>{copy.todayText}</p>
          </div>
        </div>
        <div className={`${styles.stage} ${styles.pilot}`} style={delay(320)}>
          <Stage kind="bud" />
          <div className={styles.card}>
            <p className={styles.status}>{copy.pilot}</p>
            <p>{copy.pilotText}</p>
          </div>
        </div>
      </div>

      <div className={styles.exploring}>
        <p className={styles.label} style={delay(620)}>{copy.exploring}</p>
        <svg className={styles.fork} style={delay(720)} viewBox="0 0 1200 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {[142, 447, 753, 1058].map((x) => <path key={x} d={`M 600 0 C 600 44, ${x} 20, ${x} 64`} />)}
        </svg>
        <ul className={styles.fields}>
          {copy.fields.map((field, index) => (
            <li key={field.number} className={styles.field} style={delay(900 + index * 110)}>
              <Stage kind="seed" />
              <div className={styles.fieldBody}>
                <p className={styles.number}>{field.number}</p>
                <h3>{field.title}</h3>
                <p className={styles.question}>{field.question}</p>
                <p className={styles.detail}>{field.detail}</p>
                <div className={styles.issues}>
                  {field.issues.map((issue) => (
                    <a key={issue} href={`https://github.com/moellenbeck-digital/BloomMD/issues/${issue}`} aria-label={`${field.title}: Issue ${issue}`}>
                      #{issue}
                    </a>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className={styles.foundation}>{copy.foundation}</p>
      </div>
    </div>
  );
}
