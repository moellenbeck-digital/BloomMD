"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { bmdFonts } from "./fonts";
import { useGrowOnView } from "./use-grow-on-view";
import t from "./tokens.module.css";
import styles from "./templates-trieb.module.css";
import type { MarketingLocale } from "@/lib/locale";

const copy = {
  de: {
    kicker: "Vorlagen",
    title: "Nicht mit einer leeren Map starten.",
    lede: "Jede Vorlage ist eine normale Markdown-Datei. Öffne sie als Map und ersetze die Beispielinhalte durch deine eigenen.",
    all: "Alle Templates",
    allHref: "/templates",
    open: "In der Demo öffnen",
    query: "",
  },
  en: {
    kicker: "Templates",
    title: "Start with a real Markdown file.",
    lede: "Open a template as a map, then replace the example with your own content.",
    all: "Browse all templates",
    allHref: "/templates?lang=en",
    open: "Open in the demo",
    query: "&lang=en",
  },
} as const;

export interface TemplateShoot {
  title: string;
  category: string;
  href: string;
  text: string;
}

/* One trunk, one offshoot per template. The shoots are CSS only and add nothing to the server HTML. */
export function TemplatesTrieb({ items, locale = "de" }: { items: TemplateShoot[]; locale?: MarketingLocale }) {
  const c = copy[locale];
  const [view, grow] = useGrowOnView<HTMLUListElement>();

  return (
    <section id="templates" className={`${t.ground} ${t.deep} ${bmdFonts} ${styles.section}`} aria-labelledby="templates-title">
      <div className={`${t.wrap} ${styles.layout}`}>
        <div className={styles.head}>
          <p className={t.kicker}>{c.kicker}</p>
          <h2 id="templates-title" className={t.title}>{c.title}</h2>
          <p className={`${t.lede} ${styles.lede}`}>{c.lede}</p>
          <Link href={c.allHref} className={`${t.twig} ${styles.all}`}>
            {c.all}
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
                <Link href={`/demo?template=${item.href.split("/").pop()}${c.query}`} className={styles.open}>
                  {c.open}
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
