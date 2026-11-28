"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { bmdFonts } from "./fonts";
import { useGrowOnView } from "./use-grow-on-view";
import t from "./tokens.module.css";
import styles from "./templates-trieb.module.css";

export interface TemplateShoot {
  title: string;
  category: string;
  href: string;
  text: string;
}

/* One trunk, one offshoot per template. The shoots are CSS only and add nothing to the server HTML. */
export function TemplatesTrieb({ items }: { items: TemplateShoot[] }) {
  const [view, grow] = useGrowOnView<HTMLUListElement>();

  return (
    <section id="templates" className={`${t.ground} ${t.deep} ${bmdFonts} ${styles.section}`} aria-labelledby="templates-title">
      <div className={`${t.wrap} ${styles.layout}`}>
        <div className={styles.head}>
          <p className={t.kicker}>Vorlagen</p>
          <h2 id="templates-title" className={t.title}>Nicht mit einer leeren Map starten.</h2>
          <p className={`${t.lede} ${styles.lede}`}>
            Jede Vorlage ist eine normale Markdown-Datei. Öffne sie als Map und ersetze die Beispielinhalte durch deine eigenen.
          </p>
          <Link href="/templates" className={`${t.twig} ${styles.all}`}>
            Alle Templates
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <ul ref={view} className={styles.shoots} data-grow={grow}>
          {items.map((item) => (
            <li key={item.href} className={styles.shoot}>
              <article className={styles.body}>
                <p className={styles.category}>{item.category}</p>
                <h3 className={styles.title}>{item.title}</h3>
                <p className={styles.text}>{item.text}</p>
                <Link href={`/demo?template=${item.href.split("/").pop()}`} className={styles.open}>
                  In der Demo öffnen
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
