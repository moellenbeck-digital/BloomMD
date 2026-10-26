import type { WaitlistAdminEntry } from "./waitlist-db";

export type WaitlistExportStatus = "bestätigt" | "offen" | "abgemeldet";

const STATUS_LABEL: Record<WaitlistAdminEntry["status"], WaitlistExportStatus> = {
  confirmed: "bestätigt",
  pending: "offen",
  unsubscribed: "abgemeldet",
};

/** The timestamp that belongs to the status: when it was confirmed, unsubscribed or created. */
function statusTimestamp(entry: WaitlistAdminEntry) {
  if (entry.status === "unsubscribed") return entry.unsubscribedAt ?? entry.createdAt;
  if (entry.status === "confirmed") return entry.confirmedAt ?? entry.createdAt;
  return entry.createdAt;
}

/**
 * One CSV cell. The source field is typed by visitors, so a value that a spreadsheet would run as
 * a formula (`=`, `+`, `-`, `@`, tab, CR) gets a leading apostrophe before quoting.
 */
function csvCell(value: string | null | undefined) {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function waitlistEntriesToExportCsv(entries: WaitlistAdminEntry[]) {
  const rows = [
    ["email", "status", "zeitpunkt", "quelle"],
    ...entries.map((entry) => [entry.email, STATUS_LABEL[entry.status], statusTimestamp(entry), entry.source ?? ""]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function summarizeWaitlistExport(entries: WaitlistAdminEntry[]) {
  return {
    total: entries.length,
    confirmed: entries.filter((entry) => entry.status === "confirmed").length,
  };
}

/** The closing line of `export`; `total` and `confirmed` equal `count` and the database. */
export function formatWaitlistExportSummary(summary: { total: number; confirmed: number }) {
  return `${summary.total} Einträge, davon bestätigt ${summary.confirmed}`;
}
