import { describe, expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { chmod, mkdtemp, truncate, readdir, readFile, symlink, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentLedger, knowledgeVersion, vaultArea, type AgentDocuments, type AgentStateFiles } from "@bloommd/core/agent-ledger";
import { applyKnowledgeNodes } from "@bloommd/core/knowledge";
import { parseFile } from "@bloommd/core/parser";
import { lintWikiBundle } from "@bloommd/core/wiki";
import { createMcpParser } from "./mcp";
import { knowledgeServerOptions } from "./knowledge-mcp";
import { AGENT_USAGE, dueSummary, runAgentCli, staleSummary } from "./agent-cli";
import { KnowledgeService } from "./knowledge-service";
import { CloudKnowledgeStore, nodeStateFiles, safeVaultPath, VaultKnowledgeStore, writeAccessConfig } from "./knowledge-store";

async function vault(access: "read" | "propose" | "write" = "write", areas: Record<string, "read" | "propose" | "write"> = {}) {
  const root = await mkdtemp(join(tmpdir(), "bloommd-knowledge-"));
  await mkdir(join(root, "Schule"), { recursive: true });
  await writeFile(join(root, "Schule", "Physik.md"), "# Physik\n\n## Thermodynamik\n\nWärme und Arbeit.\n", "utf8");
  await writeAccessConfig(join(root, ".bloommd"), { access, areas });
  return { root, service: new KnowledgeService(new VaultKnowledgeStore(root), "OpenClaw") };
}

describe("vault knowledge", () => {
  test("files a meeting from a template into an area, readable by BloomMD", async () => {
    const { root, service } = await vault();
    const result = await service.createMap({
      area: "Arbeit",
      title: "Teammeeting 30.09.",
      template: "meeting",
      source: "Teams-Transkript",
      nodes: [
        { ref: "t1", parent: "themen", title: "Release 0.6", content: "iPad-Beta ist bereit." },
        { parent: "aufgaben", title: "iPad-Test", status: "open", due: "2026-10-03", assignee: "Max", relations: [{ target: "t1", label: "für" }] },
      ],
    });
    expect(result.mode).toBe("written");
    expect(result.path).toBe("Arbeit/Teammeeting 30.09.md");
    const markdown = await readFile(join(root, result.path), "utf8");
    const doc = parseFile(result.path, markdown);
    const titles = [...doc.nodes.values()].map((node) => node.title);
    expect(titles).toEqual(expect.arrayContaining(["Teilnehmende", "Themen", "Release 0.6", "Aufgaben", "iPad-Test"]));
    expect((await service.tasks()).tasks).toEqual([expect.objectContaining({ title: "iPad-Test", due: "2026-10-03", assignee: "Max", path: "Arbeit/Teammeeting 30.09.md" })]);
    const overview = await service.overview();
    expect(overview.areas.map((area) => area.area)).toEqual(["Arbeit", "Schule"]);
  });

  test("a sub-area rule beats its parent area; the parent still governs the rest", async () => {
    const { root, service } = await vault("propose", { Learnings: "read", "Learnings/dev-team": "write" });
    const written = await service.createMap({ area: "Learnings/dev-team", title: "Coder-Regel", nodes: [{ title: "Immer testen" }] });
    expect(written.mode).toBe("written");
    expect(written.path).toBe("Learnings/dev-team/Coder-Regel.md");
    expect(await readFile(join(root, written.path), "utf8")).toContain("Immer testen");
    await expect(service.createMap({ area: "Learnings", title: "Allgemein" })).rejects.toThrow(/may only read in "Learnings"/);
    await expect(service.createMap({ area: "Learnings/andere", title: "Fremd" })).rejects.toThrow(/may only read in "Learnings\/andere"/);
    const proposed = await service.createMap({ area: "Arbeit", title: "Plan" });
    expect(proposed.mode).toBe("proposed");
    const overview = await service.overview();
    expect(overview.areas.find((area) => area.area === "Learnings/dev-team")?.access).toBe("write");
    expect((await service.search("Immer", { area: "Learnings" })).hits.map((hit) => hit.path)).toEqual(["Learnings/dev-team/Coder-Regel.md"]);
  });

  test("a learning from the template gets lint-valid frontmatter; other templates get none", async () => {
    const { root, service } = await vault();
    expect((service.templates("learning") as { area: string; skeleton: Array<{ title: string }> })).toEqual(expect.objectContaining({ id: "learning", area: "Learnings" }));
    expect((service.templates() as { templates: Array<{ id: string }> }).templates.map((template) => template.id)).toContain("learning");
    const created = await service.createMap({
      area: "", title: "Bun-Lockfile", template: "learning", frontmatter: { scope: "BloomMD, coder" }, source: "Ticket #109", tags: ["coder"],
      nodes: [{ parent: "regel", title: "bun install --frozen-lockfile nutzen" }],
    });
    expect(created.path).toBe("Learnings/Bun-Lockfile.md");
    const markdown = await readFile(join(root, created.path), "utf8");
    const frontmatter = markdown.split("\n---\n")[0]!;
    const stale = new Date(); stale.setUTCDate(stale.getUTCDate() + 90);
    expect(frontmatter).toContain('type: "learning"');
    expect(frontmatter).toContain('status: "neu"');
    expect(frontmatter).toContain(`stale_after: "${stale.toISOString().slice(0, 10)}"`);
    expect(frontmatter).toContain('scope: "BloomMD, coder"');
    expect(frontmatter).toContain('source: "Ticket #109"');
    expect(frontmatter).toContain('tags: ["bereich/learnings", "coder"]');
    expect([...parseFile(created.path, markdown).nodes.values()].map((node) => node.title)).toEqual(expect.arrayContaining(["Symptom", "Ursache", "Regel", "Beleg", "Gilt für", "Aufgaben", "bun install --frozen-lockfile nutzen"]));
    // The same file passes the wiki lint (only the missing index.md link is reported).
    const issues = await lintWikiBundle(join(root, "Learnings"));
    expect(issues.filter((issue) => !["unindexed-page", "missing-reserved-file"].includes(issue.code))).toEqual([]);
    // Other templates stay without type/status/stale_after/scope unless the call sets them.
    const meeting = await service.createMap({ area: "Arbeit", title: "Sync", template: "meeting" });
    const meetingMarkdown = await readFile(join(root, meeting.path), "utf8");
    expect(meetingMarkdown).not.toMatch(/^(type|status|stale_after|scope):/m);
  });

  test("updates an existing map by id and refuses stale versions", async () => {
    const { service } = await vault();
    const map = await service.getMap("Schule/Physik.md");
    const thermo = map.nodes.find((node) => node.title === "Thermodynamik")!;
    const result = await service.updateMap({ path: "Schule/Physik.md", version: map.version, nodes: [{ parent: thermo.id, title: "1. Hauptsatz", content: "ΔU = Q + W" }] });
    expect(result.created).toHaveLength(1);
    await expect(service.updateMap({ path: "Schule/Physik.md", version: map.version, nodes: [{ id: thermo.id, content: "x" }] })).rejects.toThrow(/changed since version/);
    expect((await service.search("hauptsatz")).hits.map((hit) => hit.title)).toEqual(["1. Hauptsatz"]);
  });

  test("undo restores the map and removes a created one", async () => {
    const { root, service } = await vault();
    const before = await readFile(join(root, "Schule/Physik.md"), "utf8");
    const update = await service.updateMap({ path: "Schule/Physik.md", nodes: [{ title: "Optik" }] });
    await service.undo(update.changeId!);
    expect(await readFile(join(root, "Schule/Physik.md"), "utf8")).toBe(before);
    const created = await service.createMap({ area: "Gespräche", title: "Gespräch mit Lea" });
    await service.undo(created.changeId!);
    expect(await readdir(join(root, "Gespräche"))).toEqual([]);
    const log = (await service.changes()).changes.map((entry) => entry.event);
    expect(log).toEqual(["undone", "written", "undone", "written"]);
  });

  test("propose mode writes nothing until a person approves", async () => {
    const { root, service } = await vault("write", { Arbeit: "propose" });
    const result = await service.createMap({ area: "Arbeit", title: "Budget", nodes: [{ title: "Q4", decision: "proposed" }] });
    expect(result.mode).toBe("proposed");
    expect(await readdir(root)).not.toContain("Arbeit");
    const [proposal] = await service.proposals();
    expect(proposal?.path).toBe("Arbeit/Budget.md");
    await service.applyProposal(proposal!.id, "Max");
    expect(await readFile(join(root, "Arbeit/Budget.md"), "utf8")).toContain("## Q4");
    expect(await service.proposals()).toEqual([]);
  });

  test("read-only areas and paths outside the vault are refused", async () => {
    const { service } = await vault("read");
    await expect(service.createMap({ area: "Schule", title: "X" })).rejects.toThrow(/may only read/);
    expect(() => safeVaultPath("../etc/passwd.md")).toThrow();
    expect(() => safeVaultPath(".obsidian/app.md")).toThrow();
    expect(() => safeVaultPath("Schule/bild.png")).toThrow();
    expect(safeVaultPath("Schule/./Physik.md")).toBe("Schule/Physik.md");
  });

  test("the agent's tools cannot reach the rights, proposals or log in .bloommd, so it cannot widen its own rights", async () => {
    const { root, service } = await vault("propose");
    expect(() => safeVaultPath(".bloommd/agent.md")).toThrow(/hidden or system folder/);
    // A new map in an area spelled like the state folder lands in an ordinary folder, never inside .bloommd.
    expect((await service.createMap({ area: ".bloommd", title: "agent" })).path.startsWith(".")).toBe(false);
    await expect(service.updateMap({ path: ".bloommd/agent.md", nodes: [{ title: "x" }] })).rejects.toThrow(/hidden or system folder/);
    await expect(service.updateNode({ path: ".bloommd/agent.md", nodeId: "n1", patch: { status: "done" } })).rejects.toThrow(/hidden or system folder/);
    expect(JSON.parse(await readFile(join(root, ".bloommd", "agent.json"), "utf8"))).toMatchObject({ access: "propose" });
  });

  test("an unreadable file (iCloud placeholder) is listed but does not break the scan", async () => {
    const { root, service } = await vault();
    await mkdir(join(root, "Oberstufe"), { recursive: true });
    await writeFile(join(root, "Oberstufe", "Echt.md"), "# Echt\n", "utf8");
    // An evicted iCloud file has a size but no local blocks; a sparse file looks the same.
    await truncate(join(root, "Oberstufe", "Nur in iCloud.md"), 64 * 1024).catch(async () => {
      await writeFile(join(root, "Oberstufe", "Nur in iCloud.md"), "");
      await truncate(join(root, "Oberstufe", "Nur in iCloud.md"), 64 * 1024);
    });
    // A file that cannot be read must not break search either.
    await writeFile(join(root, "Oberstufe", "Gesperrt.md"), "# Echt gesperrt\n", "utf8");
    await chmod(join(root, "Oberstufe", "Gesperrt.md"), 0o000);
    try {
      const overview = await service.overview();
      expect(overview.unavailable).toBe(1);
      expect(overview.maps.find((map) => map.path === "Oberstufe/Nur in iCloud.md")?.available).toBe(false);
      expect((await service.search("echt")).hits.map((hit) => hit.title)).toEqual(["Echt"]);
    } finally {
      await chmod(join(root, "Oberstufe", "Gesperrt.md"), 0o644);
    }
  });

  test("a read that blocks (file still syncing) times out instead of hanging", async () => {
    const root = await mkdtemp(join(tmpdir(), "bloommd-knowledge-"));
    await mkdir(join(root, "Oberstufe"), { recursive: true });
    const pipe = join(root, "Oberstufe", "Blockiert.md");
    // Opening a FIFO for reading blocks until a writer appears, like a file iCloud is syncing.
    execFileSync("mkfifo", [pipe]);
    const store = new VaultKnowledgeStore(root, 200);
    const started = Date.now();
    await expect(store.read("Oberstufe/Blockiert.md")).rejects.toThrow(/did not open within/);
    expect(Date.now() - started).toBeLessThan(2_000);
    await expect(store.read("Oberstufe/Blockiert.md")).rejects.toThrow(/not available right now/);
    // Release the blocked open so the test process can exit.
    await writeFile(pipe, "x");
  });

  test("without a rights file the agent only proposes", async () => {
    const root = await mkdtemp(join(tmpdir(), "bloommd-knowledge-"));
    const service = new KnowledgeService(new VaultKnowledgeStore(root), "OpenClaw");
    expect((await service.createMap({ area: "Schule", title: "Mathe" })).mode).toBe("proposed");
  });
});

describe("due routine", () => {
  test("lists overdue and due tasks, and stays silent when nothing is due", async () => {
    const { service } = await vault();
    const now = new Date(2026, 9, 5, 7, 55);
    expect(await dueSummary(service, 0, now)).toBe("NO_REPLY");
    await service.createMap({ area: "Arbeit", title: "Release", nodes: [
      { title: "iPad-Test", status: "open", due: "2026-10-03", assignee: "Max" },
      { title: "Screenshots", status: "open", due: "2026-10-05" },
      { title: "Newsletter", status: "open", due: "2026-10-09" },
      { title: "Changelog", status: "done", due: "2026-10-01" },
    ] });
    const text = await dueSummary(service, 0, now);
    expect(text).toContain("Überfällig (1):\n• iPad-Test (Max) – Release, seit 2026-10-03");
    expect(text).toContain("Heute fällig (1):\n• Screenshots – Release");
    expect(text).not.toContain("Newsletter");
    expect(await dueSummary(service, 7, now)).toContain("Newsletter");
  });
});

describe("cloud knowledge", () => {
  test("reads, updates with the server version and creates with the area in the file name", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "bloommd-cloud-"));
    await writeAccessConfig(stateDir, { access: "write" });
    const files = new Map<string, { markdown: string; version: number }>([["Arbeit – Projekt X.md", { markdown: "# Projekt X <!-- bloommd:id=root01 -->\n\n## Ziel <!-- bloommd:id=ziel01 -->\n", version: 3 }]]);
    const calls: string[] = [];
    const fakeFetch = (async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push(`${method} ${decodeURIComponent(url.pathname)} ${(init?.headers as Record<string, string>)["X-BloomMD-Workspace-ID"] ?? ""}`);
      if (url.pathname === "/api/mindmaps" && method === "GET") return Response.json({ files: [...files.keys()].map((filename) => ({ filename })) });
      if (url.pathname === "/api/mindmaps" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { filename: string; markdown: string };
        files.set(body.filename, { markdown: body.markdown, version: 1 });
        return Response.json({ ok: true });
      }
      if (url.pathname.endsWith("/share-links") && method === "POST") return Response.json({ url: "https://app.example/share/bloom_share_test", expiresAt: "2026-10-15T00:00:00Z" }, { status: 201 });
      if (url.pathname.endsWith("/nodes") && method === "POST") {
        const name = decodeURIComponent(url.pathname.replace("/api/mindmaps/", "").replace(/\/nodes$/, ""));
        const file = files.get(name)!;
        const { nodes } = JSON.parse(String(init?.body)) as { nodes: Parameters<typeof applyKnowledgeNodes>[1] };
        const change = applyKnowledgeNodes(file.markdown, nodes);
        files.set(name, { markdown: change.markdown, version: file.version + 1 });
        return Response.json({ ids: change.ids, created: change.created, updated: change.updated, version: file.version + 1 });
      }
      const name = decodeURIComponent(url.pathname.replace("/api/mindmaps/", ""));
      const file = files.get(name);
      if (!file) return new Response("missing", { status: 404 });
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body)) as { markdown: string; expectedVersion: number };
        if (body.expectedVersion !== file.version) return new Response("conflict", { status: 409 });
        files.set(name, { markdown: body.markdown, version: file.version + 1 });
        return Response.json({ ok: true });
      }
      const doc = parseFile(name, file.markdown);
      return Response.json({ filePath: doc.filePath, frontmatter: doc.frontmatter, nodes: Object.fromEntries(doc.nodes), rootId: doc.rootId, preamble: doc.preamble ?? "", storage: { version: file.version } });
    }) as typeof fetch;
    const service = new KnowledgeService(new CloudKnowledgeStore({ url: "https://app.example", token: "t", workspaceId: "ws1", stateDir, fetch: fakeFetch }), "OpenClaw");

    const map = await service.getMap("Arbeit – Projekt X.md");
    expect(map.version).toBe("3");
    expect(map.area).toBe("Arbeit");
    await service.updateMap({ path: map.path, version: map.version, nodes: [{ parent: "ziel01", title: "Launch im Oktober" }] });
    expect(files.get("Arbeit – Projekt X.md")?.markdown).toContain("Launch im Oktober");
    expect(files.get("Arbeit – Projekt X.md")?.version).toBe(4);
    const created = await service.createMap({ area: "Arbeit", title: "Kickoff" });
    expect(created.path).toBe("Arbeit – Kickoff.md");
    expect(calls.every((call) => call.endsWith(" ws1"))).toBe(true);
    // Updates use the node API (merged live), never a whole-document PUT.
    expect(calls.some((call) => call.startsWith("POST /api/mindmaps/Arbeit – Projekt X.md/nodes"))).toBe(true);
    expect(calls.some((call) => call.startsWith("PUT "))).toBe(false);
    const link = await service.shareLink("Arbeit – Projekt X.md", 14);
    expect(link.url).toBe("https://app.example/share/bloom_share_test");
  });
});

