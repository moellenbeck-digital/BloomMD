import { Check } from "lucide-react";
import { GrowthStage } from "./growth-stage";
import styles from "./hero-growth.module.css";

/* Prototype of the hero product window: same texts as before, but the file visibly grows into its map.
   Server rendered with a fixed viewBox, so nothing shifts and the headline stays the LCP element. */
export function HeroGrowth({ markdown }: { markdown: string }) {
  return (
    <div className={styles.frame} id="produkt">
      <div className={styles.window}>
        <div className={styles.bar}>
          <span className={styles.title}>
            <span className={styles.dot} aria-hidden="true" />
            BloomMD Workspace
            <span className={styles.path}>/ files / strategy.md</span>
          </span>
          <span className={styles.meta}>
            <span className={styles.key}>?</span>
            <span className={`${styles.key} ${styles.wideOnly}`}>⌘S</span>
            <span className={styles.saved}><span aria-hidden="true" />lokal gespeichert</span>
          </span>
        </div>
        <GrowthStage
          markdown={markdown}
          file="strategy.md"
          badge="Quelle"
          trigger="load"
          mapLabel="BloomMD Product Strategy Markdown mind map preview"
          lineLabel={(title) => `Zweig „${title}“ in der Map hervorheben`}
        />
        <aside className={styles.inspector}>
          <div>
            <p className={styles.eyebrow}>Inspector</p>
            <h3>North Star</h3>
          </div>
          <p className={styles.text}>Der ausgewählte Abschnitt bleibt editierbar, während seine Position in der Map sichtbar ist.</p>
          <ul>
            {["Markdown bleibt Quelle", "Node ist fokussiert", "Änderung speichert zurück"].map((item) => (
              <li key={item}><Check size={14} aria-hidden="true" />{item}</li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
