import type { CSSProperties } from "react";
import { centerline, outline, petal, type Point, type TriebShape } from "./trieb";
import styles from "./branch.module.css";

export interface Timing {
  delay: number;
  duration: number;
}

const ms = (timing: Timing) => ({ "--d": `${timing.delay}ms`, "--t": `${timing.duration}ms` }) as CSSProperties;

/* One shoot. Growth is a mask stroke that runs along the centerline from origin to tip. */
export function Branch({ id, shape, timing, lit = false, className }: { id: string; shape: TriebShape; timing: Timing; lit?: boolean; className?: string }) {
  return (
    <g className={className}>
      <mask id={id} maskUnits="userSpaceOnUse" x="-400" y="-600" width="2400" height="2000">
        <path className={styles.grow} style={ms(timing)} d={centerline(shape)} pathLength={1} fill="none" stroke="#fff" strokeWidth={shape.w[0] * 1.6 + 8} />
      </mask>
      <path className={styles.shoot} data-lit={lit || undefined} d={outline(shape, lit ? 1.3 : 1)} mask={`url(#${id})`} />
    </g>
  );
}

/* The one bloom per view: it marks where the focus sits. */
export function Bloom({ at, size = 17, timing }: { at: Point; size?: number; timing: Timing }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`}>
      <g className={styles.open} style={ms(timing)}>
        {[8, 80, 152, 224, 296].map((angle) => <path key={angle} d={petal(size)} transform={`rotate(${angle})`} className={styles.petal} />)}
        <circle r={size * 0.16} className={styles.heart} />
      </g>
    </g>
  );
}

/* A closed bud: planned further than "exploring", not yet open. */
export function Bud({ at, size = 22, angle = 90, timing }: { at: Point; size?: number; angle?: number; timing: Timing }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${angle})`}>
      <g className={styles.open} style={ms(timing)}>
        <path d={petal(size)} className={styles.budBody} />
        <path d={petal(size * 0.72)} transform="rotate(-24)" className={styles.sepal} />
        <path d={petal(size * 0.72)} transform="rotate(24)" className={styles.sepal} />
      </g>
    </g>
  );
}
