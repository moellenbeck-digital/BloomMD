import { trialSummary } from "../lib/trial-display";

/** Cell of the user list: trial end with the time that is left (ticket #206). Server component, only prints text. */
export function TrialEndsCell({ cellData }: { cellData?: unknown }) {
  const summary = trialSummary(typeof cellData === "string" ? cellData : null);
  const color = summary.state === "ended" ? "var(--theme-error-500)" : summary.state === "ends_today" ? "var(--theme-warning-500)" : undefined;
  return (
    <span data-testid="trial-ends-cell" data-state={summary.state} style={color ? { color } : undefined}>
      {summary.text}
    </span>
  );
}
