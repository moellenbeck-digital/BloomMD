// TEMPORARY (Ticket #284): Wiederholungsschleife mit Event-Protokoll. Vor dem Merge entfernen.
import { expect, test } from "bun:test";
import { watch as fsWatch } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, platform, arch, cpus } from "node:os";
import { watchWorkspace } from "./workspace-watcher";

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

// --- roh: fs.watch ohne Chokidar, Schreiben unmittelbar nach dem Aufruf --------------------------
async function rawStart(): Promise<{ ok: boolean; line: string }> {
  const dir = await tmp();
  const listeners = new Set<() => void>();
  const events: string[] = [];
  const t0 = performance.now();
  const w = fsWatch(dir, (type, name) => { events.push(`${Math.round(performance.now() - t0)}ms ${type}:${name}`); listeners.forEach((l) => l()); });
  try {
    await writeFile(join(dir, "x.md"), "x");
    const ok = await until(listeners, () => events.some((e) => e.endsWith("x.md")), 1500);
    return { ok, line: `raw ok=${ok} events=[${events.join(" | ")}]` };
  } finally { w.close(); await rm(dir, { recursive: true, force: true }); }
}

// --- Chokidar über watchWorkspace --------------------------------------------------------------
type Run = { mode: string; i: number; ok: boolean; readyMs: number; writeMs: number; addMs: number | null; probes: number; recovered: string; events: string[] };
async function once(mode: "baseline" | "delay20" | "probe", i: number): Promise<Run> {
  const root = await tmp();
  await mkdir(join(root, "nested"));
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const events: string[] = [];
  const listeners = new Set<() => void>();
  const watcher = watchWorkspace(root, (file, kind) => { events.push(`${at()}ms ${kind}:${file}`); listeners.forEach((l) => l()); });
  const has = (v: string) => events.some((e) => e.endsWith(` ${v}`));
  let probes = 0;
  let recovered = "-";
  try {
    await new Promise<void>((resolve, reject) => { watcher.once("ready", resolve); watcher.once("error", reject); });
    const readyMs = at();
    if (mode === "delay20") await new Promise((r) => setTimeout(r, 20));
    if (mode === "probe") {
      let live = false;
      for (let attempt = 1; attempt <= 6 && !live; attempt++) {
        probes = attempt;
        await writeFile(join(root, `nested/Probe-${attempt}.md`), "# Probe\n");
        live = await until(listeners, () => events.some((e) => /add:nested\/Probe-\d+\.md$/.test(e)), 1500);
      }
      if (!live) return { mode, i, ok: false, readyMs, writeMs: at(), addMs: null, probes, recovered, events };
    }
    const writeMs = at();
    const path = join(root, "nested/Note.MARKDOWN");
    await writeFile(path, "# First\n");
    const ok = await until(listeners, () => has("add:nested/Note.MARKDOWN"), 3000);
    const addMs = ok ? at() : null;
    if (!ok && mode !== "probe") {
      // Erholt sich der Watcher? 1. gleiche Datei erneut schreiben, 2. neue Datei anlegen.
      await writeFile(path, "# Rewritten\n");
      if (await until(listeners, () => has("add:nested/Note.MARKDOWN"), 3000)) recovered = `rewrite@${at()}`;
      else {
        await writeFile(join(root, "nested/Other.md"), "# Other\n");
        recovered = (await until(listeners, () => has("add:nested/Other.md"), 3000)) ? `new-file@${at()}` : "never";
      }
    }
    return { mode, i, ok, readyMs, writeMs, addMs, probes, recovered, events };
  } finally {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  }
}
const line = (r: Run) => `${r.mode} #${r.i} ok=${r.ok} ready@${r.readyMs} write@${r.writeMs} add@${r.addMs} probes=${r.probes} recovered=${r.recovered} events=[${r.events.join(" | ")}]`;
const lat = (runs: Run[]) => { const l = runs.filter((r) => r.addMs !== null).map((r) => r.addMs! - r.writeMs).sort((a, b) => a - b); return `add latency after write min/median/max=${l[0]}/${l[Math.floor(l.length / 2)]}/${l[l.length - 1]}ms`; };

test("repro #284: interleaved baseline / delay20 / probe gating", async () => {
  const summary = [`platform=${platform()} arch=${arch()} cpus=${cpus().length} bun=${Bun.version} node=${process.versions.node}`];
  const raw: Array<{ ok: boolean; line: string }> = [];
  const baseline: Run[] = [];
  const delayed: Run[] = [];
  const probe: Run[] = [];
  // Verschränkt statt nacheinander, damit Reihenfolge/Runner-Aufwärmen die Modi nicht unterschiedlich treffen.
  for (let i = 1; i <= 400; i++) {
    raw.push(await rawStart());
    baseline.push(await once("baseline", i));
    delayed.push(await once("delay20", i));
    probe.push(await once("probe", i));
  }
  summary.push(`raw fs.watch, write right after call: ${raw.filter((r) => r.ok).length}/${raw.length} ok`);
  summary.push(`chokidar baseline (write right after ready, add only): ${baseline.filter((r) => r.ok).length}/${baseline.length} ok, ${lat(baseline)}`);
  summary.push(`chokidar delay20 (20 ms after ready, add only): ${delayed.filter((r) => r.ok).length}/${delayed.length} ok, ${lat(delayed)}`);
  summary.push(`chokidar probe gating, then Note add: ${probe.filter((r) => r.ok).length}/${probe.length} ok; probes needed: ${[1, 2, 3, 4, 5, 6].map((n) => `${n}x=${probe.filter((r) => r.probes === n).length}`).join(" ")}; ${lat(probe)}`);

  notice("#284 summary", summary.join("\n"));
  const baseFails = baseline.filter((r) => !r.ok);
  notice("#284 raw fs.watch misses", raw.filter((r) => !r.ok).slice(0, 6).map((r) => r.line).join("\n") || "none");
  notice("#284 chokidar baseline misses", baseFails.slice(0, 12).map(line).join("\n") || "none");
  notice("#284 chokidar delay20 misses", delayed.filter((r) => !r.ok).slice(0, 12).map(line).join("\n") || "none");
  notice("#284 probe runs that needed >1 probe", probe.filter((r) => r.probes > 1 || !r.ok).slice(0, 12).map(line).join("\n") || "none");
  notice("#284 sample ok runs", [...baseline.filter((r) => r.ok).slice(0, 2), ...probe.filter((r) => r.ok).slice(0, 2)].map(line).join("\n"));
  // Absichtlich rot: beendet den Job früh; das Protokoll steht in den Annotationen. TEMP.
  expect(true, `TEMP-Messung #284:\n${summary.join("\n")}`).toBe(false);
}, 3000000);
