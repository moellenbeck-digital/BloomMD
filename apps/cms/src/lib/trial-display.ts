/**
 * Display of the trial end in the user list: date (Berlin time) and the time that is left. Pure, so the border
 * cases are tested (`trial-display.test.ts`); the cell component only prints the result.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const date = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });

const days = (count: number) => `${count} ${count === 1 ? "Tag" : "Tage"}`;

export type TrialState = "none" | "running" | "ends_today" | "ended";

export function trialSummary(endsAt: string | Date | null | undefined, now: Date = new Date()): { text: string; state: TrialState } {
  if (!endsAt) return { text: "–", state: "none" };
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return { text: "–", state: "none" };
  const label = date.format(end);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) {
    const ago = Math.floor(-diff / DAY_MS);
    return { text: ago === 0 ? `${label} (heute abgelaufen)` : `${label} (abgelaufen vor ${days(ago)})`, state: "ended" };
  }
  if (diff < DAY_MS) return { text: `${label} (endet in weniger als einem Tag)`, state: "ends_today" };
  return { text: `${label} (noch ${days(Math.ceil(diff / DAY_MS))})`, state: "running" };
}
