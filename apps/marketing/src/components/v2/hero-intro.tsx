import { ArrowRight } from "lucide-react";
import Link from "next/link";
import t from "./tokens.module.css";
import styles from "./hero-trieb.module.css";
import type { MarketingLocale } from "@/lib/locale";

const copy = {
  de: {
    kicker: "Markdown-Dateien · visuelle Maps",
    headline: ["Markdown-Dateien.", "Als visuelle Maps."],
    lede: "Öffne eine Markdown-Datei und erkenne ihre Struktur sofort. BloomMD ergänzt eine visuelle Ebene: lokal, portabel und ohne neues Dateiformat.",
    demo: "Demo ohne Konto testen",
    demoHref: "/demo",
    download: "Desktop herunterladen",
    downloadHref: "/download",
    meta: "Normales Markdown · lokale Dateien · macOS und Omarchy/Linux",
  },
  en: {
    kicker: "Markdown files · visual maps",
    headline: ["Markdown files.", "Visual maps."],
    lede: "Open a Markdown file and see its structure immediately. BloomMD adds a visual layer — local, portable and without a new file format.",
    demo: "Try the no-login demo",
    demoHref: "/demo?lang=en",
    download: "Download desktop",
    downloadHref: "/download?lang=en",
    meta: "Normal Markdown / local files / macOS and Omarchy/Linux",
  },
} as const;

/* Headline, lede and actions. They have no motion of their own; only the hero as a whole fades in. */
export function HeroIntro({ onDemo, locale = "de" }: { onDemo: () => void; locale?: MarketingLocale }) {
  const c = copy[locale];
  return (
    <div className={styles.intro}>
      <div className={styles.headline}>
        <p className={t.kicker}>{c.kicker}</p>
        <h1 className={styles.h1}>
          {c.headline[0]} <br />
          <span>{c.headline[1]}</span>
        </h1>
      </div>
      <div className={styles.aside}>
        <p className={`${t.lede} ${styles.lede}`}>{c.lede}</p>
        <div className={styles.actions}>
          <Link href={c.demoHref} onClick={onDemo} className={t.primary}>
            {c.demo}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href={c.downloadHref} className={t.twig}>{c.download}</Link>
        </div>
        <p className={styles.meta}>{c.meta}</p>
      </div>
    </div>
  );
}
