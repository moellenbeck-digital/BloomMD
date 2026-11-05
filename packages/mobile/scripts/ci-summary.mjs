// Job summary for ios.yml and android.yml (#68): the real outcome of each step, the artifact (or why
// there is none) and what is not checked. The workflow appends stdout to $GITHUB_STEP_SUMMARY.
//
//   STEPS_JSON='${{ toJSON(steps) }}' node scripts/ci-summary.mjs --title "iOS: simulator build and self-test" \
//     --step unit="Unit tests" --step build="Simulator build" \
//     --artifact-name ios-simulator-app --artifact-file /path/App.zip --artifact-step upload \
//     --artifact-missing "the simulator app was not built" --extra "the iPhone" --extra "..."
import { existsSync, statSync } from "node:fs";
import { artifactLine, notCheckedLines, stepTable } from "./ci-summary-text.mjs";

const args = process.argv.slice(2);
const values = (flag) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1] ?? ""] : []));
const one = (flag) => values(flag)[0];

const labels = values("--step").map((pair) => {
  const split = pair.indexOf("=");
  return [pair.slice(0, split), pair.slice(split + 1)];
});
let steps = {};
try {
  steps = JSON.parse(process.env.STEPS_JSON ?? "{}");
} catch {
  // Unreadable context: every step is then reported as not run, never as passed.
}

const lines = [`## ${one("--title") ?? "Mobile build"}`, "", ...stepTable(steps, labels)];

const name = one("--artifact-name");
if (name) {
  const file = one("--artifact-file") ?? "";
  const fileExists = file !== "" && existsSync(file);
  lines.push(artifactLine({
    name,
    fileExists,
    sizeBytes: fileExists ? statSync(file).size : 0,
    uploadOutcome: steps?.[one("--artifact-step") ?? ""]?.outcome ?? "skipped",
    reason: one("--artifact-missing") ?? "nothing was built.",
  }), "");
}

lines.push(...notCheckedLines(values("--extra")));
process.stdout.write(`${lines.join("\n")}\n`);