describe("MCP transport", () => {
  const options = () => knowledgeServerOptions({}, "test");

  test("answers newline-delimited JSON-RPC (MCP stdio) and Content-Length frames", async () => {
    const out: string[] = [];
    const feed = createMcpParser(options(), (text) => out.push(text));
    feed(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`));
    const body = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    feed(Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`));
    await Bun.sleep(10);
    expect(out[0]!.endsWith("\n")).toBe(true);
    expect(JSON.parse(out[0]!).result.protocolVersion).toBe("2025-06-18");
    expect(out[1]!.startsWith("Content-Length:")).toBe(true);
    const tools = JSON.parse(out[1]!.split("\r\n\r\n")[1]!).result.tools.map((tool: { name: string }) => tool.name);
    expect(tools).toContain("bloommd_create_map");
    expect(tools.some((name: string) => /approve|apply/.test(name))).toBe(false);
  });

  test("a real agent mcp process files a note into a vault", async () => {
    const { root } = await vault();
    const child = spawn("bun", [join(import.meta.dir, "cli.ts"), "agent", "mcp", "--vault", root, "--name", "OpenClaw"], { stdio: ["pipe", "pipe", "inherit"] });
    const replies: Array<Record<string, unknown>> = [];
    let pending = "";
    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        replies.push(JSON.parse(pending.slice(0, newline)) as Record<string, unknown>);
        pending = pending.slice(newline + 1);
      }
    });
    const send = (message: Record<string, unknown>) => child.stdin.write(`${JSON.stringify(message)}\n`);
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "bloommd_create_map", arguments: { area: "Schule/Physik", title: "Optik", template: "lesson", nodes: [{ parent: "begriffe", title: "Brechung", content: "Licht ändert die Richtung." }] } } });
    for (let attempt = 0; attempt < 100 && replies.length < 2; attempt += 1) await Bun.sleep(50);
    child.kill();
    const result = replies.find((reply) => reply.id === 2)?.result as { structuredContent: { path: string; mode: string } };
    expect(result.structuredContent).toEqual(expect.objectContaining({ path: "Schule/Physik/Optik.md", mode: "written" }));
    expect(await readFile(join(root, "Schule/Physik/Optik.md"), "utf8")).toContain("### Brechung");
  });
});

