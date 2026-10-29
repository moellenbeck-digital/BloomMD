import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_USAGE, AgentUsageError, dueSummary, runAgentCli } from "./agent-cli";
import { knowledgeServerOptions } from "./knowledge-mcp";
import { KnowledgeService } from "./knowledge-service";
import { VaultKnowledgeStore, writeAccessConfig } from "./knowledge-store";

const meta = (json: string) => `<!-- bloommd:meta=${json} -->`;
const NOW = new Date(2026, 9, 10, 8, 0);

async function vault() {
  const root = await mkdtemp(join(tmpdir(), "bloommd-tasks-"));
  await mkdir(join(root, "Arbeit"), { recursive: true });
  await mkdir(join(root, "Schule"), { recursive: true });
  await writeFile(join(root, "Arbeit", "Release.md"), [
    "# Release <!-- bloommd:id=r1 -->",
    "",
    `## iPad-Test <!-- bloommd:id=t1 --> ${meta('{"kind":"task","status":"open","due":"2026-10-03","owner":"Max"}')}`,
    "",
    `## Newsletter <!-- bloommd:id=t2 --> ${meta('{"kind":"task","status":"in_progress","due":"2026-10-20","assignee":"Lea"}')}`,
    "",
    `## Changelog <!-- bloommd:id=t3 --> ${meta('{"kind":"task","status":"done","due":"2026-10-01","assignee":"Max"}')}`,
    "",
    `## Ohne Datum <!-- bloommd:id=t4 --> ${meta('{"kind":"task","assignee":"max"}')}`,
    "",
    "- [ ] Screenshots prüfen",
    "- [x] Folien",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(root, "Schule", "Physik.md"), [
    "# Physik <!-- bloommd:id=p1 -->",
    "",
    `## Referat <!-- bloommd:id=p2 --> ${meta('{"kind":"task","due":"2026-10-03"}')}`,
    "",
    "```",
    "- [ ] kein Task",
    "```",
    "",
  ].join("\n"), "utf8");
  await writeAccessConfig(join(root, ".bloommd"), { access: "write" });
  return { root, service: new KnowledgeService(new VaultKnowledgeStore(root), "Test") };
}

async function cli(args: string[]) {
  const out: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => void out.push(values.join(" "));
  try {
    const code = await runAgentCli(args, "test");
    return { code, out: out.join("\n") };
  } finally {
    console.log = original;
  }
}

describe("KnowledgeService.tasks", () => {
  test("lists the fields, marks overdue ones and sorts by due, then path, then document order", async () => {
    const { service } = await vault();
    const { tasks } = await service.tasks({ now: NOW });
    expect(tasks.map((task) => [task.path, task.title])).toEqual([
      ["Arbeit/Release.md", "iPad-Test"],
      ["Schule/Physik.md", "Referat"],
      ["Arbeit/Release.md", "Newsletter"],
      ["Arbeit/Release.md", "Ohne Datum"],
      ["Arbeit/Release.md", "Screenshots prüfen"],
    ]);
    expect(tasks[0]).toEqual({
      path: "Arbeit/Release.md",
      mapTitle: "Release",
      nodeId: "t1",
      title: "iPad-Test",
      status: "open",
      due: "2026-10-03",
      owner: "Max",
      assignee: "Max",
      overdue: true,
      context: ["Release"],
    });
    expect(tasks.map((task) => task.overdue)).toEqual([true, true, false, false, false]);
    // A checkbox belongs to the heading it stands under and carries none of its fields.
    expect(tasks[4]).toEqual({ path: "Arbeit/Release.md", mapTitle: "Release", nodeId: "t4", title: "Screenshots prüfen", status: "open", overdue: false, context: ["Release", "Ohne Datum"] });
    expect(JSON.stringify((await service.tasks({ now: NOW })).tasks)).toBe(JSON.stringify(tasks));
  });

  test("owner and assignee filter alike: exact and without regard to case", async () => {
    const { service } = await vault();
    const byOwner = await service.tasks({ owner: "MAX", now: NOW });
    const byAssignee = await service.tasks({ assignee: "max", now: NOW });
    expect(byOwner).toEqual(byAssignee);
    expect(byOwner.tasks.map((task) => task.title)).toEqual(["iPad-Test", "Ohne Datum"]);
    expect((await service.tasks({ owner: "Ma", now: NOW })).tasks).toEqual([]);
    expect((await service.tasks({ owner: "Lea", assignee: "lea", now: NOW })).tasks.map((task) => task.title)).toEqual(["Newsletter"]);
    await expect(service.tasks({ owner: "Max", assignee: "Lea" })).rejects.toThrow(/alias of assignee/);
  });

  test("dueBefore means due on or before that day: overdue ones count, tasks without due do not", async () => {
    const { service } = await vault();
    expect((await service.tasks({ dueBefore: "2026-10-03", now: NOW })).tasks.map((task) => task.title)).toEqual(["iPad-Test", "Referat"]);
    expect((await service.tasks({ dueBefore: "2026-10-19", now: NOW })).tasks).toHaveLength(2);
    expect((await service.tasks({ dueBefore: "2026-10-20", now: NOW })).tasks.map((task) => task.title)).toEqual(["iPad-Test", "Referat", "Newsletter"]);
    await expect(service.tasks({ dueBefore: "20.10.2026" })).rejects.toThrow(/YYYY-MM-DD/);
  });

  test("done task nodes only with includeDone, and they are not overdue; the area still narrows", async () => {
    const { service } = await vault();
    const withDone = (await service.tasks({ includeDone: true, now: NOW })).tasks;
    expect(withDone.find((task) => task.title === "Changelog")).toMatchObject({ status: "done", due: "2026-10-01", overdue: false });
    expect((await service.tasks({ area: "Schule", now: NOW })).tasks.map((task) => task.title)).toEqual(["Referat"]);
  });

  test("dueSummary keeps working on the same tasks", async () => {
    const { service } = await vault();
    const text = await dueSummary(service, 0, NOW);
    expect(text).toContain("Überfällig (2):");
    expect(text).toContain("• iPad-Test (Max) – Release, seit 2026-10-03");
    expect(text).toContain("• Referat – Physik, seit 2026-10-03");
    expect(text).not.toContain("Newsletter");
  });
});

describe("bloommd-wiki agent tasks", () => {
  test("prints { tasks } as indented JSON on stdout, exit 0", async () => {
    const { root, service } = await vault();
    const { code, out } = await cli(["tasks", root]);
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { tasks: Array<{ title: string; overdue: boolean }> };
    expect(out).toBe(JSON.stringify({ tasks: (await service.tasks()).tasks }, null, 2));
    expect(parsed.tasks.map((task) => task.title)).toEqual(["iPad-Test", "Referat", "Newsletter", "Ohne Datum", "Screenshots prüfen"]);
    expect(parsed.tasks[0]!.overdue).toBe(true);
  });

  test("--vault names the folder; --owner and --faellig-bis filter", async () => {
    const { root } = await vault();
    const { code, out } = await cli(["tasks", "--vault", root, "--owner", "max", "--faellig-bis", "2026-10-05"]);
    expect(code).toBe(0);
    expect((JSON.parse(out) as { tasks: Array<{ title: string; owner: string }> }).tasks.map((task) => [task.title, task.owner])).toEqual([["iPad-Test", "Max"]]);
  });

  test("no hits is { \"tasks\": [] } with exit 0", async () => {
    const { root } = await vault();
    const { code, out } = await cli(["tasks", root, "--owner", "Niemand"]);
    expect(code).toBe(0);
    expect(out).toBe('{\n  "tasks": []\n}');
  });

  test("an invalid --faellig-bis is an AgentUsageError; so is a missing value, a missing folder and --vault with --cloud", async () => {
    const { root } = await vault();
    for (const bad of ["morgen", "2026-1-5", "2026-02-30", "2026-13-01"]) {
      await expect(runAgentCli(["tasks", root, "--faellig-bis", bad], "test")).rejects.toThrow(AgentUsageError);
    }
    await expect(runAgentCli(["tasks", root, "--faellig-bis", "morgen"], "test")).rejects.toThrow(/YYYY-MM-DD/);
    await expect(runAgentCli(["tasks", root, "--owner"], "test")).rejects.toThrow(/--owner braucht einen Wert/);
    await expect(runAgentCli(["tasks", root, "--owner", "--faellig-bis", "2026-10-01"], "test")).rejects.toThrow(AgentUsageError);
    await expect(runAgentCli(["tasks"], "test")).rejects.toThrow(/Ordner fehlt/);
    await expect(runAgentCli(["tasks", "--vault", root, "--cloud", "https://app.example"], "test")).rejects.toThrow(AgentUsageError);
  });

  test("the command is part of AGENT_USAGE", () => {
    expect(AGENT_USAGE).toContain("agent tasks");
    expect(AGENT_USAGE).toContain("--faellig-bis");
  });
});

describe("bloommd_tasks and the owner alias over MCP", () => {
  test("schema and description name owner and overdue; includeDone and area stay", async () => {
    const { service } = await vault();
    const tool = knowledgeServerOptions({ vault: service }, "test").tools.find((entry) => entry.name === "bloommd_tasks")!;
    const properties = Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties);
    expect(properties).toEqual(expect.arrayContaining(["area", "includeDone", "owner", "assignee", "dueBefore"]));
    expect(tool.description).toContain("owner");
    expect(tool.description).toContain("overdue");
    expect(tool.description).toContain("[ ]");
  });

  test("owner filters like assignee and the result carries owner and overdue", async () => {
    const { service } = await vault();
    const call = knowledgeServerOptions({ vault: service }, "test").call;
    const result = await call("bloommd_tasks", { owner: "lea" }) as { tasks: Array<Record<string, unknown>> };
    expect(result.tasks).toEqual([expect.objectContaining({ title: "Newsletter", owner: "Lea", assignee: "Lea", overdue: true })]);
    expect(await call("bloommd_tasks", { assignee: "LEA" })).toEqual(result);
    await expect(call("bloommd_tasks", { owner: "Lea", assignee: "Max" })).rejects.toThrow(/alias of assignee/);
    await expect(call("bloommd_tasks", { owner: 5 })).rejects.toThrow(/owner/);
  });

  test("bloommd_create_map, bloommd_update_map and bloommd_update_node take owner and store assignee", async () => {
    const { root, service } = await vault();
    const options = knowledgeServerOptions({ vault: service }, "test");
    for (const name of ["bloommd_create_map", "bloommd_update_map", "bloommd_update_node"]) {
      const schema = options.tools.find((entry) => entry.name === name)!.inputSchema as { properties: Record<string, { items?: { properties: Record<string, unknown> } }> };
      const fields = name === "bloommd_update_node" ? schema.properties : schema.properties.nodes!.items!.properties;
      expect(Object.keys(fields)).toContain("owner");
    }
    const created = await options.call("bloommd_create_map", { area: "Arbeit", title: "Alias", nodes: [{ title: "Aufgabe", owner: "Tom", due: "2999-01-01" }] }) as { path: string; ids: Record<string, string> };
    expect(created.path).toBe("Arbeit/Alias.md");
    const written = await readFile(join(root, created.path), "utf8");
    expect(written).toContain('"assignee":"Tom"');
    expect(written).not.toContain('"owner"');
    const nodeId = /^## Aufgabe <!-- bloommd:id=([^ ]+) -->/m.exec(written)![1]!;
    await options.call("bloommd_update_node", { path: created.path, nodeId, owner: "Ida" });
    expect(await readFile(join(root, created.path), "utf8")).toContain('"assignee":"Ida"');
    await expect(options.call("bloommd_update_node", { path: created.path, nodeId, owner: "Ida", assignee: "Tom" })).rejects.toThrow(/alias of assignee/);
    await expect(options.call("bloommd_update_node", { path: created.path, nodeId, owner: "Ida", due: "morgen" })).rejects.toThrow(/YYYY-MM-DD/);
    const tasks = await options.call("bloommd_tasks", { owner: "ida" }) as { tasks: Array<{ title: string; overdue: boolean }> };
    expect(tasks.tasks).toEqual([expect.objectContaining({ title: "Aufgabe", overdue: false })]);
  });
});
