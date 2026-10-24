import { describe, expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { chmod, mkdtemp, truncate, readdir, readFile, symlink, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentLedger, knowledgeVersion, vaultArea, type AgentDocuments, type AgentStateFiles } from "@bloommd/core/agent-ledger";
import { applyKnowledgeNodes } from "@bloommd/core/knowledge";
import { parseFile } from "@bloommd/core/parser";
import { createMcpParser } from "./mcp";
import { knowledgeServerOptions } from "./knowledge-mcp";
import { dueSummary } from "./agent-cli";
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

describe("owner CLI for a cloud workspace", () => {
  test("setup, rights and proposals work with --cloud", async () => {
    const home = await mkdtemp(join(tmpdir(), "bloommd-home-"));
    const cli = (...args: string[]) => execFileSync("bun", [join(import.meta.dir, "cli.ts"), "agent", ...args], { env: { ...process.env, HOME: home, BLOOMMD_TOKEN: "" }, encoding: "utf8" });
    cli("setup", "--cloud", "https://app.example", "--workspace", "ws1", "--access", "write", "--area", "Arbeit=propose");
    const stateDir = join(home, ".bloommd", "agent-cloud", "app.example-ws1");
    expect(JSON.parse(await readFile(join(stateDir, "agent.json"), "utf8"))).toEqual({ access: "write", areas: { Arbeit: "propose" } });
    expect(JSON.parse(cli("rights", "--cloud", "https://app.example", "--workspace", "ws1"))).toEqual({ access: "write", areas: { Arbeit: "propose" } });
    expect(JSON.parse(cli("proposals", "--cloud", "https://app.example", "--workspace", "ws1"))).toEqual([]);
  });
});

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
