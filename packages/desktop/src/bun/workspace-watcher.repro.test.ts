// TEMPORARY (Ticket #284): Wiederholungsschleife mit Event-Protokoll. Vor dem Merge entfernen.
import { expect, test } from "bun:test";
import { appendFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, platform, arch } from "node:os";
import { watchWorkspace } from "./workspace-watcher";

type Run = { variant: string; i: number; ok: boolean; readyMs: number; writeMs: number; events: string[]; addLatencyMs: number | null };

const ITERATIONS = 40;
const logLines: string[] = [];
const log = (line: string) => { logLines.push(line); console.log(`REPRO ${line}`); };

async function once(variant: "immediate" | "after50ms", i: number): Promise<Run> {
  const root = await mkdtemp(join(tmpdir(), "bloommd-watch-repro-"));
  await mkdir(join(root, "nested"));
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const events: string[] = [];
  let seen: (() => void) | undefined;
  const watcher = watchWorkspace(root, (file, kind) => { events.push(`${at()}ms ${kind}:${file}`); seen?.(); });
  let addAt: number | null = null;
  let writeAt = -1;
  try {
    await new Promise<void>((resolve, reject) => { watcher.once("ready", resolve); watcher.once("error", reject); });
    const readyMs = at();
    if (variant === "after50ms") await new Promise((r) => setTimeout(r, 50));
    writeAt = at();
    await writeFile(join(root, "nested/Note.MARKDOWN"), "# First\n");
    const ok = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      seen = () => { if (events.some((e) => e.endsWith("add:nested/Note.MARKDOWN"))) { addAt = at(); clearTimeout(timer); resolve(true); } };
      seen();
    });
    return { variant, i, ok, readyMs, writeMs: writeAt, events, addLatencyMs: addAt === null ? null : addAt - writeAt };
  } finally {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  }
}

test("repro #284: add after ready, repeated", async () => {
  log(`env platform=${platform()} arch=${arch()} bun=${Bun.version} node=${process.versions.node} iterations=${ITERATIONS}`);
  const runs: Run[] = [];
  for (const variant of ["immediate", "after50ms"] as const) {
    for (let i = 1; i <= ITERATIONS; i++) {
      const run = await once(variant, i);
      runs.push(run);
      log(`${variant} #${i} ok=${run.ok} ready@${run.readyMs}ms write@${run.writeMs}ms addLatency=${run.addLatencyMs}ms events=[${run.events.join(" | ")}]`);
    }
  }
  // gleichzeitig laufende Watcher (CPU-/IO-Last wie auf einem geteilten Runner)
  const parallel = await Promise.all(Array.from({ length: 12 }, (_, i) => once("immediate", 1000 + i)));
  for (const run of parallel) { runs.push({ ...run, variant: "immediate-parallel12" }); log(`immediate-parallel12 #${run.i} ok=${run.ok} ready@${run.readyMs}ms write@${run.writeMs}ms addLatency=${run.addLatencyMs}ms events=[${run.events.join(" | ")}]`); }
  const summary = ["immediate", "after50ms", "immediate-parallel12"].map((v) => {
    const r = runs.filter((x) => x.variant === v);
    const lat = r.map((x) => x.addLatencyMs).filter((x): x is number => x !== null).sort((a, b) => a - b);
    return `${v}: ${r.filter((x) => x.ok).length}/${r.length} ok, add latency min/median/max=${lat[0]}/${lat[Math.floor(lat.length / 2)]}/${lat[lat.length - 1]}ms`;
  });
  summary.forEach((s) => log(`SUMMARY ${s}`));
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) appendFileSync(stepSummary, `### #284 watcher repro\n\n\`\`\`\n${logLines.join("\n")}\n\`\`\`\n`);
  const failed = runs.filter((x) => !x.ok);
  // Das Protokoll steht bewusst in der Fehlermeldung, damit es auch aus der Prüfungsausgabe lesbar ist.
  expect(failed.length, `REPRO-PROTOKOLL\n${summary.join("\n")}\nFehlschläge:\n${failed.map((f) => `${f.variant} #${f.i} ready@${f.readyMs} write@${f.writeMs} events=[${f.events.join(" | ")}]`).join("\n")}`).toBe(0);
}, 300000);
