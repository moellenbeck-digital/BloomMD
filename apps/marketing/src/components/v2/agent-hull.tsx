import type { ReactNode } from "react";
import t from "./tokens.module.css";
import styles from "./agent-hull.module.css";

/* Outer shell only: ground colour, soil line and one shoot. The agent section and its scene stay untouched. */
export function AgentHull({ children }: { children: ReactNode }) {
  return (
    <div className={`${t.ground} ${styles.hull}`} data-testid="agent-hull">
      <span className={styles.shoot} aria-hidden="true" />
      {children}
    </div>
  );
}
