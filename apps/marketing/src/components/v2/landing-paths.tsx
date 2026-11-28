"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Branch } from "./branch";
import { bmdFonts } from "./fonts";
import { useGrowOnView } from "./use-grow-on-view";
import t from "./tokens.module.css";
import type { TriebShape } from "./trieb";
import styles from "./landing-paths.module.css";

export interface LandingPath {
  title: string;
  text: string;
  href: string;
  cta: string;
}

/* Wide: one fork. All three branches leave the same point; each ends at its own height, so the columns
   step up from the first way to the last. The farther branches stay above the nearer titles. */
const forkShapes: TriebShape[] = [
  { from: [0, 4], at: [44, 148], length: 290, w: [16, 9, 1.5], bend: "v" },
  { from: [0, 4], at: [444, 100], length: 270, w: [11, 6, 1] },
  { from: [0, 4], at: [844, 52], length: 250, w: [8, 4, 0.6] },
];

/* Three ways in, one origin. Narrow: the shoot runs down the left edge (CSS) and thins with each way. */
export function LandingPaths({ items, testId = "landing-paths" }: { items: readonly LandingPath[]; testId?: string }) {
  const [view, grow] = useGrowOnView<HTMLDivElement>();

  return (
    <section className={`${t.ground} ${bmdFonts} ${styles.section}`} data-testid={testId}>
      <div className={t.wrap}>
        <div ref={view} className={styles.forkWrap} data-grow={grow}>
          <svg className={styles.branches} viewBox="0 0 1200 180" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {/* Painted from the last way to the first, so the accent branch lies on top at the fork. */}
            {forkShapes.map((shape, i) => <Branch key={i} id={`${testId}-fork-${i}`} shape={shape} timing={{ delay: i * 200, duration: 480 }} lit={i === 0} />).reverse()}
          </svg>
          <ul className={styles.fork}>
            {items.map((item) => (
              <li key={item.title} className={styles.way}>
                <Link href={item.href} className={styles.link}>
                  <h2 className={styles.title}>{item.title}</h2>
                  <p className={styles.text}>{item.text}</p>
                  <span className={styles.cta}>
                    {item.cta}
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