describe("review hardening", () => {
  test("area rules hold for any spelling of the folder (case-insensitive APFS)", async () => {
    const { root, service } = await vault("write", { Arbeit: "propose" });
    await mkdir(join(root, "Arbeit"), { recursive: true });
    await writeFile(join(root, "Arbeit", "Plan.md"), "# Plan\n", "utf8");
    const update = await service.updateMap({ path: "arbeit/plan.md", nodes: [{ title: "Neu" }] });
    expect(update.mode).toBe("proposed");
    expect(update.path).toBe("Arbeit/Plan.md");
    const created = await service.createMap({ area: "ARBEIT", title: "Budget" });
    expect(created).toEqual(expect.objectContaining({ mode: "proposed", path: "Arbeit/Budget.md" }));
    // Decomposed umlauts (as macOS file names may use) name the same folder.
    await mkdir(join(root, "Gespräche"), { recursive: true });
    await writeAccessConfig(join(root, ".bloommd"), { access: "write", areas: { "Gespräche": "read" } });
    await expect(service.createMap({ area: "Gespräche".toUpperCase(), title: "Lea" })).rejects.toThrow(/may only read/);
    expect(await readFile(join(root, "Arbeit", "Plan.md"), "utf8")).toBe("# Plan\n");
  });

  test("parallel updates of one map keep every change", async () => {
    const { service } = await vault();
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => service.updateMap({ path: "Schule/Physik.md", nodes: [{ title: `Parallel ${index}` }] })));
    expect(results.every((result) => result.mode === "written")).toBe(true);
    const titles = (await service.getMap("Schule/Physik.md")).nodes.map((node) => node.title);
    for (let index = 0; index < 8; index += 1) expect(titles).toContain(`Parallel ${index}`);
  });

  test("the agent undoes only its own direct writes, within its rights; the owner may undo anything", async () => {
    const { root, service } = await vault("write", { Arbeit: "propose" });
    // An approved proposal cannot be undone by the agent.
    const proposed = await service.createMap({ area: "Arbeit", title: "Budget" });
    const owner = new KnowledgeService(new VaultKnowledgeStore(root), "Owner (CLI)");
    const approved = await owner.applyProposal(proposed.proposalId!, "Max");
    await expect(service.undo(approved.changeId)).rejects.toThrow(/only the owner/);
    // A direct write in an area that became read-only cannot be undone by the agent either.
    const write = await service.updateMap({ path: "Schule/Physik.md", nodes: [{ title: "Optik" }] });
    await writeAccessConfig(join(root, ".bloommd"), { access: "write", areas: { Schule: "read" } });
    await expect(service.undo(write.changeId!)).rejects.toThrow(/may only read/);
    // In a propose area the undo becomes a proposal and changes nothing yet.
    await writeAccessConfig(join(root, ".bloommd"), { access: "write", areas: { Schule: "propose" } });
    const undo = await service.undo(write.changeId!);
    expect(undo).toEqual(expect.objectContaining({ proposed: expect.stringMatching(/^p/) }));
    expect(await readFile(join(root, "Schule/Physik.md"), "utf8")).toContain("Optik");
    // Through MCP, too.
    const call = knowledgeServerOptions({ vault: service }, "test").call;
    await expect(call("bloommd_undo", { changeId: approved.changeId })).rejects.toThrow(/only the owner/);
    // The owner (CLI) undoes the approved change.
    await owner.undo(approved.changeId, { asOwner: true });
    expect(await readdir(join(root, "Arbeit"))).toEqual([]);
  });

  test("symlinks out of the vault are refused", async () => {
    const { root, service } = await vault();
    const outside = await mkdtemp(join(tmpdir(), "bloommd-outside-"));
    await writeFile(join(outside, "Geheim.md"), "# Geheim\n", "utf8");
    await symlink(outside, join(root, "Link"));
    await expect(service.getMap("Link/Geheim.md")).rejects.toThrow(/outside the vault/);
    await expect(service.createMap({ area: "Link", title: "Neu" })).rejects.toThrow(/outside the vault/);
    await symlink(join(outside, "Geheim.md"), join(root, "Schule", "Verlinkt.md"));
    await expect(service.getMap("Schule/Verlinkt.md")).rejects.toThrow(/outside the vault/);
    expect(await readdir(outside)).toEqual(["Geheim.md"]);
  });

  test("structure-breaking content is refused before anything is written", async () => {
    const { root, service } = await vault();
    const before = await readFile(join(root, "Schule/Physik.md"), "utf8");
    const call = knowledgeServerOptions({ vault: service }, "test").call;
    await expect(call("bloommd_update_map", { path: "Schule/Physik.md", nodes: [{ title: "X", content: "# Kopf" }] })).rejects.toThrow(/heading lines/);
    await expect(call("bloommd_update_map", { path: "Schule/Physik.md", nodes: [{ title: "X", kind: "evil" }] })).rejects.toThrow(/kind must be one of/);
    await expect(call("bloommd_create_map", { area: "Schule", title: "A\n# B" })).rejects.toThrow(/single line/);
    expect(await readFile(join(root, "Schule/Physik.md"), "utf8")).toBe(before);
  });

  test("a cloud save while the map is open explains what to do", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "bloommd-cloud-"));
    const fakeFetch = (async (_input: URL | string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "PUT") return Response.json({ error: "busy", code: "SYNC_ROOM_ACTIVE" }, { status: 503 });
      return Response.json({ filePath: "x.md", frontmatter: {}, nodes: {}, rootId: "", storage: { version: 1 } });
    }) as typeof fetch;
    const store = new CloudKnowledgeStore({ url: "https://app.example", token: "t", stateDir, fetch: fakeFetch });
    await expect(store.write("Arbeit – Plan.md", "# Plan\n", "1")).rejects.toThrow(/gerade in BloomMD geöffnet.*open in BloomMD right now/);
  });
});

/** A BloomMD server in memory: the endpoints for rights, proposals and the log of agent tokens. */
function fakeCloud(options: { tokens?: Array<{ tokenId: string; agentName: string; configured?: boolean }> } = {}) {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> | null; workspace: string | null; auth: string | null }> = [];
  const tokens = (options.tokens ?? [{ tokenId: "t1", agentName: "OpenClaw" }]).map((token) => ({ tokenName: `${token.agentName} token`, userEmail: "owner@example.test", scope: "write", rights: { access: "propose", areas: {} }, configured: false, ...token }));
  const state = { proposalResult: 200, mode: "proposed" as "proposed" | "written", denyWith: null as null | { error: string; code: string } };
  const fetcher = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string>;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method, path: `${decodeURIComponent(url.pathname)}${url.search}`, body, workspace: headers["X-BloomMD-Workspace-ID"] ?? null, auth: headers.Authorization ?? null });
    const path = decodeURIComponent(url.pathname);
    if (state.denyWith && method !== "GET") return Response.json(state.denyWith, { status: 403 });
    if (path === "/api/mindmaps" && method === "GET") return Response.json({ files: ["Arbeit – Plan.md", "Learnings › dev-team – Idee.md", "Learnings › andere – Notiz.md"].map((filename) => ({ filename })) });
    if (path === "/api/mindmaps/agent-access/rights") return Response.json({ agent: "OpenClaw", unrestricted: false, rights: { access: "propose", areas: { "Learnings/dev-team": "write", Learnings: "read" } } });
    if (path === "/api/mindmaps/agent-access/changes") return Response.json({ changes: [{ id: "c1", tokenId: "t1", agentName: "OpenClaw", event: "written", origin: "agent", tool: "bloommd_update_map", filename: "Arbeit – Plan.md", area: "Arbeit", proposalId: null, summary: "1 node(s) created", reason: null, source: null, reviewerName: null, undoable: true, undoneAt: null, createdAt: "2026-10-27T08:00:00Z" }] });
    if (path === "/api/mindmaps/agent-access/undo") return Response.json({ undone: body?.changeId, path: "Arbeit – Plan.md" });
    const patched = method === "PATCH" ? path.match(/^\/api\/mindmaps\/Arbeit – Plan\.md\/nodes\/(.+)$/)?.[1] : undefined;
    if (patched === "nope") return Response.json({ error: 'Node "nope" does not exist in this map.', code: "NODE_NOT_FOUND" }, { status: 404 });
    if (patched) {
      return state.mode === "proposed"
        ? Response.json({ mode: "proposed", proposalId: "p2", filename: "Arbeit – Plan.md", area: "Arbeit" }, { status: 202 })
        : Response.json({ ids: { [patched]: patched }, created: [], updated: [patched], version: 6, mode: "written", changeId: "c-node" });
    }
    if (path === "/api/mindmaps/Arbeit – Plan.md/nodes") {
      return state.mode === "proposed"
        ? Response.json({ mode: "proposed", proposalId: "p1", filename: "Arbeit – Plan.md", area: "Arbeit" }, { status: 202 })
        : Response.json({ ids: { t: "n1" }, created: ["n1"], updated: [], version: 6, mode: "written", changeId: "c-new" });
    }
    if (path === "/api/mindmaps/Arbeit – Plan.md") {
      const doc = parseFile("Arbeit – Plan.md", "# Plan <!-- bloommd:id=root01 -->\n\n## Ziel <!-- bloommd:id=ziel01 -->\n");
      return Response.json({ filePath: doc.filePath, frontmatter: doc.frontmatter, nodes: Object.fromEntries(doc.nodes), rootId: doc.rootId, preamble: "", storage: { version: 5 } });
    }
    if (/^\/api\/workspaces\/[^/]+\/agent-rights$/.test(path)) {
      if (method === "PUT") return Response.json({ rights: { access: body?.access, areas: body?.areas } });
      return Response.json({ workspaceId: "ws1", tokens });
    }
    if (/\/agent-token-proposals$/.test(path)) return Response.json({ proposals: [{ id: "p1", tokenId: "t1", agentName: "OpenClaw", tool: "bloommd_update_map", filename: "Arbeit – Plan.md", area: "Arbeit", baseVersion: 5, summary: "1 node(s) created", reason: "Meeting", source: null, status: "pending", reviewerName: null, createdAt: "2026-10-27T08:00:00Z", stale: false, changes: [{ mark: "+", id: "n1", title: "Neu", level: 2 }] }] });
    if (/\/agent-token-proposals\/p1$/.test(path)) return Response.json(body?.action === "approve" ? { applied: "p1", changeId: "c-ap", path: "Arbeit – Plan.md", reviewer: "Olivia Owner" } : { rejected: "p1", reviewer: "Olivia Owner", ...(body?.reason ? { reason: body.reason } : {}) });
    if (/\/agent-log$/.test(path)) return Response.json({ changes: [{ id: "c-ap", tokenId: "t1", agentName: "OpenClaw", event: "approved", origin: "approved", tool: "bloommd_update_map", filename: "Arbeit – Plan.md", area: "Arbeit", proposalId: "p1", summary: "x", reason: null, source: null, reviewerName: "Olivia Owner", undoable: true, undoneAt: null, createdAt: "2026-10-27T09:00:00Z" }] });
    if (/\/agent-log\/c-ap$/.test(path)) return Response.json({ undone: "c-ap", path: "Arbeit – Plan.md" });
    return new Response("missing", { status: 404 });
  }) as typeof fetch;
  return { calls, state, fetcher, tokens };
}

