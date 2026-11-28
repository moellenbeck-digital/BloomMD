"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { bmdFonts } from "./fonts";
import { useGrowOnView } from "./use-grow-on-view";
import t from "./tokens.module.css";
import styles from "./landing-paths.module.css";

export interface LandingPath {
  title: string;
  text: string;
  href: string;
  cta: string;
}

/* Three ways in, each leaving the same shoot. The shoot is CSS only and thins from the first way to the last. */
export function LandingPaths({ items }: { items: LandingPath[] }) {
  const [view, grow] = useGrowOnView<HTMLUListElement>();

  return (
    <section className={`${t.ground} ${bmdFonts} ${styles.section}`} data-testid="landing-paths">
      <div className={t.wrap}>
        <ul ref={view} className={styles.fork} data-grow={grow}>
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
    </section>
  );
}
