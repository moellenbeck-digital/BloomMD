import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listenForWorkspaceAgentTasks } from "./index";

const CLI = new URL("./cli.ts", import.meta.url).pathname;
const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-agent-cli-"));
  temporaryPaths.push(directory);
  return directory;
}

async function availablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });

  const address = probe.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    throw new Error("Could not determine an available test port");
  }

  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function run(args: string[], configDirectory: string, environment: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      BLOOMMD_AGENT_CONFIG_DIR: configDirectory,
      // The production CLI uses the OS secret store. The file backend exists only for an isolated test process.
      BLOOMMD_AGENT_SECRET_BACKEND: "file",
      ...environment,
    },
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

describe("workspace agent CLI", () => {
  test("reports when the authenticated realtime stream is established", async () => {
    const directory = await temporaryDirectory();
    const pairingCodePath = join(directory, "pairing-code");
    const previousConfigDirectory = process.env.BLOOMMD_AGENT_CONFIG_DIR;
    const previousSecretBackend = process.env.BLOOMMD_AGENT_SECRET_BACKEND;
    await writeFile(pairingCodePath, "bloom_pair_events");
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: await availablePort(),
      fetch: (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/api/agent/v1/pair") {
          return Response.json({
            token: "bloom_agent_abcdefghijklmnopqrstuvwxyz123456",
            agent: {
              id: "agent-1",
              displayName: "Realtime",
              workspaceId: "workspace-1",
            },
          }, { status: 201 });
        }
        if (pathname === "/api/agent/v1/events") {
          expect(request.headers.get("authorization")).toBe(
            "Bearer bloom_agent_abcdefghijklmnopqrstuvwxyz123456",
          );
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("event: connected\\ndata: {}\\n\\n"));
                controller.close();
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        return Response.json({ error: "not found" }, { status: 404 });
      },
    });

    try {
      const serverUrl = server.url.toString().replace(/\/$/, "");
      expect((await run([
        "pair",
        "--server",
        serverUrl,
        "--profile",
        "events",
        "--pairing-code-file",
        pairingCodePath,
      ], directory)).code).toBe(0);
      process.env.BLOOMMD_AGENT_CONFIG_DIR = directory;
      process.env.BLOOMMD_AGENT_SECRET_BACKEND = "file";
      let connected = 0;
      await listenForWorkspaceAgentTasks({
        profile: "events",
        signal: new AbortController().signal,
        onTaskAvailable: () => {
          throw new Error("A connected event must not claim a task.");
        },
        onConnected: () => {
          connected += 1;
        },
      });
      expect(connected).toBe(1);
    } finally {
      if (previousConfigDirectory === undefined)
        delete process.env.BLOOMMD_AGENT_CONFIG_DIR;
      else process.env.BLOOMMD_AGENT_CONFIG_DIR = previousConfigDirectory;
      if (previousSecretBackend === undefined)
        delete process.env.BLOOMMD_AGENT_SECRET_BACKEND;
      else process.env.BLOOMMD_AGENT_SECRET_BACKEND = previousSecretBackend;
      server.stop(true);
    }
  });

  test("pairs, polls its own task and submits a proposal without persisting the token in the profile", async () => {
    const directory = await temporaryDirectory();
    const pairingCodePath = join(directory, "pairing-code");
    const resultPath = join(directory, "result.json");
    await writeFile(pairingCodePath, "bloom_pair_test");
    await writeFile(resultPath, JSON.stringify({
      summary: "Strukturvorschlag erstellt.",
      proposal: { markdown: "# Test\n\nVorschlag", rationale: "Testfall" },
    }));

    let receivedResult: unknown = null;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: await availablePort(),
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/api/agent/v1/pair") {
          expect(await request.json()).toEqual({ pairingCode: "bloom_pair_test" });
          return Response.json({ token: "bloom_agent_abcdefghijklmnopqrstuvwxyz123456", agent: { id: "agent-1", displayName: "Research", workspaceId: "workspace-1" } }, { status: 201 });
        }
        expect(request.headers.get("authorization")).toBe("Bearer bloom_agent_abcdefghijklmnopqrstuvwxyz123456");
        if (url.pathname === "/api/agent/v1/tasks/next") {
          return Response.json({ task: { id: "task-1", command: "Erstelle einen Vorschlag.", document: { filename: "notes/test.md", markdown: "# Test" } } });
        }
        if (url.pathname === "/api/agent/v1/tasks/task-1/result") {
          receivedResult = await request.json();
          return Response.json({ status: "proposed", proposalId: "proposal-1" });
        }
        return Response.json({ error: "not found" }, { status: 404 });
      },
    });

    try {
      const serverUrl = server.url.toString().replace(/\/$/, "");
      const paired = await run(["pair", "--server", serverUrl, "--profile", "research", "--pairing-code-file", pairingCodePath], directory);
      expect(paired.code).toBe(0);
      expect(JSON.parse(paired.stdout)).toMatchObject({ status: "paired", profile: "research", serverUrl });

      const profile = await readFile(join(directory, "research.json"), "utf8");
      expect(profile).not.toContain("bloom_agent_");

      const next = await run(["next", "--profile", "research"], directory);
      expect(next.code).toBe(0);
      expect(JSON.parse(next.stdout)).toMatchObject({ task: { id: "task-1", document: { filename: "notes/test.md" } } });

      const submitted = await run(["result", "--profile", "research", "--task", "task-1", "--input", resultPath], directory);
      expect(submitted.code).toBe(0);
      expect(JSON.parse(submitted.stdout)).toEqual({ status: "proposed", proposalId: "proposal-1" });
      expect(receivedResult).toEqual({ summary: "Strukturvorschlag erstellt.", proposal: { markdown: "# Test\n\nVorschlag", rationale: "Testfall" } });
    } finally {
      server.stop(true);
    }
  });

  test("shows the scoped standalone agent help", async () => {
    const directory = await temporaryDirectory();
    const result = await run(["--help"], directory);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("BloomMD Workspace-Agent");
    expect(result.stdout).toContain("pairing-code-file");
  });

  test("starts OpenClaw only for a claimed task and submits its node proposal", async () => {
    const directory = await temporaryDirectory();
    const pairingCodePath = join(directory, "pairing-code");
    const openClawPath = join(directory, "openclaw-test-agent");
    const invocationPath = join(directory, "openclaw-invoked");
    await writeFile(pairingCodePath, "bloom_pair_runner");
    await writeFile(openClawPath, `#!/bin/sh
printf '%s\\n' "$@" > "${invocationPath}"
message_file=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--message-file" ]; then
    message_file="$2"
    break
  fi
  shift
done
test -n "$message_file"
cat "$(dirname "$message_file")/task.json" > "${invocationPath}.task.json"
printf '%s\\n' '{"status":"ok","summary":"completed","result":{"payloads":[{"text":"{\\"summary\\":\\"Runner proposal created.\\",\\"proposal\\":{\\"markdown\\":\\"Scoped node proposal.\\",\\"rationale\\":\\"Only the selected node was provided.\\"}}"}]}}'
`);
    await chmod(openClawPath, 0o755);

    let resultBody: unknown = null;
    let nextCalls = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: await availablePort(),
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/api/agent/v1/pair") {
          return Response.json({ token: "bloom_agent_abcdefghijklmnopqrstuvwxyz123456", agent: { id: "agent-1", displayName: "Research", workspaceId: "workspace-1" } }, { status: 201 });
        }
        if (url.pathname === "/api/agent/v1/tasks/next") {
          nextCalls += 1;
          if (nextCalls > 1) return new Response(null, { status: 204 });
          return Response.json({ task: { id: "task-runner-1", workspace: { id: "workspace-1", name: "Research" }, command: "Create a proposal.", context: { filename: "notes/test.md", markdown: "Only this node.", version: 1, node: { id: "node-1", title: "Test", path: "Test", content: "Only this node." } } } });
        }
        if (url.pathname === "/api/agent/v1/tasks/task-runner-1/result") {
          resultBody = await request.json();
          return Response.json({ status: "proposed", proposalId: "proposal-runner-1" });
        }
        if (url.pathname === "/api/agent/v1/tasks/task-runner-1/fail") return Response.json({ status: "failed" });
        return Response.json({ error: "not found" }, { status: 404 });
      },
    });

    try {
      const serverUrl = server.url.toString().replace(/\/$/, "");
      expect((await run(["pair", "--server", serverUrl, "--profile", "runner", "--pairing-code-file", pairingCodePath], directory)).code).toBe(0);
      const first = await run(["run", "--profile", "runner", "--openclaw-bin", openClawPath, "--openclaw-agent-id", "research-agent", "--working-directory", directory], directory);
      expect(first.code).toBe(0);
      expect(first.stdout).toContain('"status": "completed"');
      const invocation = await readFile(invocationPath, "utf8");
      expect(invocation).toContain("agent");
      expect(invocation).toContain("--agent");
      expect(invocation).toContain("research-agent");
      expect(invocation).toContain("--session-id");
      expect(invocation).toContain("bloommd-workspace-task-task-runner-1");
      expect(invocation).not.toContain("--local");
      expect(JSON.parse(await readFile(`${invocationPath}.task.json`, "utf8"))).toEqual({
        id: "task-runner-1",
        workspace: { id: "workspace-1", name: "Research" },
        command: "Create a proposal.",
        context: {
          filename: "notes/test.md",
          markdown: "Only this node.",
          version: 1,
          node: {
            id: "node-1",
            title: "Test",
            path: "Test",
            content: "Only this node.",
          },
        },
      });
      expect(resultBody).toEqual({ summary: "Runner proposal created.", proposal: { nodeContent: "Scoped node proposal.", rationale: "Only the selected node was provided." } });

      await rm(invocationPath);
      const idle = await run(["run", "--profile", "runner", "--openclaw-bin", openClawPath, "--working-directory", directory], directory);
      expect(idle.code).toBe(0);
      expect(idle.stdout).toContain('"status": "idle"');
      await expect(readFile(invocationPath, "utf8")).rejects.toThrow();
    } finally {
      server.stop(true);
    }
  });

  test("installs, inspects and removes an idempotent OpenClaw command cron", async () => {
    const directory = await temporaryDirectory();
    const pairingCodePath = join(directory, "pairing-code");
    const openClawPath = join(directory, "openclaw-cron-test");
    const invocationPath = join(directory, "openclaw-cron-invocation");
    await writeFile(pairingCodePath, "bloom_pair_cron");
    await writeFile(openClawPath, `#!/bin/sh
if [ "$1" = "cron" ] && [ "$2" = "list" ]; then
  printf '%s\\n' '{"jobs":[{"id":"cron-job-1","declarationKey":"bloommd:workspace-agent:cron","enabled":false,"schedule":{"kind":"every","everyMs":60000},"state":{"lastRunStatus":"ok"}}]}'
  exit 0
fi
printf '%s\\n' "$@" >> "$OPENCLAW_TEST_LOG"
`);
    await chmod(openClawPath, 0o755);

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: await availablePort(),
      fetch: (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/api/agent/v1/pair") return Response.json({ token: "bloom_agent_abcdefghijklmnopqrstuvwxyz123456", agent: { id: "agent-1", displayName: "Cron", workspaceId: "workspace-1" } }, { status: 201 });
        if (pathname === "/api/agent/v1/status") return Response.json({ agent: { id: "agent-1", displayName: "Cron", workspaceId: "workspace-1" } });
        return Response.json({ error: "not found" }, { status: 404 });
      },
    });

    try {
      const serverUrl = server.url.toString().replace(/\/$/, "");
      expect((await run(["pair", "--server", serverUrl, "--profile", "cron", "--pairing-code-file", pairingCodePath], directory)).code).toBe(0);

      const install = await run(["cron", "install", "--profile", "cron", "--openclaw-bin", openClawPath, "--working-directory", directory, "--interval-seconds", "60"], directory, { OPENCLAW_TEST_LOG: invocationPath });
      expect(install.code).toBe(0);
      expect(JSON.parse(install.stdout)).toMatchObject({ status: "installed", profile: "cron", agent: { id: "agent-1" }, jobId: "cron-job-1", intervalSeconds: 60, declarationKey: "bloommd:workspace-agent:cron" });
      const installArguments = (await readFile(invocationPath, "utf8")).trim().split("\n");
      expect(installArguments.slice(0, 2)).toEqual(["cron", "add"]);
      expect(installArguments).toContain("--command-argv");
      expect(installArguments).toContain("--declaration-key");
      expect(installArguments).toContain("bloommd:workspace-agent:cron");
      const commandArgv = JSON.parse(installArguments[installArguments.indexOf("--command-argv") + 1]!);
      expect(commandArgv.slice(-3)).toEqual(["run", "--profile", "cron"]);
      expect(installArguments.slice(-3)).toEqual(["cron", "enable", "cron-job-1"]);

      const status = await run(["cron", "status", "--profile", "cron", "--openclaw-bin", openClawPath], directory, { OPENCLAW_TEST_LOG: invocationPath });
      expect(status.code).toBe(0);
      expect(JSON.parse(status.stdout)).toMatchObject({ status: "installed", profile: "cron", job: { id: "cron-job-1", enabled: false, intervalSeconds: 60, lastRunStatus: "ok" } });

      const remove = await run(["cron", "remove", "--profile", "cron", "--openclaw-bin", openClawPath], directory, { OPENCLAW_TEST_LOG: invocationPath });
      expect(remove.code).toBe(0);
      expect(JSON.parse(remove.stdout)).toEqual({ status: "removed", profile: "cron", jobId: "cron-job-1" });
      expect((await readFile(invocationPath, "utf8")).trim().split("\n").slice(-3)).toEqual(["cron", "rm", "cron-job-1"]);
    } finally {
      server.stop(true);
    }
  });
});