describe("cloud agent rights on the server", () => {
  async function cloudService(fake = fakeCloud()) {
    const stateDir = await mkdtemp(join(tmpdir(), "bloommd-cloud-"));
    const service = new KnowledgeService(new CloudKnowledgeStore({ url: "https://app.example", token: "bloom_pat_x", workspaceId: "ws1", stateDir, fetch: fake.fetcher }), "OpenClaw");
    return { fake, service, stateDir };
  }

  test("the overview shows the server's rights per area and does not read a local agent.json", async () => {
    const { service, stateDir } = await cloudService();
    // An old local file that says "write" must not widen anything.
    await writeAccessConfig(stateDir, { access: "write" });
    const overview = await service.overview();
    expect(overview.defaultAccess).toBe("propose");
    expect(overview.areas).toEqual([
      { area: "Arbeit", maps: 1, access: "propose" },
      { area: "Learnings/andere", maps: 1, access: "read" },
      { area: "Learnings/dev-team", maps: 1, access: "write" },
    ]);
    expect(overview.maps.map((map) => map.path)).toContain("Learnings › dev-team – Idee.md");
  });

  test("a change the server keeps as a proposal comes back as proposed", async () => {
    const { service, fake } = await cloudService();
    const result = await service.updateMap({ path: "Arbeit – Plan.md", nodes: [{ ref: "t", parent: "ziel01", title: "Folien" }], reason: "Meeting" });
    expect(result).toMatchObject({ mode: "proposed", proposalId: "p1", path: "Arbeit – Plan.md" });
    // The agent's words travel with the request; the decision is the server's.
    expect(fake.calls.find((call) => call.path.endsWith("/nodes"))?.body).toMatchObject({ agentMeta: { tool: "bloommd_update_map", reason: "Meeting" } });
    expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
  });

  test("a direct write returns the server's change id; a refusal names the area", async () => {
    const { service, fake } = await cloudService();
    fake.state.mode = "written";
    expect(await service.updateMap({ path: "Arbeit – Plan.md", nodes: [{ ref: "t", parent: "ziel01", title: "Folien" }] })).toMatchObject({ mode: "written", changeId: "c-new", version: "6", created: ["n1"] });
    fake.state.denyWith = { error: 'The agent "OpenClaw" may only read in "Arbeit". Ask the workspace owner to allow proposals or writing there.', code: "AGENT_READ_ONLY" };
    await expect(service.updateMap({ path: "Arbeit – Plan.md", nodes: [{ title: "x" }] })).rejects.toThrow(/may only read in "Arbeit"/);
  });

  test("log and undo of the agent come from the server", async () => {
    const { service, fake } = await cloudService();
    expect((await service.changes(5)).changes).toEqual([expect.objectContaining({ changeId: "c1", agent: "OpenClaw", event: "written", path: "Arbeit – Plan.md", area: "Arbeit", undoable: true })]);
    expect(await service.undo("c1")).toEqual({ undone: "c1", path: "Arbeit – Plan.md" });
    expect(fake.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /api/mindmaps/agent-access/changes?limit=5", "POST /api/mindmaps/agent-access/undo"]);
  });
});

describe("owner CLI for a cloud workspace", () => {
  const url = "https://app.example";
  async function run(fake: ReturnType<typeof fakeCloud>, args: string[], extra: { home?: string; token?: string } = {}) {
    const home = extra.home ?? (await mkdtemp(join(tmpdir(), "bloommd-home-")));
    const original = { fetch: globalThis.fetch, home: process.env.HOME, token: process.env.BLOOMMD_TOKEN, log: console.log, write: process.stderr.write };
    const out: string[] = [];
    const err: string[] = [];
    globalThis.fetch = fake.fetcher;
    process.env.HOME = home;
    process.env.BLOOMMD_TOKEN = extra.token ?? "bloom_pat_owner";
    console.log = (...values: unknown[]) => void out.push(values.join(" "));
    process.stderr.write = ((text: string) => { err.push(String(text)); return true; }) as typeof process.stderr.write;
    try {
      const code = await runAgentCli(args, "test");
      return { code, out: out.join("\n"), err: err.join(""), home, stateDir: join(home, ".bloommd", "agent-cloud", "app.example-ws1") };
    } finally {
      globalThis.fetch = original.fetch;
      if (original.home === undefined) delete process.env.HOME; else process.env.HOME = original.home;
      if (original.token === undefined) delete process.env.BLOOMMD_TOKEN; else process.env.BLOOMMD_TOKEN = original.token;
      console.log = original.log;
      process.stderr.write = original.write;
    }
  }

  test("setup, rights, proposals, approve, reject, log and undo all go to the server, not to a local folder", async () => {
    const fake = fakeCloud();
    const setup = await run(fake, ["setup", "--cloud", url, "--workspace", "ws1", "--access", "propose", "--area", "Learnings/dev-team=write", "--area", "Learnings=read"]);
    expect(JSON.parse(setup.out)).toMatchObject({ ok: true, agent: "OpenClaw", rights: { access: "propose", areas: { "Learnings/dev-team": "write", Learnings: "read" } } });
    expect(fake.calls.at(-1)).toMatchObject({ method: "PUT", path: "/api/workspaces/ws1/agent-rights", auth: "Bearer bloom_pat_owner", body: { tokenId: "t1", access: "propose", areas: { "Learnings/dev-team": "write", Learnings: "read" } } });
    // Nothing was written to this machine.
    await expect(readFile(join(setup.stateDir, "agent.json"), "utf8")).rejects.toThrow();

    expect(JSON.parse((await run(fake, ["rights", "--cloud", url, "--workspace", "ws1"])).out)).toEqual([expect.objectContaining({ agent: "OpenClaw", tokenId: "t1", configured: false, rights: { access: "propose", areas: {} } })]);
    const proposals = JSON.parse((await run(fake, ["proposals", "--cloud", url, "--workspace", "ws1"])).out) as Array<Record<string, unknown>>;
    expect(proposals).toEqual([expect.objectContaining({ id: "p1", agent: "OpenClaw", path: "Arbeit – Plan.md", area: "Arbeit", target: "cloud", changes: [expect.objectContaining({ mark: "+" })] })]);
    expect(proposals[0]).not.toHaveProperty("markdown");

    // The server names the signed-in reviewer; no --reviewer is needed.
    expect(JSON.parse((await run(fake, ["approve", "--cloud", url, "--workspace", "ws1", "p1"])).out)).toMatchObject({ applied: "p1", reviewer: "Olivia Owner" });
    expect(fake.calls.at(-1)).toMatchObject({ method: "POST", path: "/api/workspaces/ws1/agent-token-proposals/p1", body: { action: "approve", overwrite: false } });
    await run(fake, ["approve", "--cloud", url, "--workspace", "ws1", "p1", "--overwrite"]);
    expect(fake.calls.at(-1)?.body).toMatchObject({ overwrite: true });
    expect(JSON.parse((await run(fake, ["reject", "--cloud", url, "--workspace", "ws1", "p1", "--reason", "Zu vage"])).out)).toMatchObject({ rejected: "p1", reason: "Zu vage" });
    expect(fake.calls.at(-1)?.body).toEqual({ action: "reject", reason: "Zu vage" });

    const log = JSON.parse((await run(fake, ["log", "--cloud", url, "--workspace", "ws1", "--limit", "5", "--agent", "OpenClaw"])).out) as { changes: Array<Record<string, unknown>> };
    expect(log.changes[0]).toMatchObject({ event: "approved", reviewer: "Olivia Owner", agent: "OpenClaw" });
    expect(fake.calls.at(-1)?.path).toBe("/api/workspaces/ws1/agent-log?limit=5&tokenId=t1");
    expect(JSON.parse((await run(fake, ["undo", "--cloud", url, "--workspace", "ws1", "c-ap"])).out)).toEqual({ undone: "c-ap", path: "Arbeit – Plan.md" });
  });

  test("without --workspace the personal workspace is meant", async () => {
    const fake = fakeCloud();
    await run(fake, ["rights", "--cloud", url]);
    expect(fake.calls[0]?.path).toBe("/api/workspaces/personal/agent-rights");
  });

  test("with several agent tokens --agent says which; unknown names are listed", async () => {
    const fake = fakeCloud({ tokens: [{ tokenId: "t1", agentName: "OpenClaw" }, { tokenId: "t2", agentName: "Claude" }] });
    await expect(run(fake, ["setup", "--cloud", url, "--workspace", "ws1", "--access", "read"])).rejects.toThrow(/--agent <name\|id> fehlt.*OpenClaw.*Claude/);
    await expect(run(fake, ["setup", "--cloud", url, "--workspace", "ws1", "--access", "read", "--agent", "Nobody"])).rejects.toThrow(/Kein Agent-Token „Nobody“/);
    await run(fake, ["setup", "--cloud", url, "--workspace", "ws1", "--access", "read", "--agent", "claude"]);
    expect(fake.calls.at(-1)?.body).toMatchObject({ tokenId: "t2", access: "read" });
    expect(fake.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });

  test("the server's refusal reaches the owner as it is", async () => {
    const fake = fakeCloud();
    fake.state.denyWith = { error: "Only workspace owners can manage agent rights and proposals.", code: "FORBIDDEN" };
    await expect(run(fake, ["setup", "--cloud", url, "--workspace", "ws1", "--access", "write"])).rejects.toThrow("Only workspace owners can manage agent rights and proposals.");
  });
});

describe("old local rights of a cloud workspace", () => {
  const url = "https://app.example";
  async function legacyHome(rights: unknown = { access: "write", areas: { Arbeit: "propose" } }) {
    const home = await mkdtemp(join(tmpdir(), "bloommd-home-"));
    const stateDir = join(home, ".bloommd", "agent-cloud", "app.example-ws1");
    await mkdir(join(stateDir, "proposals"), { recursive: true });
    await writeFile(join(stateDir, "agent.json"), JSON.stringify(rights), "utf8");
    await writeFile(join(stateDir, "agent-log.jsonl"), `${JSON.stringify({ event: "written" })}\n`, "utf8");
    await writeFile(join(stateDir, "proposals", "p1.json"), "{}", "utf8");
    return { home, stateDir };
  }
  async function run(fake: ReturnType<typeof fakeCloud>, home: string, args: string[]) {
    const original = { fetch: globalThis.fetch, home: process.env.HOME, token: process.env.BLOOMMD_TOKEN, log: console.log, write: process.stderr.write };
    const out: string[] = [];
    const err: string[] = [];
    globalThis.fetch = fake.fetcher;
    process.env.HOME = home;
    process.env.BLOOMMD_TOKEN = "bloom_pat_owner";
    console.log = (...values: unknown[]) => void out.push(values.join(" "));
    process.stderr.write = ((text: string) => { err.push(String(text)); return true; }) as typeof process.stderr.write;
    try {
      const code = await runAgentCli(args, "test");
      return { code, out: out.join("\n"), err: err.join("") };
    } finally {
      globalThis.fetch = original.fetch;
      if (original.home === undefined) delete process.env.HOME; else process.env.HOME = original.home;
      if (original.token === undefined) delete process.env.BLOOMMD_TOKEN; else process.env.BLOOMMD_TOKEN = original.token;
      console.log = original.log;
      process.stderr.write = original.write;
    }
  }
  const target = ["--cloud", url, "--workspace", "ws1"];

  test("the first start announces them once and widens nothing; old data stays", async () => {
    const { home, stateDir } = await legacyHome();
    const fake = fakeCloud();
    const first = await run(fake, home, ["rights", ...target]);
    expect(first.err).toContain("lokale Agent-Rechte");
    expect(first.err).toContain("Standard write, Bereiche: Arbeit=propose");
    expect(first.err).toContain("NICHT stillschweigend übernommen");
    expect(first.err).toContain("1 offene Vorschläge");
    expect(first.err).toContain("nicht gelöscht");
    expect(first.err).toContain(`agent migrate --cloud ${url} --workspace ws1 --agent <name> --apply`);
    // The server's right is what counts: the agent still only proposes.
    expect(JSON.parse(first.out)[0].rights).toEqual({ access: "propose", areas: {} });
    expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
    const second = await run(fake, home, ["rights", ...target]);
    expect(second.err).toBe("");
    expect(JSON.parse(await readFile(join(stateDir, "cloud-migration.json"), "utf8"))).toMatchObject({ decision: "announced" });
    expect(await readdir(join(stateDir, "proposals"))).toEqual(["p1.json"]);
  });

  test("migrate without a flag changes nothing; --apply sets exactly the old local rights", async () => {
    const { home, stateDir } = await legacyHome({ access: "propose", areas: { "Learnings/dev-team": "write", Arbeit: "read" } });
    const fake = fakeCloud();
    const plan = await run(fake, home, ["migrate", ...target, "--agent", "OpenClaw"]);
    expect(plan.out).toContain("Noch nichts geändert");
    expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
    const applied = await run(fake, home, ["migrate", ...target, "--agent", "OpenClaw", "--apply"]);
    expect(fake.calls.at(-1)).toMatchObject({ method: "PUT", body: { tokenId: "t1", access: "propose", areas: { "Learnings/dev-team": "write", Arbeit: "read" } } });
    expect(applied.out).toContain("höchstens die bisherigen lokalen Rechte");
    expect(JSON.parse(await readFile(join(stateDir, "cloud-migration.json"), "utf8"))).toMatchObject({ decision: "migrated", agent: "OpenClaw" });
    expect(await readFile(join(stateDir, "agent.json"), "utf8")).toContain("Learnings/dev-team");
    expect(await readFile(join(stateDir, "agent-log.jsonl"), "utf8")).toContain("written");
    // Decided once: a second call neither asks nor writes.
    const again = await run(fake, home, ["migrate", ...target, "--agent", "OpenClaw", "--apply"]);
    expect(again.out).toContain("Schon entschieden");
    expect(fake.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });

  test("rights the owner set on the server are never overwritten by old local ones", async () => {
    const { home, stateDir } = await legacyHome({ access: "write" });
    const fake = fakeCloud({ tokens: [{ tokenId: "t1", agentName: "OpenClaw", configured: true }] });
    fake.tokens[0]!.rights = { access: "read", areas: {} };
    await expect(run(fake, home, ["migrate", ...target, "--agent", "OpenClaw", "--apply"])).rejects.toThrow(/schon Rechte gesetzt.*nicht überschrieben/);
    expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
    expect(await readMigrationMarkerDecision(stateDir)).not.toBe("migrated");
  });

  test("--discard keeps the server's rights and records the decision; nothing is deleted", async () => {
    const { home, stateDir } = await legacyHome();
    const fake = fakeCloud();
    const discarded = await run(fake, home, ["migrate", ...target, "--discard"]);
    expect(discarded.out).toContain("Verworfen");
    expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
    expect(await readMigrationMarkerDecision(stateDir)).toBe("discarded");
    expect(await readdir(stateDir).then((names) => names.sort())).toEqual(["agent-log.jsonl", "agent.json", "cloud-migration.json", "proposals"]);
    expect(await run(fake, home, ["rights", ...target]).then((result) => result.err)).toBe("");
  });

  test("a vault is unaffected and without old files there is nothing to announce", async () => {
    const home = await mkdtemp(join(tmpdir(), "bloommd-home-"));
    const fake = fakeCloud();
    expect((await run(fake, home, ["rights", ...target])).err).toBe("");
    expect((await run(fake, home, ["migrate", ...target, "--apply"])).out).toContain("Nichts zu übernehmen");
    await expect(run(fake, home, ["migrate", "--apply"])).rejects.toThrow(/nur für --cloud/);
  });
});

async function readMigrationMarkerDecision(stateDir: string): Promise<string | null> {
  return readFile(join(stateDir, "cloud-migration.json"), "utf8").then((text) => (JSON.parse(text) as { decision: string }).decision, () => null);
}

describe("MCP transport robustness", () => {
  const options = () => knowledgeServerOptions({}, "test");

  test("non-object messages get Invalid Request and the server keeps answering", async () => {
    const out: string[] = [];
    const feed = createMcpParser(options(), (text) => out.push(text));
    feed(Buffer.from("null\n[1,2]\n42\n\"x\"\n{\"jsonrpc\":\"2.0\",\"id\":7}\n"));
    feed(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "bloommd_overview", arguments: [] } })}\n`));
    feed(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })}\n`));
    await Bun.sleep(10);
    const replies = out.map((line) => JSON.parse(line) as { id: unknown; error?: { code: number }; result?: { isError?: boolean } });
    expect(replies.slice(0, 5).map((reply) => reply.error?.code)).toEqual([-32600, -32600, -32600, -32600, -32600]);
    expect(replies[4]?.id).toBe(7);
    expect(replies.find((reply) => reply.id === 8)?.result?.isError).toBe(true);
    expect(replies.find((reply) => reply.id === 9)?.result).toEqual({});
  });

  test("a failing handler answers with an internal error instead of crashing", async () => {
    const out: string[] = [];
    const pending = new Set<Promise<void>>();
    const broken = { ...options(), tools: [], instructions: undefined, get name(): string { throw new Error("boom"); } };
    const feed = createMcpParser(broken, (text) => out.push(text), pending);
    feed(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })}\n`));
    await Promise.allSettled([...pending]);
    await Bun.sleep(5);
    expect(JSON.parse(out[0]!)).toEqual({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Internal error" } });
  });

  test("oversized frames are dropped with an error; later messages still work", async () => {
    const out: string[] = [];
    const feed = createMcpParser(options(), (text) => out.push(text), new Set(), 1024);
    const big = `{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":"${"a".repeat(3000)}"}}\n`;
    for (let index = 0; index < big.length; index += 100) feed(Buffer.from(big.slice(index, index + 100)));
    const body = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping", params: { x: "a".repeat(3000) } });
    feed(Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`));
    feed(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" })}\n`));
    await Bun.sleep(10);
    const replies = out.map((text) => JSON.parse(text.includes("\r\n\r\n") ? text.split("\r\n\r\n")[1]! : text) as { id: unknown; error?: { code: number } });
    expect(replies.map((reply) => [reply.id, reply.error?.code])).toEqual([[null, -32600], [null, -32600], [3, undefined]]);
  });
});

