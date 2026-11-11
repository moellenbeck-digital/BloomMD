/**
 * Builds the CMS for production, migrates a throwaway database, starts `next start` and probes the result
 * (spike rest of #204): production build and start under Node, peak memory of the build, the inventory
 * probe against the running service, a signed `/svc/v1` call and the build info in the admin UI.
 *
 *   BLOOMMD_TEST_DATABASE_URL=postgres://user:pw@host:5432/postgres bun run scripts/verify-production.ts
 *
 * The database user needs the right to create databases. The script samples the resident memory of the
 * whole process tree during the build and the start; when the container (cgroup) gets close to its limit
 * it ends the run instead of letting the kernel kill the pod (`CMS_VERIFY_CGROUP_STOP_PERCENT`, default 90).
 * Run it in the pod only through `scripts/team-lauf`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { getCmsBuildInfo } from "../src/lib/build-info";
import { signCall } from "../src/lib/signature";

const adminUrl = process.env.BLOOMMD_TEST_DATABASE_URL;
if (!adminUrl) {
  console.error("BLOOMMD_TEST_DATABASE_URL is required");
  process.exit(2);
}

const port = Number(process.env.CMS_VERIFY_PORT ?? 3399);
const buildHeapMb = process.env.CMS_BUILD_HEAP_MB ?? "4096";
const stopPercent = Number(process.env.CMS_VERIFY_CGROUP_STOP_PERCENT ?? 90);
const dbName = `cms_verify_${Date.now().toString(36)}`;
const dbUrl = (() => {
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
})();
const keyA = randomBytes(32).toString("hex");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  CMS_DATABASE_URL: dbUrl,
  PAYLOAD_SECRET: randomBytes(32).toString("hex"),
  CMS_SVC_APP_KEY: keyA,
  CMS_ADMIN_ORIGIN: "https://cms.verify.invalid",
  CMS_MEDIA_DIR: `/tmp/${dbName}-media`,
  BLOOMMD_RELEASE_VERSION: process.env.BLOOMMD_RELEASE_VERSION ?? "",
  PORT: String(port),
  CMS_BUILD_HEAP_MB: buildHeapMb,
};
delete env.DATABASE_URL;

// ------------------------------------------------------------------ memory sampling
function readNumber(path: string): number | null {
  try {
    const value = readFileSync(path, "utf8").trim();
    return value === "max" ? null : Number(value);
  } catch {
    return null;
  }
}

function treeRssBytes(root: number): number {
  const parents = new Map<number, number>();
  const rss = new Map<number, number>();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      parents.set(Number(name), ppid);
      rss.set(Number(name), Number(readFileSync(`/proc/${name}/statm`, "utf8").split(" ")[1]) * 4096);
    } catch {
      // the process ended between listing and reading
    }
  }
  const members = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of parents) if (!members.has(pid) && members.has(ppid)) members.add(pid), (grew = true);
  }
  return [...members].reduce((sum, pid) => sum + (rss.get(pid) ?? 0), 0);
}

const cgroupMax = readNumber("/sys/fs/cgroup/memory.max");

/** Working set of the container like Kubernetes counts it: usage minus inactive file cache (reclaimable). */
function containerWorkingSet(): number | null {
  const current = readNumber("/sys/fs/cgroup/memory.current");
  if (current === null) return null;
  try {
    const inactive = /^inactive_file (\d+)$/m.exec(readFileSync("/sys/fs/cgroup/memory.stat", "utf8"));
    return current - Number(inactive?.[1] ?? 0);
  } catch {
    return current;
  }
}
interface Peak {
  treeRss: number;
  cgroup: number;
}

function watch(child: ChildProcess, label: string): { peak: Peak; stop: () => void } {
  const peak: Peak = { treeRss: 0, cgroup: 0 };
  const timer = setInterval(() => {
    if (child.pid === undefined) return;
    peak.treeRss = Math.max(peak.treeRss, treeRssBytes(child.pid));
    const current = containerWorkingSet();
    if (current !== null) peak.cgroup = Math.max(peak.cgroup, current);
    if (current !== null && cgroupMax && current > (cgroupMax * stopPercent) / 100) {
      console.error(`ABORT ${label}: container working set ${mb(current)} MB exceeds ${stopPercent}% of ${mb(cgroupMax)} MB, ending the run to protect the pod`);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  }, 500);
  return { peak, stop: () => clearInterval(timer) };
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

function run(command: string, args: string[], label: string): Promise<{ code: number | null; peak: Peak; seconds: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, { env, stdio: ["ignore", "inherit", "inherit"], detached: true });
    const watcher = watch(child, label);
    child.on("exit", (code) => {
      watcher.stop();
      resolve({ code, peak: watcher.peak, seconds: Math.round((Date.now() - started) / 1000) });
    });
  });
}

