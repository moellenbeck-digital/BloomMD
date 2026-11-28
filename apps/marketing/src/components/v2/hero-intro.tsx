import { ArrowRight } from "lucide-react";
import Link from "next/link";
import t from "./tokens.module.css";
import styles from "./hero-trieb.module.css";

/* Headline, lede and actions. They have no motion of their own; only the hero as a whole fades in. */
export function HeroIntro({ onDemo }: { onDemo: () => void }) {
  return (
    <div className={styles.intro}>
      <div className={styles.headline}>
        <p className={t.kicker}>Markdown-Dateien · visuelle Maps</p>
        <h1 className={styles.h1}>
          Markdown-Dateien. <br />
          <span>Als visuelle Maps.</span>
        </h1>
      </div>
      <div className={styles.aside}>
        <p className={`${t.lede} ${styles.lede}`}>
          Öffne eine Markdown-Datei und erkenne ihre Struktur sofort. BloomMD ergänzt eine visuelle
          Ebene: lokal, portabel und ohne neues Dateiformat.
        </p>
        <div className={styles.actions}>
          <Link href="/demo" onClick={onDemo} className={t.primary}>
            Demo ohne Konto testen
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/download" className={t.twig}>Desktop herunterladen</Link>
        </div>
        <p className={styles.meta}>Normales Markdown · lokale Dateien · macOS und Omarchy/Linux</p>
      </div>
    </div>
  );
}