/** The Obsidian plugin's view of a vault: state and notes in memory, same AgentLedger rules. */
function pluginTarget(notes: Map<string, string>) {
  const state = new Map<string, string>();
  const files: AgentStateFiles = {
    read: async (name) => state.get(name) ?? null,
    write: async (name, text) => void state.set(name, text),
    append: async (name, text) => void state.set(name, (state.get(name) ?? "") + text),
    remove: async (name) => void state.delete(name),
    list: async (dir) => [...state.keys()].filter((name) => name.startsWith(`${dir}/`)).map((name) => name.slice(dir.length + 1)),
  };
  const documents: AgentDocuments = {
    read: async (path) => (notes.has(path) ? { path, markdown: notes.get(path)!, version: knowledgeVersion(notes.get(path)!) } : null),
    write: async (path, markdown, expected) => {
      const current = notes.get(path);
      if (expected === null ? current !== undefined : current === undefined || knowledgeVersion(current) !== expected) throw new Error("conflict");
      notes.set(path, markdown);
      return { version: knowledgeVersion(markdown) };
    },
    remove: async (path) => void notes.delete(path),
  };
  return { state, files, documents };
}

/** Log lines and history without ids and times, which differ between runs. */
const stable = (value: unknown) => JSON.parse(JSON.stringify(value, (key, entry) => (["at", "changeId", "proposalId", "id"].includes(key) ? "*" : entry)));

describe("CLI and Obsidian plugin share one set of rules", () => {
  test("approving, rejecting and undoing produce the same notes, history and log", async () => {
    const { root, service } = await vault("propose");
    // The agent proposes twice through the CLI's KnowledgeService.
    await service.updateMap({ path: "Schule/Physik.md", nodes: [{ title: "Optik", content: "Licht." }], reason: "Unterricht" });
    await service.createMap({ area: "Arbeit", title: "Budget" });
    const proposals = await service.proposals();
    const original = await readFile(join(root, "Schule/Physik.md"), "utf8");
    // The plugin gets the same proposals and the same note.
    const notes = new Map([["Schule/Physik.md", original]]);
    const plugin = pluginTarget(notes);
    for (const proposal of proposals) await plugin.files.write(`proposals/${proposal.id}.json`, `${JSON.stringify(proposal, null, 2)}\n`);
    const pluginLedger = new AgentLedger(plugin.files, "Owner (CLI)", "vault");
    const owner = new KnowledgeService(new VaultKnowledgeStore(root), "Owner (CLI)");
    const logBefore = (await owner.changes(50)).changes.length;

    const viaCli = await owner.applyProposal(proposals[0]!.id, "Max");
    const viaPlugin = await pluginLedger.applyProposal(proposals[0]!, "Max", plugin.documents);
    expect(notes.get("Schule/Physik.md")).toBe(await readFile(join(root, "Schule/Physik.md"), "utf8"));
    expect(stable(viaPlugin)).toEqual(stable(viaCli));
    await owner.rejectProposal(proposals[1]!.id, "Max", "später");
    await pluginLedger.rejectProposal(proposals[1]!.id, "Max", "später");
    await owner.undo(viaCli.changeId, { asOwner: true });
    await pluginLedger.undo(viaPlugin.changeId, plugin.documents, { asOwner: true, areaOf: vaultArea });
    expect(notes.get("Schule/Physik.md")).toBe(original);
    expect(await readFile(join(root, "Schule/Physik.md"), "utf8")).toBe(original);
    const cliLog = (await owner.changes(50)).changes.slice(0, -logBefore);
    expect(stable(await pluginLedger.changes(50))).toEqual(stable(cliLog));
    expect(await pluginLedger.proposals()).toEqual(await owner.proposals());
  });
});

describe("requests from map nodes", () => {
  test("the agent lists open requests and answers them within its rights", async () => {
    const { root, service } = await vault("write", { Arbeit: "propose" });
    const owner = new AgentLedger(nodeStateFiles(join(root, ".bloommd")), "Max", "vault");
    const map = await service.getMap("Schule/Physik.md");
    const thermo = map.nodes.find((node) => node.title === "Thermodynamik")!;
    const request = await owner.createRequest({ path: "Schule/Physik.md", nodeId: thermo.id, nodeTitle: "Thermodynamik", question: "Ergänze den 1. Hauptsatz" });
    const call = knowledgeServerOptions({ vault: service }, "test").call;
    const open = (await call("bloommd_requests", {})) as { requests: Array<{ id: string; nodeId: string; question: string }> };
    expect(open.requests).toEqual([expect.objectContaining({ id: request.id, nodeId: thermo.id, question: "Ergänze den 1. Hauptsatz" })]);
    const answered = (await call("bloommd_answer_request", { id: request.id, answer: "Ergänzt.", nodes: [{ parent: thermo.id, title: "1. Hauptsatz", content: "ΔU = Q + W" }] })) as { request: { status: string; changeId?: string }; change: { mode: string } };
    expect(answered.change.mode).toBe("written");
    expect(answered.request).toEqual(expect.objectContaining({ status: "answered", changeId: expect.stringMatching(/^c/) }));
    expect(await readFile(join(root, "Schule/Physik.md"), "utf8")).toContain("1. Hauptsatz");
    expect((await call("bloommd_requests", {})) as { requests: unknown[] }).toEqual({ requests: [] });
    expect(((await call("bloommd_requests", { includeDone: true })) as { requests: unknown[] }).requests).toHaveLength(1);

    // In a propose area the nodes become a proposal; a failed request records why.
    await writeFile(join(root, "Arbeit.md"), "# Arbeit\n", "utf8");
    await mkdir(join(root, "Arbeit"), { recursive: true });
    await writeFile(join(root, "Arbeit", "Plan.md"), "# Plan\n", "utf8");
    const work = await owner.createRequest({ path: "Arbeit/Plan.md", question: "Aufgaben ergänzen" });
    const proposed = (await call("bloommd_answer_request", { id: work.id, answer: "Vorschlag liegt bereit.", nodes: [{ title: "Aufgabe", status: "open" }] })) as { request: { proposalId?: string } };
    expect(proposed.request.proposalId).toMatch(/^p/);
    expect(await readFile(join(root, "Arbeit", "Plan.md"), "utf8")).toBe("# Plan\n");
    const failed = await owner.createRequest({ path: "Arbeit/Plan.md", question: "?" });
    expect(((await call("bloommd_answer_request", { id: failed.id, answer: "Unklar", failed: true })) as { request: { status: string } }).request.status).toBe("failed");
    await expect(call("bloommd_answer_request", { id: "rnope", answer: "x" })).rejects.toThrow(/not found/);
  });
});

