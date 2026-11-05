// TEMPORARY (Ticket #284): Wiederholungsschleife mit Event-Protokoll. Vor dem Merge entfernen.
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, platform, arch, cpus } from "node:os";
import { watchWorkspace } from "./workspace-watcher";

type Mode = { name: string; delayMs: number; probe: boolean };
type Run = { mode: string; i: number; ok: boolean; readyMs: number; writeMs: number; addMs: number | null; probes: number; events: string[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const notices: string[] = [];
const escape = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const notice = (title: string, body: string) => { notices.push(title); console.log(`::notice title=${escape(title)}::${escape(body)}`); };

async function once(mode: Mode, i: number): Promise<Run> {
  const root = await mkdtemp(join(tmpdir(), "bloommd-watch-repro-"));
  await mkdir(join(root, "nested"));
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const events: string[] = [];
  const listeners = new Set<() => void>();
  const watcher = watchWorkspace(root, (file, kind) => { events.push(`${at()}ms ${kind}:${file}`); listeners.forEach((l) => l()); });
  const until = (done: () => boolean, ms: number) => new Promise<boolean>((resolve) => {
    const finish = (r: boolean) => { clearTimeout(timer); listeners.delete(check); resolve(r); };
    const check = () => { if (done()) finish(true); };
    const timer = setTimeout(() => finish(false), ms);
    listeners.add(check);
    check();
  });
  const has = (v: string) => events.some((e) => e.endsWith(` ${v}`));
  let probes = 0;
  try {
    await new Promise<void>((resolve, reject) => { watcher.once("ready", resolve); watcher.once("error", reject); });
    const readyMs = at();
    if (mode.delayMs > 0) await sleep(mode.delayMs);
    if (mode.probe) {
      let live = false;
      for (let attempt = 1; attempt <= 6 && !live; attempt++) {
        probes = attempt;
        await writeFile(join(root, `nested/Probe-${attempt}.md`), "# Probe\n");
        live = await until(() => events.some((e) => /add:nested\/Probe-\d+\.md$/.test(e)), 1500);
      }
      if (!live) return { mode: mode.name, i, ok: false, readyMs, writeMs: at(), addMs: null, probes, events };
    }
    const writeMs = at();
    const path = join(root, "nested/Note.MARKDOWN");
    await writeFile(path, "# First\n");
    let ok = await until(() => has("add:nested/Note.MARKDOWN"), mode.probe ? 5000 : 3000);
    const addMs = ok ? at() : null;
    if (ok && mode.probe) {
      await writeFile(path, "# Changed\n");
      ok = await until(() => has("change:nested/Note.MARKDOWN"), 5000);
      if (ok) { await unlink(path); ok = await until(() => has("unlink:nested/Note.MARKDOWN"), 5000); }
    }
    return { mode: mode.name, i, ok, readyMs, writeMs, addMs, probes, events };
  } finally {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  }
}

const line = (r: Run) => `${r.mode} #${r.i} ok=${r.ok} ready@${r.readyMs} write@${r.writeMs} add@${r.addMs} probes=${r.probes} events=[${r.events.join(" | ")}]`;
const stats = (runs: Run[]) => {
  const lat = runs.filter((r) => r.addMs !== null).map((r) => r.addMs! - r.writeMs).sort((a, b) => a - b);
  return `${runs.filter((r) => r.ok).length}/${runs.length} ok, add latency after write min/median/max=${lat[0]}/${lat[Math.floor(lat.length / 2)]}/${lat[lat.length - 1]}ms`;
};

test("repro #284: delay sweep, parallel load, probe fix", async () => {
  const header = `platform=${platform()} arch=${arch()} cpus=${cpus().length} bun=${Bun.version} node=${process.versions.node}`;
  const all: Run[] = [];
  const summary: string[] = [header];

  // 1. Verzögerungsreihe (sequentiell, nur Add): Ausfallquote über Wartezeit nach `ready`.
  for (const delayMs of [0, 2, 5, 10, 20, 50]) {
    const mode: Mode = { name: `seq-delay${delayMs}`, delayMs, probe: false };
    const runs: Run[] = [];
    for (let i = 1; i <= 25; i++) runs.push(await once(mode, i));
    all.push(...runs);
    summary.push(`${mode.name}: ${stats(runs)}`);
  }
  // 2. Parallel (12 Watcher gleichzeitig, mehrere Runden): ohne Verzögerung, mit 50 ms, mit Probe-Fix (vollständiger Ablauf).
  for (const mode of [{ name: "par12-delay0", delayMs: 0, probe: false }, { name: "par12-delay50", delayMs: 50, probe: false }, { name: "par12-probe", delayMs: 0, probe: true }] as Mode[]) {
    const runs: Run[] = [];
    for (let round = 0; round < 3; round++) runs.push(...(await Promise.all(Array.from({ length: 12 }, (_, i) => once(mode, round * 12 + i + 1)))));
    all.push(...runs);
    summary.push(`${mode.name}: ${stats(runs)}`);
  }
  // 3. Probe-Fix sequentiell, vollständiger Ablauf (add, change, unlink), 40 Läufe.
  const fixMode: Mode = { name: "seq-probe", delayMs: 0, probe: true };
  const fixRuns: Run[] = [];
  for (let i = 1; i <= 40; i++) fixRuns.push(await once(fixMode, i));
  all.push(...fixRuns);
  summary.push(`${fixMode.name}: ${stats(fixRuns)}; probes needed: ${[1, 2, 3, 4, 5, 6].map((n) => `${n}x=${fixRuns.filter((r) => r.probes === n).length}`).join(" ")}`);

  notice("#284 summary", summary.join("\n"));
  const missed = all.filter((r) => !r.ok && !r.mode.endsWith("probe"));
  const failedFix = all.filter((r) => !r.ok && r.mode.endsWith("probe"));
  const chunk = (rs: Run[], size: number) => Array.from({ length: Math.ceil(rs.length / size) }, (_, k) => rs.slice(k * size, (k + 1) * size));
  chunk(missed, 25).slice(0, 4).forEach((c, k) => notice(`#284 missed adds ${k + 1}`, c.map(line).join("\n")));
  if (failedFix.length) notice("#284 FIX FAILED", failedFix.slice(0, 20).map(line).join("\n"));
  // Beispielzeilen erfolgreicher Läufe (Event-Reihenfolge und Zeitstempel).
  notice("#284 sample ok runs", all.filter((r) => r.ok).filter((_, k) => k % 40 === 0).slice(0, 8).map(line).join("\n"));
  expect(failedFix.length, `Probe-Fix fehlgeschlagen:\n${summary.join("\n")}`).toBe(0);
}, 900000);
