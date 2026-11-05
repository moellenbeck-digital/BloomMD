// TEMPORARY (Ticket #284): Wiederholungsschleife mit Event-Protokoll. Vor dem Merge entfernen.
import { expect, test } from "bun:test";
import { watch as fsWatch } from "node:fs";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, platform, arch, cpus } from "node:os";
import { watchWorkspace } from "./workspace-watcher";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const escape = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const notice = (title: string, body: string) => console.log(`::notice title=${escape(title)}::${escape(body)}`);
const tmp = () => mkdtemp(join(tmpdir(), "bloommd-watch-repro-"));
const until = (listeners: Set<() => void>, done: () => boolean, ms: number) => new Promise<boolean>((resolve) => {
  const finish = (r: boolean) => { clearTimeout(timer); listeners.delete(check); resolve(r); };
  const check = () => { if (done()) finish(true); };
  const timer = setTimeout(() => finish(false), ms);
  listeners.add(check);
  check();
});

// --- roh: fs.watch ohne Chokidar ---------------------------------------------------------------
type Raw = { ok: boolean; line: string };
async function rawStart(delayMs: number): Promise<Raw> {
  const dir = await tmp();
  const listeners = new Set<() => void>();
  const events: string[] = [];
  const t0 = performance.now();
  const w = fsWatch(dir, (type, name) => { events.push(`${Math.round(performance.now() - t0)}ms ${type}:${name}`); listeners.forEach((l) => l()); });
  try {
    if (delayMs) await sleep(delayMs);
    await writeFile(join(dir, "x.md"), "x");
    const ok = await until(listeners, () => events.some((e) => e.endsWith("x.md")), 1500);
    return { ok, line: `raw-start-delay${delayMs} ok=${ok} events=[${events.join(" | ")}]` };
  } finally { w.close(); await rm(dir, { recursive: true, force: true }); }
}
// Watcher ist nachweislich scharf (Probe angekommen); direkt danach wird ein zweiter fs.watch geöffnet und sofort geschrieben.
async function rawChurn(): Promise<Raw> {
  const dir = await tmp();
  const other = await tmp();
  const listeners = new Set<() => void>();
  const events: string[] = [];
  const t0 = performance.now();
  const w = fsWatch(dir, (type, name) => { events.push(`${Math.round(performance.now() - t0)}ms ${type}:${name}`); listeners.forEach((l) => l()); });
  let w2: ReturnType<typeof fsWatch> | undefined;
  try {
    let live = false;
    for (let a = 1; a <= 6 && !live; a++) { await writeFile(join(dir, `probe${a}.md`), "p"); live = await until(listeners, () => events.some((e) => /probe\d\.md$/.test(e)), 500); }
    if (!live) return { ok: false, line: `raw-churn probe-never-live events=[${events.join(" | ")}]` };
    w2 = fsWatch(other, () => {});
    await writeFile(join(dir, "after-churn.md"), "x");
    const ok = await until(listeners, () => events.some((e) => e.endsWith("after-churn.md")), 1500);
    return { ok, line: `raw-churn ok=${ok} events=[${events.join(" | ")}]` };
  } finally { w.close(); w2?.close(); await rm(dir, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }); }
}