const NOW = new Date("2026-10-27T08:00:00Z");

/** A vault with learnings in every state the search has to tell apart. */
async function learnings() {
  const { root, service } = await vault();
  await mkdir(join(root, "Learnings"), { recursive: true });
  const note = (name: string, fields: string[], body: string) => writeFile(join(root, "Learnings", `${name}.md`), `---\ntitle: "${name}"\n${fields.join("\n")}\n---\n\n# ${name}\n\n## Regel\n\n${body}\n`, "utf8");
  await note("Bun-Lockfile", ['status: "neu"', 'scope: "BloomMD, coder"', "created: 2026-10-01", 'stale_after: "2027-01-01"', 'tags: ["bereich/learnings", "coder"]'], "Lockfile nur mit festgelegter Version erzeugen.");
  await note("Alt-Learning", ['status: "bestätigt"', 'scope: "BloomMD, tester"', "created: 2026-06-01", 'stale_after: "2026-10-01"', 'tags: ["tester"]', "verified:", "  - by: Max", "    at: 2026-09-15"], "Lockfile prüfen.");
  await note("Ersetzt-Learning", ['status: "ersetzt"', 'replaced_by: "Learnings/Bun-Lockfile.md"', 'scope: "BloomMD, coder"', 'stale_after: "2027-02-01"', 'tags: ["coder"]'], "Lockfile alt.");
  await note("Veraltet-Learning", ['status: "veraltet"', 'tags: ["coder"]'], "Lockfile veraltet.");
  await note("Heute-Learning", ['status: "neu"', 'stale_after: "2026-10-27"', 'tags: ["architect"]'], "Läuft heute ab.");
  await note("Bald-Learning", ['status: "neu"', 'scope: "BloomMD, Wiki-CLI"', 'stale_after: "2026-11-03"', 'tags: ["coder"]'], "Läuft nächste Woche ab.");
  await writeFile(join(root, "Learnings", "Ohne-Felder.md"), "# Ohne-Felder\n\n## Notiz\n\nLockfile erwähnt.\n", "utf8");
  return { root, service };
}

const paths = (hits: Array<{ path: string }>) => [...new Set(hits.map((hit) => hit.path.replace("Learnings/", "").replace(".md", "")))].sort();

describe("trust fields through the knowledge service", () => {
  test("create_map writes the fields; given values override the learning template, others keep its defaults", async () => {
    const { root, service } = await vault();
    const defaults = await service.createMap({ area: "", title: "Standard", template: "learning" });
    expect(await readFile(join(root, defaults.path), "utf8")).toContain('status: "neu"');
    expect(defaults.frontmatter).toBeUndefined();
    const created = await service.createMap({
      area: "", title: "Überschrieben", template: "learning",
      frontmatter: { status: "bestätigt", stale_after: "2027-06-30", scope: "BloomMD, tester", verified: { by: "Max", at: "2026-10-27" } },
    });
    expect(created.frontmatter).toEqual(["status", "stale_after", "scope", "verified"]);
    const markdown = await readFile(join(root, created.path), "utf8");
    const data = parseFile(created.path, markdown).frontmatter as unknown as Record<string, unknown>;
    expect(data).toEqual(expect.objectContaining({ type: "learning", status: "bestätigt", stale_after: "2027-06-30", scope: "BloomMD, tester", verified: [{ by: "Max", at: "2026-10-27" }] }));
    expect(markdown.match(/^status:/gm)).toHaveLength(1);
    expect(markdown.match(/^stale_after:/gm)).toHaveLength(1);
    // A map without a template gets exactly the fields it was given.
    const plain = await service.createMap({ area: "Arbeit", title: "Alt", frontmatter: { status: "ersetzt", replaced_by: "Arbeit/Neu.md" } });
    const plainMarkdown = await readFile(join(root, plain.path), "utf8");
    expect(plainMarkdown).toContain('status: "ersetzt"');
    expect(plainMarkdown).toContain('replaced_by: "Arbeit/Neu.md"');
    expect(plainMarkdown).not.toMatch(/^(type|stale_after|scope|verified):/m);
    expect(await service.createMap({ area: "Arbeit", title: "Ohne" }).then((result) => result.frontmatter)).toBeUndefined();
  });

  test("update_map changes only the fields given, keeps the rest byte for byte, and can be undone", async () => {
    const { root, service } = await vault();
    const created = await service.createMap({ area: "Learnings", title: "Regel", template: "learning", frontmatter: { scope: "BloomMD, coder" }, source: "Ticket #110", nodes: [{ parent: "regel", title: "Tue es", content: "Details" }] });
    const before = await readFile(join(root, created.path), "utf8");
    const read = await service.getMap(created.path);
    const result = await service.updateMap({ path: created.path, version: read.version, frontmatter: { status: "bestätigt", stale_after: "2027-03-01", verified: { by: "Max", at: "2026-10-27" } }, reason: "Zweiter Beleg" });
    expect(result).toEqual(expect.objectContaining({ mode: "written", created: [], updated: [], frontmatter: ["status", "stale_after", "verified"] }));
    expect(result.version).not.toBe(read.version);
    const after = await readFile(join(root, created.path), "utf8");
    const staleBefore = /^stale_after: ".*"$/m.exec(before)![0];
    expect(after).toBe(before
      .replace('status: "neu"', 'status: "bestätigt"')
      .replace(staleBefore, 'stale_after: "2027-03-01"')
      .replace(/\n---\n/, '\nverified:\n  - by: "Max"\n    at: "2026-10-27"\n---\n'));
    // A second sign-off is appended to the list.
    const second = await service.updateMap({ path: created.path, frontmatter: { verified: { by: "Anna", at: "2026-10-28" } } });
    expect(parseFile(created.path, await readFile(join(root, created.path), "utf8")).frontmatter).toEqual(expect.objectContaining({ verified: [{ by: "Max", at: "2026-10-27" }, { by: "Anna", at: "2026-10-28" }] }));
    // Log and undo work like for node changes.
    expect((await service.changes()).changes[0]).toEqual(expect.objectContaining({ tool: "bloommd_update_map", path: created.path }));
    await service.undo(second.changeId!);
    await service.undo(result.changeId!);
    expect(await readFile(join(root, created.path), "utf8")).toBe(before);
  });

  test("nodes and fields in one call; a map without ids is not touched when only fields change", async () => {
    const { root, service } = await vault();
    const raw = "# Physik\n\n## Optik\n\nLicht.\n";
    await writeFile(join(root, "Schule", "Roh.md"), raw, "utf8");
    await service.updateMap({ path: "Schule/Roh.md", frontmatter: { status: "neu" } });
    expect(await readFile(join(root, "Schule", "Roh.md"), "utf8")).toBe(`---\nstatus: "neu"\n---\n${raw}`);
    const both = await service.updateMap({ path: "Schule/Roh.md", nodes: [{ title: "Neu", content: "x" }], frontmatter: { scope: "Physik" } });
    expect(both.created).toHaveLength(1);
    expect(both.frontmatter).toEqual(["scope"]);
    expect(await readFile(join(root, "Schule", "Roh.md"), "utf8")).toContain('scope: "Physik"');
  });

  test("invalid input writes nothing; neither nodes nor fields is refused", async () => {
    const { root, service } = await vault();
    const before = await readFile(join(root, "Schule", "Physik.md"), "utf8");
    await expect(service.updateMap({ path: "Schule/Physik.md" })).rejects.toThrow(/nodes or at least one of status/);
    await writeFile(join(root, "Schule", "Kaputt.md"), "---\nverified: Max\n---\n# K\n", "utf8");
    await expect(service.updateMap({ path: "Schule/Kaputt.md", frontmatter: { verified: { by: "A", at: "2026-10-27" } } })).rejects.toThrow(/not a list/);
    expect(await readFile(join(root, "Schule", "Physik.md"), "utf8")).toBe(before);
    expect(await readFile(join(root, "Schule", "Kaputt.md"), "utf8")).toBe("---\nverified: Max\n---\n# K\n");
  });

  test("in a propose area the field change becomes a proposal and the file stays as it is", async () => {
    const { root, service } = await vault("propose");
    const before = await readFile(join(root, "Schule", "Physik.md"), "utf8");
    const result = await service.updateMap({ path: "Schule/Physik.md", frontmatter: { status: "veraltet" } });
    expect(result.mode).toBe("proposed");
    expect(result.frontmatter).toEqual(["status"]);
    expect(await readFile(join(root, "Schule", "Physik.md"), "utf8")).toBe(before);
    await service.applyProposal(result.proposalId!, "Max");
    expect(await readFile(join(root, "Schule", "Physik.md"), "utf8")).toContain('status: "veraltet"');
  });
});

