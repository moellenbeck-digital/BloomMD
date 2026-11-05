// Job summary of the touch views (#68): what was measured, with what result, and what was not checked.
// Reads the rows touch-views.spec.ts writes and prints Markdown; the workflow appends it to $GITHUB_STEP_SUMMARY.
import { existsSync, readFileSync } from "node:fs";

const rowsFile = new URL("../test-results/summary-rows.jsonl", import.meta.url);
const rows = existsSync(rowsFile)
  ? readFileSync(rowsFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];

const lines = ["## Touch views of the built mobile assets (`packages/mobile/dist`)", ""];
if (rows.length === 0) {
  lines.push("**Nothing was measured** – the run ended before the first view (build, preview server or browser). See the log.", "");
} else {
  lines.push("| Device | View | Operable elements measured | Under 44 px | Horizontal overflow | Result |", "|---|---|---:|---:|---:|---|");
  for (const row of rows) {
    lines.push(`| ${row.device} | ${row.state} | ${row.scanned} | ${row.small} | ${row.overflow} px | ${row.ok ? "✅" : "❌"} |`);
  }
  lines.push("");
}
lines.push(
  "**Checked:** iPhone SE, iPad (portrait) and Pixel 5 device profiles in Chromium with touch emulation, against the production build served by `vite preview`: empty start view, map, selected node, editor (opens from the map, text field takes a tap) and file drawer; size of every operable element (44 px, exceptions as in `docs/MOBILE-MATRIX.md`) and horizontal overflow.",
  "",
  "**Known deviation, not asserted** (`test.fixme`): the close button of the editor sheet is covered by the editor header and takes no tap (`docs/MOBILE-MATRIX.md`, deviation 10).",
  "",
  "**Not checked here:**",
  "- the native shell: Capacitor plugins (folder picker, keychain, share sheet, app links), the iOS and Android builds and their self-tests run in `ios.yml` and `android.yml`;",
  "- WebKit rendering (the iPhone and iPad profiles run on Chromium) and real Safari or WKWebView behaviour;",
  "- landscape, the on-screen keyboard, gestures (pan, pinch) and the cloud sign-in: gestures and keyboard are covered for the web app by the @t66 specs, the rest is on the manual list in `docs/MOBILE-MATRIX.md`;",
  "- notes from a real folder: the demo note is imported into the browser's storage.",
  "",
);
process.stdout.write(`${lines.join("\n")}\n`);
