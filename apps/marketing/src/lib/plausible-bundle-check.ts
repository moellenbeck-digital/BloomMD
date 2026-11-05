/**
 * Check of the built marketing bundle for the Plausible values (used by scripts/verify-plausible-build.ts).
 *
 * NEXT_PUBLIC_* values are inlined at build time, so the client chunk that reads the Plausible config
 * contains them as literals: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN:"bloommd.io"`. The domain is not searched as a plain
 * string, because "bloommd.io" appears in every bundle (texts, links) and would pass with an empty value, which
 * was the production error. The key and its literal value are read instead, and the domain must sit in the same
 * client chunk as the script path.
 */

export const LEGACY_PLAUSIBLE_HOST = "plausible.moellenbeck-digital.io";
export const PLAUSIBLE_SCRIPT_PATH = "/_plausible/js/script.js";
export const PLAUSIBLE_API_HOST = "/_plausible";
export const DEFAULT_PLAUSIBLE_DOMAIN = "bloommd.io";

export type BundleFile = { path: string; text: string };

export type PlausibleBundleReport = {
  errors: string[];
  /** Paths only, never file contents: the proof for the CI log. */
  domainFiles: string[];
  scriptFiles: string[];
  apiHostFiles: string[];
  eventPathFiles: string[];
  legacyHostFiles: string[];
};

/** Literal values the build inlined for one NEXT_PUBLIC_* key (`KEY:"value"`, `KEY:'value'` or `KEY:`value``). */
export function inlinedValues(text: string, key: string): string[] {
  const pattern = new RegExp(`${key}["']?\\s*:\\s*(["'\`])((?:(?!\\1)[^\\\\\\n]|\\\\.)*)\\1`, "g");
  return [...text.matchAll(pattern)].map((match) => match[2] ?? "");
}

export function checkPlausibleBundle(input: { clientFiles: BundleFile[]; allFiles: BundleFile[]; expectedDomain: string }): PlausibleBundleReport {
  const { clientFiles, allFiles, expectedDomain } = input;
  const errors: string[] = [];
  const report: PlausibleBundleReport = { errors, domainFiles: [], scriptFiles: [], apiHostFiles: [], eventPathFiles: [], legacyHostFiles: [] };

  if (!expectedDomain.trim()) {
    errors.push("The expected Plausible domain is empty (NEXT_PUBLIC_PLAUSIBLE_DOMAIN must not be set to an empty value).");
    return report;
  }

  for (const file of clientFiles) {
    const domains = inlinedValues(file.text, "NEXT_PUBLIC_PLAUSIBLE_DOMAIN");
    if (domains.length === 0) continue;
    if (domains.some((value) => !value.trim())) errors.push(`${file.path}: NEXT_PUBLIC_PLAUSIBLE_DOMAIN is baked in empty.`);
    const wrong = domains.filter((value) => value.trim() && value !== expectedDomain);
    if (wrong.length > 0) errors.push(`${file.path}: NEXT_PUBLIC_PLAUSIBLE_DOMAIN is "${wrong[0]}", expected "${expectedDomain}".`);
    if (!domains.includes(expectedDomain)) continue;

    report.domainFiles.push(file.path);
    if (inlinedValues(file.text, "NEXT_PUBLIC_PLAUSIBLE_SRC").includes(PLAUSIBLE_SCRIPT_PATH)) report.scriptFiles.push(file.path);
    if (inlinedValues(file.text, "NEXT_PUBLIC_PLAUSIBLE_API_HOST").includes(PLAUSIBLE_API_HOST)) report.apiHostFiles.push(file.path);
  }

  if (report.domainFiles.length === 0) {
    errors.push(`No client chunk has NEXT_PUBLIC_PLAUSIBLE_DOMAIN baked in as "${expectedDomain}": the build ships no tracking.`);
  } else {
    if (report.scriptFiles.length === 0) errors.push(`The chunk with the domain "${expectedDomain}" does not carry NEXT_PUBLIC_PLAUSIBLE_SRC "${PLAUSIBLE_SCRIPT_PATH}".`);
    if (report.apiHostFiles.length === 0) errors.push(`The chunk with the domain "${expectedDomain}" does not carry NEXT_PUBLIC_PLAUSIBLE_API_HOST "${PLAUSIBLE_API_HOST}".`);
  }

  report.eventPathFiles = clientFiles.filter((file) => file.text.includes("/api/event")).map((file) => file.path);
  if (report.eventPathFiles.length === 0) errors.push('No client chunk contains the event path "/api/event" (data-api).');

  report.legacyHostFiles = allFiles.filter((file) => file.text.includes(LEGACY_PLAUSIBLE_HOST)).map((file) => file.path);
  if (report.legacyHostFiles.length > 0) errors.push(`The legacy Plausible host ${LEGACY_PLAUSIBLE_HOST} is still in: ${report.legacyHostFiles.join(", ")}`);

  return report;
}

/** Lines for the CI log: file names and counts, no contents. */
export function describePlausibleBundleReport(report: PlausibleBundleReport, expectedDomain: string, filesChecked: number): string[] {
  const list = (paths: string[]) => (paths.length ? paths.join(", ") : "none");
  return [
    `Domain "${expectedDomain}" baked in (${report.domainFiles.length} file(s)): ${list(report.domainFiles)}`,
    `Script path ${PLAUSIBLE_SCRIPT_PATH} in the same chunk (${report.scriptFiles.length} file(s)): ${list(report.scriptFiles)}`,
    `API host ${PLAUSIBLE_API_HOST} in the same chunk (${report.apiHostFiles.length} file(s)): ${list(report.apiHostFiles)}`,
    `Event path /api/event in ${report.eventPathFiles.length} client file(s)`,
    `Legacy host ${LEGACY_PLAUSIBLE_HOST}: ${report.legacyHostFiles.length === 0 ? `not found in any of ${filesChecked} text files` : `FOUND in ${report.legacyHostFiles.length} file(s)`}`,
  ];
}