describe("search with frontmatter, filters and expiry", () => {
  test("finds tags and frontmatter values with their own hit kind, and shows status, expiry and age", async () => {
    const { service } = await learnings();
    const byTag = await service.search("tester", { now: NOW, includeStale: true });
    expect(byTag.hits).toEqual([expect.objectContaining({ path: "Learnings/Alt-Learning.md", nodeId: "", kind: "frontmatter", field: "tags", snippet: "tags: tester", status: "bestätigt", stale_after: "2026-10-01", expired: true, ageDays: 148 })]);
    const byScope = await service.search("wiki-cli", { now: NOW });
    expect(byScope.hits).toEqual([expect.objectContaining({ path: "Learnings/Bald-Learning.md", kind: "frontmatter", field: "scope", expired: false })]);
    const byStatus = await service.search("neu", { now: NOW });
    expect(paths(byStatus.hits)).toEqual(["Bald-Learning", "Bun-Lockfile", "Heute-Learning"]);
    // Node hits keep their shape and carry the trust fields of their map.
    const node = (await service.search("festgelegter version", { now: NOW })).hits;
    expect(node).toEqual([expect.objectContaining({ path: "Learnings/Bun-Lockfile.md", kind: "node", title: "Regel", status: "neu", stale_after: "2027-01-01", expired: false, ageDays: 26 })]);
    expect(node[0]!.nodeId).not.toBe("");
    // Age counts from the last verification when there is no `created`.
    const verified = await service.search("lockfile prüfen", { now: NOW, includeStale: true });
    expect(verified.hits[0]).toEqual(expect.objectContaining({ ageDays: 148 }));
  });

  test("hits of a map without these fields stay as before", async () => {
    const { service } = await learnings();
    const { hits } = await service.search("erwähnt", { now: NOW });
    expect(hits).toEqual([{ path: "Learnings/Ohne-Felder.md", kind: "node", nodeId: expect.any(String), title: "Notiz", snippet: "Notiz Lockfile erwähnt." }]);
    expect(hits[0]).not.toHaveProperty("status");
    expect(hits[0]).not.toHaveProperty("expired");
    expect(hits[0]).not.toHaveProperty("ageDays");
  });

  test("expired and veraltet/ersetzt maps are left out unless includeStale is set", async () => {
    const { service } = await learnings();
    const standard = await service.search("lockfile", { now: NOW });
    expect(paths(standard.hits)).toEqual(["Bun-Lockfile", "Ohne-Felder"]);
    const all = await service.search("lockfile", { now: NOW, includeStale: true });
    expect(paths(all.hits)).toEqual(["Alt-Learning", "Bun-Lockfile", "Ersetzt-Learning", "Ohne-Felder", "Veraltet-Learning"]);
    // A map that expires today is not expired yet in the search.
    expect(paths((await service.search("läuft heute", { now: NOW })).hits)).toEqual(["Heute-Learning"]);
    expect(paths((await service.search("läuft heute", { now: new Date("2026-10-28T08:00:00Z") })).hits)).toEqual([]);
  });

  test("an explicit status filter wins over the default exclusion", async () => {
    const { service } = await learnings();
    expect(paths((await service.search("lockfile", { now: NOW, status: "veraltet" })).hits)).toEqual(["Veraltet-Learning"]);
    expect(paths((await service.search("lockfile", { now: NOW, status: "ersetzt" })).hits)).toEqual(["Ersetzt-Learning"]);
    // Also for an expired map whose status is not veraltet.
    expect(paths((await service.search("lockfile", { now: NOW, status: "bestätigt" })).hits)).toEqual(["Alt-Learning"]);
  });

  test("tag is exact and case-insensitive, scope a substring; an empty query lists the matching maps", async () => {
    const { service } = await learnings();
    const coder = await service.search("", { now: NOW, tag: "CODER" });
    expect(coder.hits.map((hit) => [hit.path, hit.kind, hit.nodeId])).toEqual([
      ["Learnings/Bald-Learning.md", "map", ""],
      ["Learnings/Bun-Lockfile.md", "map", ""],
    ]);
    expect(coder.hits[1]).toEqual(expect.objectContaining({ title: "Bun-Lockfile", snippet: "status: neu; scope: BloomMD, coder; tags: bereich/learnings, coder", status: "neu", ageDays: 26 }));
    expect(paths((await service.search("", { now: NOW, tag: "code" })).hits)).toEqual([]);
    expect(paths((await service.search("", { now: NOW, scope: "bloommd" })).hits)).toEqual(["Bald-Learning", "Bun-Lockfile"]);
    expect(paths((await service.search("", { now: NOW, scope: "WIKI" })).hits)).toEqual(["Bald-Learning"]);
    expect(paths((await service.search("", { now: NOW, tag: "coder", scope: "coder", includeStale: true })).hits)).toEqual(["Bun-Lockfile", "Ersetzt-Learning"]);
    expect(paths((await service.search("lockfile", { now: NOW, tag: "coder", scope: "wiki" })).hits)).toEqual([]);
    expect(paths((await service.search("", { now: NOW, status: "neu", area: "learnings" })).hits)).toEqual(["Bald-Learning", "Bun-Lockfile", "Heute-Learning"]);
    await expect(service.search("", { now: NOW })).rejects.toThrow(/query must not be empty/);
    await expect(service.search("  ")).rejects.toThrow(/query must not be empty/);
  });

  test("the limit counts frontmatter hits too", async () => {
    const { service } = await learnings();
    const { hits } = await service.search("coder", { now: NOW, includeStale: true, limit: 2 });
    expect(hits).toHaveLength(2);
  });
});

describe("stale maps", () => {
  test("lists expired maps most overdue first, with the days overdue", async () => {
    const { service } = await learnings();
    const { stale } = await service.stale({ now: NOW });
    expect(stale).toEqual([
      { path: "Learnings/Alt-Learning.md", title: "Alt-Learning", status: "bestätigt", stale_after: "2026-10-01", daysOverdue: 26, scope: "BloomMD, tester" },
      { path: "Learnings/Heute-Learning.md", title: "Heute-Learning", status: "neu", stale_after: "2026-10-27", daysOverdue: 0 },
    ]);
  });

  test("days adds maps that expire soon; filters narrow the list", async () => {
    const { service } = await learnings();
    const week = await service.stale({ now: NOW, days: 7 });
    expect(week.stale.map((entry) => [entry.title, entry.daysOverdue])).toEqual([["Alt-Learning", 26], ["Heute-Learning", 0], ["Bald-Learning", -7]]);
    expect((await service.stale({ now: NOW, days: 6 })).stale.map((entry) => entry.title)).toEqual(["Alt-Learning", "Heute-Learning"]);
    expect((await service.stale({ now: NOW, days: 7, tag: "coder" })).stale.map((entry) => entry.title)).toEqual(["Bald-Learning"]);
    expect((await service.stale({ now: NOW, days: 7, scope: "tester" })).stale.map((entry) => entry.title)).toEqual(["Alt-Learning"]);
    expect((await service.stale({ now: NOW, days: 365, area: "schule" })).stale).toEqual([]);
    expect((await service.stale({ now: NOW, days: 365, area: "LEARNINGS" })).stale.map((entry) => entry.title)).toEqual(["Alt-Learning", "Heute-Learning", "Bald-Learning", "Bun-Lockfile", "Ersetzt-Learning"]);
  });

  test("maps without stale_after never show up", async () => {
    const { service } = await vault();
    expect(await service.stale({ now: NOW, days: 3650 })).toEqual({ stale: [] });
  });

  test("agent stale: a short text list, NO_REPLY when there is nothing", async () => {
    const empty = await vault();
    expect(await staleSummary(empty.service, 0, NOW)).toBe("NO_REPLY");
    const { service } = await learnings();
    expect(await staleSummary(service, 0, NOW)).toBe([
      "🗂️ BloomMD-Maps zur Prüfung",
      "",
      "Abgelaufen (2):",
      "• Alt-Learning (BloomMD, tester) – Learnings/Alt-Learning.md, bestätigt, seit 2026-10-01 (26 Tage überfällig)",
      "• Heute-Learning – Learnings/Heute-Learning.md, neu, heute abgelaufen",
    ].join("\n"));
    const week = await staleSummary(service, 7, NOW);
    expect(week).toContain("Läuft in den nächsten 7 Tagen ab (1):\n• Bald-Learning (BloomMD, Wiki-CLI) – Learnings/Bald-Learning.md, neu, läuft ab 2026-11-03");
    expect(AGENT_USAGE).toContain("agent stale <ziel> [--days <n>]");
  });

  test("bloommd-wiki agent stale prints the list, and NO_REPLY for an empty vault", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };
    try {
      const empty = await vault();
      expect(await runAgentCli(["stale", empty.root], "test")).toBe(0);
      const { root } = await learnings();
      expect(await runAgentCli(["stale", root, "--days", "7"], "test")).toBe(0);
    } finally {
      console.log = original;
    }
    expect(lines[0]).toBe("NO_REPLY");
    expect(lines[1]).toContain("Läuft in den nächsten 7 Tagen ab");
    expect(lines[1]).toContain("Alt-Learning");
  });
});

