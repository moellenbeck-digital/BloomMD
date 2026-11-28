"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { bmdFonts } from "./fonts";
import t from "./tokens.module.css";
import styles from "./faq-trieb.module.css";

export interface FaqItem {
  question: string;
  answer: string;
}

/* One trunk, one node per question; the open one sends out the lit shoot. */
export function FaqTrieb({ items, kicker, title }: { items: readonly FaqItem[]; kicker: string; title: string }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className={`${t.ground} ${t.deep} ${bmdFonts} ${styles.section}`} aria-labelledby="faq-title">
      <div className={`${t.wrap} ${styles.layout}`}>
        <div>
          <p className={t.kicker}>{kicker}</p>
          <h2 id="faq-title" className={`${t.title} ${styles.title}`}>{title}</h2>
        </div>
        <ul className={styles.list}>
          {items.map((item, index) => {
            const open = openIndex === index;
            return (
              <li key={item.question} className={styles.item} data-open={open || undefined}>
                <button type="button" onClick={() => setOpenIndex(open ? -1 : index)} className={styles.question} aria-expanded={open}>
                  {item.question}
                  <Plus className={styles.mark} size={18} aria-hidden="true" />
                </button>
                {open && <p className={styles.answer}>{item.answer}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
