import type { ReactNode } from "react";
import styles from "./agent-hull.module.css";

/* Outer shell only: ground colour and soil line. The agent section and its scene stay untouched. */
export function AgentHull({ children }: { children: ReactNode }) {
  return (
    <div className={styles.hull} data-testid="agent-hull">
      {children}
    </div>
  );
}