// --- Chokidar über watchWorkspace --------------------------------------------------------------
type Run = { mode: string; i: number; ok: boolean; readyMs: number; writeMs: number; addMs: number | null; probes: number; events: string[] };
async function once(mode: "baseline" | "probe", i: number): Promise<Run> {
  const root = await tmp();
  await mkdir(join(root, "nested"));
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const events: string[] = [];
  const listeners = new Set<() => void>();
  const watcher = watchWorkspace(root, (file, kind) => { events.push(`${at()}ms ${kind}:${file}`); listeners.forEach((l) => l()); });
  const has = (v: string) => events.some((e) => e.endsWith(` ${v}`));
  let probes = 0;
  try {
    await new Promise<void>((resolve, reject) => { watcher.once("ready", resolve); watcher.once("error", reject); });
    const readyMs = at();
    if (mode === "probe") {
      let live = false;
      for (let attempt = 1; attempt <= 6 && !live; attempt++) {
        probes = attempt;
        await writeFile(join(root, `nested/Probe-${attempt}.md`), "# Probe\n");
        live = await until(listeners, () => events.some((e) => /add:nested\/Probe-\d+\.md$/.test(e)), 1500);
      }
      if (!live) return { mode, i, ok: false, readyMs, writeMs: at(), addMs: null, probes, events };
    }
    const writeMs = at();
    const path = join(root, "nested/Note.MARKDOWN");
    await writeFile(path, "# First\n");
    let ok = await until(listeners, () => has("add:nested/Note.MARKDOWN"), mode === "probe" ? 5000 : 3000);
    const addMs = ok ? at() : null;
    if (ok && mode === "probe") {
      await writeFile(path, "# Changed\n");
      ok = await until(listeners, () => has("change:nested/Note.MARKDOWN"), 5000);
      if (ok) { await unlink(path); ok = await until(listeners, () => has("unlink:nested/Note.MARKDOWN"), 5000); }
    }
    return { mode, i, ok, readyMs, writeMs, addMs, probes, events };
  } finally {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  }
}
const line = (r: Run) => `${r.mode} #${r.i} ok=${r.ok} ready@${r.readyMs} write@${r.writeMs} add@${r.addMs} probes=${r.probes} events=[${r.events.join(" | ")}]`;
const lat = (runs: Run[]) => { const l = runs.filter((r) => r.addMs !== null).map((r) => r.addMs! - r.writeMs).sort((a, b) => a - b); return `add latency after write min/median/max=${l[0]}/${l[Math.floor(l.length / 2)]}/${l[l.length - 1]}ms`; };

test("repro #284: raw fs.watch, chokidar baseline vs probe", async () => {
  const summary = [`platform=${platform()} arch=${arch()} cpus=${cpus().length} bun=${Bun.version} node=${process.versions.node}`];
  const rawFails: string[] = [];
  for (const [name, fn] of [["raw-start-delay0", () => rawStart(0)], ["raw-start-delay50", () => rawStart(50)], ["raw-churn", () => rawChurn()]] as const) {
    const res: Raw[] = [];
    for (let i = 0; i < 50; i++) res.push(await fn());
    res.filter((r) => !r.ok).forEach((r) => rawFails.push(r.line));
    summary.push(`${name}: ${res.filter((r) => r.ok).length}/${res.length} ok`);
  }
  const baseline: Run[] = [];
  for (let i = 1; i <= 300; i++) baseline.push(await once("baseline", i));
  summary.push(`chokidar baseline (write right after ready, add only): ${baseline.filter((r) => r.ok).length}/${baseline.length} ok, ${lat(baseline)}`);
  const probe: Run[] = [];
  for (let i = 1; i <= 300; i++) probe.push(await once("probe", i));
  summary.push(`chokidar probe fix (add, change, unlink): ${probe.filter((r) => r.ok).length}/${probe.length} ok, ${lat(probe)}; probes needed: ${[1, 2, 3, 4, 5, 6].map((n) => `${n}x=${probe.filter((r) => r.probes === n).length}`).join(" ")}`);

  notice("#284 summary", summary.join("\n"));
  const baseFails = baseline.filter((r) => !r.ok);
  const probeFails = probe.filter((r) => !r.ok);
  if (rawFails.length) notice("#284 raw fs.watch misses (sample)", rawFails.slice(0, 6).join("\n"));
  if (baseFails.length) notice("#284 chokidar baseline misses", baseFails.slice(0, 12).map(line).join("\n"));
  if (probeFails.length) notice("#284 PROBE FIX misses", probeFails.slice(0, 12).map(line).join("\n"));
  notice("#284 sample ok runs", [...baseline.filter((r) => r.ok).slice(0, 2), ...probe.filter((r) => r.ok).slice(0, 3)].map(line).join("\n"));
  // Absichtlich rot: beendet den Job früh; das Protokoll steht in den Annotationen. TEMP.
  expect(true, `TEMP-Messung #284:\n${summary.join("\n")}`).toBe(false);
}, 3000000);
