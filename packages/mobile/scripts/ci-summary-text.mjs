// Shared source of the job summaries of the mobile workflows (#68): mobile.yml (e2e/summary.mjs),
// ios.yml and android.yml (scripts/ci-summary.mjs) all take the "not checked" text from here.

/** What no emulator, simulator or browser run of these workflows can show. */
export const NOT_CHECKED = [
  "real devices, their screens, sensors and OS versions",
  "the real on-screen keyboard and momentum scrolling",
  "permission dialogs of the system (folder access, sharing, sign-in return)",
  "browser and WebView quirks of real Safari and Chrome on a phone",
];

/** Said once per summary: how far to trust a green run. */
export const EMULATION_SENTENCE =
  "An emulator, simulator or emulated browser catches layout errors and crashes, nothing else: a green run is no release approval for real devices.";

/** Markdown lines of the "Not checked" part; `extra` are the items only this workflow leaves out. */
export function notCheckedLines(extra = []) {
  return ["**Not checked here:**", ...[...extra, ...NOT_CHECKED].map((item) => `- ${item}`), "", EMULATION_SENTENCE, ""];
}

const STATUS = {
  success: "✅ passed",
  failure: "❌ failed",
  cancelled: "⚠️ cancelled",
  skipped: "⏭️ not run (an earlier step did not succeed)",
};

/**
 * Markdown for one job: a row per step with its real outcome. `steps` is the `steps` context of the
 * job (`toJSON(steps)`), `labels` lists the step ids to report as `[id, label]`. A step that is not in the
 * context never ran, which is reported as not run and never as passed.
 */
export function stepTable(steps, labels) {
  const rows = labels.map(([id, label]) => {
    const outcome = steps?.[id]?.outcome ?? "skipped";
    return `| ${label} | ${STATUS[outcome] ?? `❔ ${outcome}`} |`;
  });
  return ["| Step | Result |", "|---|---|", ...rows, ""];
}

/** The line about an artifact: uploaded, or why there is none. */
export function artifactLine({ name, fileExists, sizeBytes, uploadOutcome, reason }) {
  if (fileExists && uploadOutcome === "success") return `**Artifact \`${name}\`:** uploaded (${(sizeBytes / 1024 / 1024).toFixed(1)} MB).`;
  if (fileExists) return `**Artifact \`${name}\`:** built, but the upload ${uploadOutcome === "skipped" ? "did not run" : `ended as ${uploadOutcome}`}.`;
  return `**Artifact \`${name}\`:** none – ${reason}`;
}