describe("changing one node (bloommd_update_node)", () => {
  const patch = { status: "done", children: [{ ref: "k", title: "Folgeaufgabe", status: "open" }] };
  async function thermo(service: KnowledgeService) {
    const map = await service.getMap("Schule/Physik.md");
    return { map, node: map.nodes.find((node) => node.title === "Thermodynamik")! };
  }
  async function cloudService(fake: ReturnType<typeof fakeCloud>) {
    const stateDir = await mkdtemp(join(tmpdir(), "bloommd-cloud-"));
    return new KnowledgeService(new CloudKnowledgeStore({ url: "https://app.example", token: "bloom_pat_x", workspaceId: "ws1", stateDir, fetch: fake.fetcher }), "OpenClaw");
  }

  test("a vault map changes only the named fields, appends children last, logs the change and can be undone", async () => {
    const { root, service } = await vault();
    const { map, node } = await thermo(service);
    const result = await service.updateNode({ path: map.path, nodeId: node.id, version: map.version, patch: { ...patch, content: "Zweiter Satz.", contentMode: "append" }, reason: "Stunde", source: "Mitschrift" });
    // A note without stored ids is outlined with heading-<line> ids; the change stores real ones.
    const id = result.ids[node.id]!;
    expect(result).toMatchObject({ mode: "written", updated: [id], created: [expect.any(String)] });
    const after = parseFile("Physik.md", await readFile(join(root, "Schule/Physik.md"), "utf8"));
    const changed = after.nodes.get(id)!;
    expect(changed.title).toBe("Thermodynamik");
    expect(changed.content.trim()).toBe("Wärme und Arbeit.\n\nZweiter Satz.");
    expect(changed.metadata).toEqual({ kind: "task", status: "done" });
    expect(changed.children.map((id) => after.nodes.get(id)!.title)).toEqual(["Folgeaufgabe"]);
    expect((await service.changes()).changes[0]).toMatchObject({ event: "written", tool: "bloommd_update_node", path: "Schule/Physik.md", reason: "Stunde", source: "Mitschrift", changeId: result.changeId });
    await service.undo(result.changeId!);
    const undone = parseFile("Physik.md", await readFile(join(root, "Schule/Physik.md"), "utf8"));
    expect([...undone.nodes.values()].map((entry) => entry.title)).toEqual(["Physik", "Thermodynamik"]);
    expect([...undone.nodes.values()].every((entry) => entry.metadata === undefined)).toBe(true);
  });

  test("rights decide like for bloommd_update_map: propose keeps a proposal, read refuses, nothing is written", async () => {
    const { root, service } = await vault("write", { Schule: "propose" });
    const { map, node } = await thermo(service);
    const before = await readFile(join(root, "Schule/Physik.md"), "utf8");
    const proposed = await service.updateNode({ path: map.path, nodeId: node.id, patch });
    expect(proposed).toMatchObject({ mode: "proposed", proposalId: expect.any(String) });
    expect(await readFile(join(root, "Schule/Physik.md"), "utf8")).toBe(before);
    const [proposal] = await service.proposals();
    expect(proposal).toMatchObject({ tool: "bloommd_update_node", path: "Schule/Physik.md" });
    expect(proposal!.markdown).toContain("Folgeaufgabe");
    const readOnly = await vault("read");
    const target = await thermo(readOnly.service);
    await expect(readOnly.service.updateNode({ path: target.map.path, nodeId: target.node.id, patch })).rejects.toThrow(/may only read/);
  });

  test("an unknown node, a stale version and invalid fields change nothing", async () => {
    const { root, service } = await vault();
    const { map, node } = await thermo(service);
    const before = await readFile(join(root, "Schule/Physik.md"), "utf8");
    await expect(service.updateNode({ path: map.path, nodeId: "fehlt", patch })).rejects.toThrow(/does not exist/);
    await expect(service.updateNode({ path: map.path, nodeId: node.id, version: "alt", patch })).rejects.toThrow(/changed since version/);
    for (const bad of [{}, { id: "x" }, { parent: "y", status: "done" }, { status: "kaputt" }, { children: [{ id: node.id }] }, { content: "# Kopf" }]) {
      await expect(service.updateNode({ path: map.path, nodeId: node.id, patch: bad })).rejects.toThrow();
    }
    expect(await readFile(join(root, "Schule/Physik.md"), "utf8")).toBe(before);
    expect((await service.changes()).changes).toEqual([]);
  });

  test("a cloud workspace uses PATCH …/nodes/:nodeId with the agent's words, never a whole-document save", async () => {
    const fake = fakeCloud();
    const service = await cloudService(fake);
    const proposed = await service.updateNode({ path: "Arbeit – Plan.md", nodeId: "ziel01", patch, reason: "Meeting", source: "Teams" });
    expect(proposed).toMatchObject({ mode: "proposed", proposalId: "p2", path: "Arbeit – Plan.md" });
    const sent = fake.calls.find((call) => call.method === "PATCH")!;
    expect(sent).toMatchObject({ path: "/api/mindmaps/Arbeit – Plan.md/nodes/ziel01", workspace: "ws1", auth: "Bearer bloom_pat_x", body: { status: "done", children: [{ ref: "k", title: "Folgeaufgabe", status: "open" }], agentMeta: { tool: "bloommd_update_node", reason: "Meeting", source: "Teams" } } });
    fake.state.mode = "written";
    expect(await service.updateNode({ path: "Arbeit – Plan.md", nodeId: "ziel01", patch: { status: "done" } })).toMatchObject({ mode: "written", changeId: "c-node", version: "6", updated: ["ziel01"] });
    expect(fake.calls.filter((call) => call.method === "PUT" || (call.method === "POST" && call.path.endsWith("/nodes")))).toEqual([]);
  });

  test("a cloud refusal reaches the agent as the server words it; an unknown node and bad input never leave the machine", async () => {
    const fake = fakeCloud();
    const service = await cloudService(fake);
    await expect(service.updateNode({ path: "Arbeit – Plan.md", nodeId: "nope", patch })).rejects.toThrow(/does not exist/);
    await expect(service.updateNode({ path: "Arbeit – Plan.md", nodeId: "ziel01", patch: { status: "kaputt" } })).rejects.toThrow(/status must be one of/);
    expect(fake.calls.some((call) => call.method === "PATCH")).toBe(false);
    fake.state.denyWith = { error: 'The agent "OpenClaw" may only read in "Arbeit". Ask the workspace owner to allow proposals or writing there.', code: "AGENT_READ_ONLY" };
    await expect(service.updateNode({ path: "Arbeit – Plan.md", nodeId: "ziel01", patch })).rejects.toThrow(/may only read in "Arbeit"/);
  });

  test("the MCP tool takes the same fields, has no owner tools next to it and refuses invalid input", async () => {
    const { root, service } = await vault();
    const options = knowledgeServerOptions({ vault: service }, "test");
    const tool = options.tools.find((entry) => entry.name === "bloommd_update_node")!;
    const schema = tool.inputSchema as { required: string[]; properties: Record<string, unknown> };
    const fields = Object.keys(schema.properties);
    expect(schema.required).toEqual(["path", "nodeId"]);
    expect(fields).toEqual(expect.arrayContaining(["path", "nodeId", "version", "title", "content", "contentMode", "kind", "status", "decision", "due", "assignee", "note", "citation", "url", "relations", "children", "reason", "source", "target"]));
    for (const batchOnly of ["id", "ref", "parent"]) expect(fields).not.toContain(batchOnly);
    expect(tool.annotations?.readOnlyHint).toBe(false);
    // Rights, approval and the owner's undo stay with people.
    expect(options.tools.map((entry) => entry.name).filter((name) => /approve|apply|reject|rights|setup|owner|migrate/.test(name))).toEqual([]);
    const { node } = await thermo(service);
    const result = await options.call("bloommd_update_node", { path: "Schule/Physik.md", nodeId: node.id, status: "in_progress", children: [{ title: "Neu" }], reason: "Test" }) as { mode: string; updated: string[] };
    const id = (result as unknown as { ids: Record<string, string> }).ids[node.id]!;
    expect(result).toMatchObject({ mode: "written", updated: [id] });
    expect(parseFile("Physik.md", await readFile(join(root, "Schule/Physik.md"), "utf8")).nodes.get(id)?.metadata?.status).toBe("in_progress");
    await expect(options.call("bloommd_update_node", { path: "Schule/Physik.md", nodeId: id })).rejects.toThrow(/at least one field/);
    await expect(options.call("bloommd_update_node", { path: "Schule/Physik.md", nodeId: "fehlt", status: "done" })).rejects.toThrow(/does not exist/);
    await expect(options.call("bloommd_update_node", { path: "Schule/Physik.md", nodeId: id, status: "kaputt" })).rejects.toThrow(/status must be one of/);
  });

  test("the CLI changes a node in a vault and, with --cloud, through the server route", async () => {
    const { root, service } = await vault();
    const { node } = await thermo(service);
    const original = { log: console.log, token: process.env.BLOOMMD_TOKEN, fetch: globalThis.fetch, home: process.env.HOME };
    const out: string[] = [];
    console.log = (...values: unknown[]) => void out.push(values.join(" "));
    try {
      expect(await runAgentCli(["update-node", root, "Schule/Physik.md", node.id, "--patch", JSON.stringify({ assignee: "Lea", children: [{ title: "Aus der CLI" }] }), "--reason", "Test"], "test")).toBe(0);
      const cli = JSON.parse(out.at(-1)!) as { mode: string; updated: string[]; ids: Record<string, string> };
      expect(cli).toMatchObject({ mode: "written", updated: [cli.ids[node.id]] });
      const doc = parseFile("Physik.md", await readFile(join(root, "Schule/Physik.md"), "utf8"));
      expect(doc.nodes.get(cli.ids[node.id]!)?.metadata).toEqual({ kind: "task", assignee: "Lea" });
      expect((await service.changes()).changes[0]).toMatchObject({ tool: "bloommd_update_node", reason: "Test" });
      await expect(runAgentCli(["update-node", root, "Schule/Physik.md", node.id], "test")).rejects.toThrow(/--patch/);
      await expect(runAgentCli(["update-node", root, "Schule/Physik.md", node.id, "--patch", "{kaputt"], "test")).rejects.toThrow(/kein gültiges JSON/);
      await expect(runAgentCli(["update-node", root, "Schule/Physik.md"], "test")).rejects.toThrow(/knoten-id/);

      const fake = fakeCloud();
      fake.state.mode = "written";
      globalThis.fetch = fake.fetcher;
      process.env.BLOOMMD_TOKEN = "bloom_pat_agent";
      process.env.HOME = await mkdtemp(join(tmpdir(), "bloommd-home-"));
      expect(await runAgentCli(["update-node", "--cloud", "https://app.example", "--workspace", "ws1", "Arbeit – Plan.md", "ziel01", "--patch", JSON.stringify({ status: "done" }), "--source", "Teams"], "test")).toBe(0);
      expect(JSON.parse(out.at(-1)!)).toMatchObject({ mode: "written", changeId: "c-node" });
      expect(fake.calls.find((call) => call.method === "PATCH")).toMatchObject({ path: "/api/mindmaps/Arbeit – Plan.md/nodes/ziel01", auth: "Bearer bloom_pat_agent", workspace: "ws1", body: { status: "done", agentMeta: { tool: "bloommd_update_node", source: "Teams" } } });
    } finally {
      console.log = original.log;
      globalThis.fetch = original.fetch;
      if (original.token === undefined) delete process.env.BLOOMMD_TOKEN; else process.env.BLOOMMD_TOKEN = original.token;
      if (original.home === undefined) delete process.env.HOME; else process.env.HOME = original.home;
    }
  });
});

describe("trust fields through the MCP tools", () => {
  test("lists bloommd_stale as read-only and documents the new parameters", () => {
    const tools = knowledgeServerOptions({}, "test").tools;
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get("bloommd_stale")?.annotations?.readOnlyHint).toBe(true);
    const props = (name: string) => Object.keys((byName.get(name)!.inputSchema as { properties: Record<string, unknown> }).properties);
    expect(props("bloommd_create_map")).toEqual(expect.arrayContaining(["title", "area", "tags", "source", "status", "stale_after", "verified", "scope", "replaced_by"]));
    expect(props("bloommd_update_map")).toEqual(expect.arrayContaining(["nodes", "status", "stale_after", "verified", "scope", "replaced_by"]));
    expect(props("bloommd_search")).toEqual(expect.arrayContaining(["query", "area", "status", "tag", "scope", "includeStale"]));
    expect((byName.get("bloommd_search")!.inputSchema as { required?: string[] }).required).toBeUndefined();
    expect((byName.get("bloommd_update_map")!.inputSchema as { required: string[] }).required).toEqual(["path"]);
    expect(knowledgeServerOptions({}, "test").instructions).toContain("bloommd_stale");
    expect(byName.get("bloommd_templates")!.description).toContain("bloommd_stale");
  });

  test("create, update, search and stale work end to end; invalid input is an input error", async () => {
    const { service } = await vault();
    const call = knowledgeServerOptions({ vault: service }, "test").call;
    const created = await call("bloommd_create_map", { area: "Learnings", title: "Per MCP", template: "learning", scope: "BloomMD, coder", stale_after: "2020-01-01", status: "neu", tags: ["coder"] }) as { path: string; frontmatter: string[] };
    expect(created.frontmatter).toEqual(["status", "stale_after", "scope"]);
    expect(((await call("bloommd_search", { query: "per mcp" })) as { hits: unknown[] }).hits).toEqual([]);
    expect(((await call("bloommd_search", { query: "", tag: "coder", includeStale: true })) as { hits: Array<{ expired: boolean }> }).hits).toEqual([expect.objectContaining({ expired: true })]);
    expect(((await call("bloommd_stale", { tag: "coder" })) as { stale: Array<{ path: string; daysOverdue: number }> }).stale).toEqual([expect.objectContaining({ path: created.path })]);
    await call("bloommd_update_map", { path: created.path, stale_after: "2099-01-01", status: "bestätigt", verified: { by: "Max", at: "2026-10-27" } });
    expect(((await call("bloommd_stale", {})) as { stale: unknown[] }).stale).toEqual([]);
    expect(((await call("bloommd_stale", { days: 100000 })) as { stale: unknown[] }).stale).toHaveLength(1);
    expect(((await call("bloommd_search", { query: "per mcp" })) as { hits: unknown[] }).hits.length).toBeGreaterThan(0);
    for (const args of [{ status: "stable" }, { stale_after: "2026-02-30" }, { verified: { by: "Max" } }, { scope: "a".repeat(400) }, { replaced_by: "x.md" }, { status: "bestätigt", replaced_by: "x.md" }, {}]) {
      await expect(call("bloommd_update_map", { path: created.path, ...args })).rejects.toThrow();
    }
    await expect(call("bloommd_create_map", { area: "A", title: "B", replaced_by: "x.md" })).rejects.toThrow(/only allowed together with status ersetzt/);
    expect(await service.getMap(created.path).then((map) => map.nodes.length)).toBeGreaterThan(0);
  });
});