// ------------------------------------------------------------------ steps
async function sql(statement: string, url = adminUrl!) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

let server: ChildProcess | undefined;
let failed = false;
const fail = (message: string) => {
  failed = true;
  console.error(`FAIL ${message}`);
};

async function waitReady(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/svc/v1/health/ready`);
      if (response.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("the service did not become ready within 120 s");
}

try {
  const nodeVersion = await new Promise<string>((resolve) => {
    const child = spawn("node", ["--version"], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.on("exit", () => resolve(out.trim()));
  });
  console.log(`node ${nodeVersion}; build heap cap ${buildHeapMb} MB; container limit ${cgroupMax ? `${mb(cgroupMax)} MB` : "none"}`);
  await sql(`create database ${dbName}`);

  const build = await run("bun", ["run", "build"], "build");
  console.log(`BUILD exit=${build.code} seconds=${build.seconds} peakTreeRssMB=${mb(build.peak.treeRss)} peakContainerMB=${mb(build.peak.cgroup)}`);
  if (build.code !== 0) throw new Error("the production build failed");

  const migrate = await run("bun", ["run", "migrate"], "migrate");
  if (migrate.code !== 0) throw new Error("the migrations failed");
  env.CMS_OPERATOR_PASSWORD = `Op${randomBytes(9).toString("hex")}1`;
  const operator = await run("bun", ["run", "scripts/operator.ts", "create", "verify@bloommd.invalid", "admin"], "operator");
  if (operator.code !== 0) throw new Error("creating the operator failed");

  server = spawn("bun", ["run", "start"], { env, stdio: ["ignore", "inherit", "inherit"], detached: true });
  const serverWatch = watch(server, "start");
  await waitReady();
  // Warm every kind of route once, then look at the resident memory of `next start`.
  const probe = await run("bun", ["run", "scripts/probe-routes.ts", `http://127.0.0.1:${port}`], "probe");
  if (probe.code !== 0) fail("the inventory probe found deviations");

  // A signed call end to end in the production build: valid signature, unknown account -> invalid_credentials.
  const body = JSON.stringify({ email: "nobody@example.test", password: "Sup3rGeheim123" });
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const signature = signCall(keyA, { method: "POST", pathAndQuery: "/svc/v1/auth/login", body, timestamp, nonce });
  const signed = await fetch(`http://127.0.0.1:${port}/svc/v1/auth/login`, { method: "POST", body, headers: { "x-svc-timestamp": timestamp, "x-svc-nonce": nonce, "x-svc-signature": signature } });
  const signedBody = (await signed.json()) as { error?: string };
  if (signed.status !== 401 || signedBody.error !== "invalid_credentials") fail(`signed login answered ${signed.status} ${JSON.stringify(signedBody)}`);
  const replay = await fetch(`http://127.0.0.1:${port}/svc/v1/auth/login`, { method: "POST", body, headers: { "x-svc-timestamp": timestamp, "x-svc-nonce": nonce, "x-svc-signature": signature } });
  if (replay.status !== 401 || ((await replay.json()) as { error?: string }).error !== "unauthorized") fail("a replayed nonce was not rejected");

  // The build info is visible in the admin UI (login page), not on any public endpoint.
  const page = await (await fetch(`http://127.0.0.1:${port}/admin/login`)).text();
  const expected = getCmsBuildInfo(env).displayVersion;
  if (!page.includes(expected)) fail(`the login page does not show "${expected}"`);

  serverWatch.stop();
  console.log(`START peakTreeRssMB=${mb(serverWatch.peak.treeRss)} peakContainerMB=${mb(serverWatch.peak.cgroup)}`);
  console.log(`SUMMARY node=${nodeVersion} buildSeconds=${build.seconds} buildPeakRssMB=${mb(build.peak.treeRss)} startPeakRssMB=${mb(serverWatch.peak.treeRss)} heapCapMB=${buildHeapMb}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await sql(`drop database if exists ${dbName} with (force)`).catch(() => undefined);
}
process.exit(failed ? 1 : 0);
