import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDays } from "@bloommd/core/knowledge-templates";
import { parseFile } from "@bloommd/core/parser";
import { AGENT_USAGE, learningDeps, runAgentCli } from "./agent-cli";
import { DUPLICATE_THRESHOLD, EXIT, learningSections, learningSimilarity, runLearningCommand, WRITE_LIMIT_PER_TICKET, type LearningDeps } from "./agent-learnings";
import { KnowledgeService } from "./knowledge-service";
import { VaultKnowledgeStore, writeAccessConfig } from "./knowledge-store";

type Access = "read" | "propose" | "write";

async function learningVault(access: Access = "write") {
  const root = await mkdtemp(join(tmpdir(), "bloommd-learnings-"));
  await writeAccessConfig(join(root, ".bloommd"), { access: "read", areas: { Learnings: access } });
  return root;
}

interface Run {
  code: number;
  out: string[];
  err: string;
  /** The one JSON document on stdout. */
  json: Record<string, any>;
}

/** Runs several commands at once with stdout and stderr captured; each result is one JSON line. */
async function capture<T>(task: () => Promise<T>): Promise<{ result: T; out: string[]; err: string }> {
  const original = { log: console.log, write: process.stderr.write };
  const out: string[] = [];
  let err = "";
  console.log = (...values: unknown[]) => void out.push(values.join(" "));
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    return { result: await task(), out, err };
  } finally {
    console.log = original.log;
    process.stderr.write = original.write;
  }
}

async function agent(args: string[], deps?: LearningDeps): Promise<Run> {
  const { result: code, out, err } = await capture(() => (deps ? runLearningCommand(args[0]!, args.slice(1), deps) : runAgentCli(args, "test")));
  let json: Record<string, any> = {};
  try {
    if (out.length === 1) json = JSON.parse(out[0]!) as Record<string, any>;
  } catch {
    // Plain text (help, routine output): the tests look at `out`.
  }
  return { code, out, err, json };
}

const create = (root: string, title: string, extra: string[] = [], ticket = "113") =>
  agent(["create", "--vault", root, "--name", "coder", "--ticket", ticket, "--titel", title, "--rolle", "coder", "--beleg", "https://github.com/moellenbeck-digital/BloomMD/issues/113", "--inhalt", `Regel zu ${title}`, ...extra]);

async function learningFile(root: string, path: string, options: { title: string; status?: string; tags?: string[]; scope?: string; staleAfter?: string; text?: string; created?: string; beleg?: string }) {
  await mkdir(join(root, path, ".."), { recursive: true });
  const lines = ["---", "type: learning", `title: "${options.title}"`, `status: ${options.status ?? "neu"}`, `tags: [${(options.tags ?? ["coder"]).map((tag) => `"${tag}"`).join(", ")}]`];
  if (options.scope) lines.push(`scope: "${options.scope}"`);
  if (options.staleAfter) lines.push(`stale_after: ${options.staleAfter}`);
  if (options.created) lines.push(`created: ${options.created}`);
  lines.push("---", "", `# ${options.title}`, "", "## Symptom", "", options.text ?? "Der Lockfile-Fehler tritt auf.", "", "## Ursache", "", "## Regel", "", "Version festhalten.", "", "## Beleg", "", ...(options.beleg ? [`- ${options.beleg}`, ""] : []), "## Gilt für", "");
  await writeFile(join(root, path), lines.join("\n"), "utf8");
}

const FUTURE = "2099-01-01";
const PAST = "2020-01-01";

describe("agent search", () => {
  async function seeded() {
    const root = await learningVault();
    await learningFile(root, "Learnings/coder/Lockfile aktuell.md", { title: "Lockfile Version prüfen", tags: ["coder", "bun"], scope: "BloomMD, coder, Dockerfile", staleAfter: FUTURE, status: "bestätigt" });
    await learningFile(root, "Learnings/coder/Lockfile abgelaufen.md", { title: "Lockfile alter Stand", tags: ["coder"], staleAfter: PAST });
    await learningFile(root, "Learnings/coder/Lockfile veraltet.md", { title: "Lockfile veraltet", tags: ["coder"], staleAfter: FUTURE, status: "veraltet" });
    await learningFile(root, "Learnings/tester/Lockfile Tester.md", { title: "Lockfile im Test", tags: ["tester"], staleAfter: FUTURE });
    await mkdir(join(root, "Schule"), { recursive: true });
    await writeFile(join(root, "Schule", "Privat.md"), "# Privat\n\n## Lockfile\n\nNichts für Agenten.\n", "utf8");
    return root;
  }

  test("returns the hits as JSON and leaves out expired and veraltet learnings by default", async () => {
    const root = await seeded();
    const run = await agent(["search", "Lockfile", "--vault", root, "--name", "tester"]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.out).toHaveLength(1);
    expect(run.err).toBe("");
    expect(run.json.treffer.map((hit: { pfad: string }) => hit.pfad).sort()).toEqual(["Learnings/coder/Lockfile aktuell.md", "Learnings/tester/Lockfile Tester.md"]);
    const hit = run.json.treffer.find((entry: { pfad: string }) => entry.pfad.endsWith("aktuell.md"));
    expect(hit).toMatchObject({ titel: "Lockfile Version prüfen", status: "bestätigt", rolle: "coder", tags: ["coder", "bun"], stale_after: FUTURE, abgelaufen: false });
    expect(typeof hit.auszug).toBe("string");
    expect(hit.auszug.length).toBeGreaterThan(0);
    expect(run.json).toMatchObject({ anzahl: 2, gesamt: 2, limit: 5 });
  });

  test("--include-stale also returns expired and veraltet ones, and only Learnings is searched", async () => {
    const root = await seeded();
    const run = await agent(["search", "Lockfile", "--vault", root, "--include-stale"]);
    const paths = run.json.treffer.map((hit: { pfad: string }) => hit.pfad);
    expect(paths).toHaveLength(4);
    expect(paths).toContain("Learnings/coder/Lockfile abgelaufen.md");
    expect(paths).toContain("Learnings/coder/Lockfile veraltet.md");
    expect(paths.some((path: string) => path.startsWith("Schule/"))).toBe(false);
    expect(run.json.treffer.find((hit: { pfad: string }) => hit.pfad.endsWith("abgelaufen.md")).abgelaufen).toBe(true);
  });

  test("filters by role, tag and component (all must match) and limits the hits", async () => {
    const root = await seeded();
    expect((await agent(["search", "Lockfile", "--vault", root, "--rolle", "tester"])).json.treffer.map((hit: { pfad: string }) => hit.pfad)).toEqual(["Learnings/tester/Lockfile Tester.md"]);
    expect((await agent(["search", "Lockfile", "--vault", root, "--rolle", "coder", "--tag", "bun"])).json.anzahl).toBe(1);
    expect((await agent(["search", "Lockfile", "--vault", root, "--rolle", "tester", "--tag", "bun"])).json.anzahl).toBe(0);
    expect((await agent(["search", "Lockfile", "--vault", root, "--komponente", "dockerfile"])).json.treffer.map((hit: { pfad: string }) => hit.pfad)).toEqual(["Learnings/coder/Lockfile aktuell.md"]);
    // A filter alone is enough; the text may be left out.
    expect((await agent(["search", "--vault", root, "--rolle", "coder"])).json.anzahl).toBe(1);
    const limited = await agent(["search", "Lockfile", "--vault", root, "--include-stale", "--limit", "2"]);
    expect(limited.json).toMatchObject({ anzahl: 2, gesamt: 4, limit: 2 });
  });

  test("a wrong call is exit 2 with JSON on stdout and the message on stderr", async () => {
    const root = await seeded();
    for (const args of [["search", "x"], ["search", "--vault", root], ["search", "x", "--vault", root, "--limit", "0"], ["search", "x", "--vault", root, "--limit", "99"], ["search", "x", "--vault", root, "--nope"], ["search", "x", "--vault", root, "--cloud", "https://app.example"], ["search", "x", "y", "--vault", root]]) {
      const run = await agent(args);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toBeString();
      expect(run.json.aufruf).toContain("agent search");
      expect(run.err).toContain(run.json.fehler);
    }
  });

  test("--cloud without BLOOMMD_TOKEN is exit 2", async () => {
    const original = process.env.BLOOMMD_TOKEN;
    delete process.env.BLOOMMD_TOKEN;
    try {
      const run = await agent(["search", "x", "--cloud", "https://app.example"]);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toContain("BLOOMMD_TOKEN");
    } finally {
      if (original !== undefined) process.env.BLOOMMD_TOKEN = original;
    }
  });
});

describe("agent read", () => {
  test("returns frontmatter, content and version without BloomMD's id comments", async () => {
    const root = await learningVault();
    const created = await create(root, "Bun-Version je Repo festhalten");
    const run = await agent(["read", created.json.pfad, "--vault", root]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.pfad).toBe("Learnings/coder/Bun-Version je Repo festhalten.md");
    expect(run.json.version).toBe(created.json.version);
    expect(run.json.bereich).toBe("Learnings/coder");
    expect(run.json.frontmatter).toMatchObject({ titel: "Bun-Version je Repo festhalten", status: "neu", rolle: "coder", scope: "coder", verified: [], abgelaufen: false });
    expect(run.json.frontmatter.tags).toContain("coder");
    expect(run.json.inhalt).toContain("## Regel");
    expect(run.json.inhalt).toContain("Regel zu Bun-Version je Repo festhalten");
    expect(run.json.inhalt).not.toContain("bloommd:");
    expect(run.json.inhalt).not.toContain("title:");
  });

  test("refuses invalid paths and anything outside Learnings or the vault", async () => {
    const root = await learningVault();
    const outside = await mkdtemp(join(tmpdir(), "bloommd-outside-"));
    await writeFile(join(outside, "geheim.md"), "# Geheim\n", "utf8");
    await mkdir(join(root, "Learnings"), { recursive: true });
    await symlink(outside, join(root, "Learnings", "leck"));
    await mkdir(join(root, "Schule"), { recursive: true });
    await writeFile(join(root, "Schule", "Physik.md"), "# Physik\n", "utf8");
    for (const path of ["../geheim.md", "../../etc/passwd", "/etc/passwd", "Learnings/../Schule/Physik.md", ".bloommd/agent.json", "Learnings/x.txt", "Schule/Physik.md"]) {
      const run = await agent(["read", path, "--vault", root]);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toBeString();
      expect(run.json.inhalt).toBeUndefined();
    }
    // A symlink inside Learnings that leads out of the vault is refused too, and its content never shown.
    const leak = await agent(["read", "Learnings/leck/geheim.md", "--vault", root]);
    expect(leak.code).toBe(EXIT.error);
    expect(leak.out.join("")).not.toContain("Geheim");
    // A missing learning is an error, not a wrong call.
    const missing = await agent(["read", "Learnings/coder/gibt-es-nicht.md", "--vault", root]);
    expect(missing.code).toBe(EXIT.error);
    expect(missing.json.fehler).toBeString();
  });
});

describe("agent create", () => {
  test("files a learning from the template: required fields, frontmatter, nodes, readable by BloomMD", async () => {
    const root = await learningVault();
    const run = await create(root, "Bun-Version je Repo festhalten", ["--komponente", "dev-team-Image", "--tag", "bun"]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.out).toHaveLength(1);
    expect(run.json).toMatchObject({ ok: true, pfad: "Learnings/coder/Bun-Version je Repo festhalten.md", status: "neu", modus: "geschrieben", ticket: "113", schreibvorgang: 1, limit: 3 });
    const markdown = await readFile(join(root, run.json.pfad), "utf8");
    expect(markdown).toContain('type: "learning"');
    expect(markdown).toContain('status: "neu"');
    expect(markdown).toContain(`stale_after: "${addDays(new Date().toISOString().slice(0, 10), 90)}"`);
    expect(markdown).toContain('scope: "dev-team-Image, coder"');
    expect(markdown).toContain("Ticket 113");
    expect(markdown).toMatch(/tags: \[.*"coder".*"bun".*\]/);
    expect(markdown).toContain("https://github.com/moellenbeck-digital/BloomMD/issues/113");
    expect(markdown).toContain("- Komponente: dev-team-Image");
    const titles = [...parseFile(run.json.pfad, markdown).nodes.values()].map((node) => node.title);
    expect(titles).toEqual(expect.arrayContaining(["Symptom", "Ursache", "Regel", "Beleg", "Gilt für", "Aufgaben"]));
    // Written by the agent, so the log names it and undo works.
    expect(await readFile(join(root, ".bloommd", "agent-log.jsonl"), "utf8")).toContain('"agent":"coder"');
  });

  test("every required field is checked (exit 2, nothing written, no slot used)", async () => {
    const root = await learningVault();
    const full = ["--vault", root, "--name", "coder", "--ticket", "T-req", "--titel", "Pflichtfelder prüfen", "--rolle", "coder", "--beleg", "https://example.org/1", "--inhalt", "Text"];
    for (const flag of ["--vault", "--name", "--ticket", "--titel", "--rolle", "--beleg", "--inhalt"]) {
      const at = full.indexOf(flag);
      const args = [...full.slice(0, at), ...full.slice(at + 2)];
      expect((await agent(["create", ...args])).code).toBe(EXIT.usage);
    }
    for (const bad of [["--beleg", "kein-link"], ["--beleg", "javascript:alert(1)"], ["--rolle", "Coder Team"], ["--ticket", "../x"], ["--ticket", ".hidden"], ["--inhalt", "   "], ["--titel", "zwei\nZeilen"]]) {
      const args = [...full];
      args[args.indexOf(bad[0]!) + 1] = bad[1]!;
      const run = await agent(["create", ...args]);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toBeString();
    }
    expect(await readdir(root)).toEqual([".bloommd"]);
    // Not one of the failed calls used one of the three writes.
    for (const title of ["Eins", "Zwei", "Drei"]) expect((await agent(["create", ...full.map((value) => (value === "Pflichtfelder prüfen" ? `Pflicht ${title}` : value))])).code).toBe(EXIT.ok);
  });

  test("content: stdin with -, sections, and unstructured text becomes the Regel", async () => {
    const root = await learningVault();
    const run = await agent(["create", "--vault", root, "--name", "tester", "--ticket", "T-in", "--titel", "Stdin und Abschnitte", "--rolle", "tester", "--beleg", "https://example.org/in", "--inhalt", "-"], {
      open: async ({ vault, name }) => new KnowledgeService(new VaultKnowledgeStore(vault!), name),
      stdin: () => "## Symptom\r\nTest rot.\r\n## Ursache\r\nZeitzone.\r\n## Regel\r\nUTC setzen.\r\n",
    });
    expect(run.code).toBe(EXIT.ok);
    const read = (await agent(["read", run.json.pfad, "--vault", root])).json;
    expect(read.inhalt).toMatch(/## Symptom\s+Test rot\./);
    expect(read.inhalt).toMatch(/## Ursache\s+Zeitzone\./);
    expect(read.inhalt).toMatch(/## Regel\s+UTC setzen\./);
    expect(learningSections("Nur Text")).toEqual({ symptom: "", ursache: "", regel: "Nur Text" });
    expect(learningSections("## Regel\nA\n## Symptom\nB")).toEqual({ symptom: "B", ursache: "", regel: "A" });
    expect(() => learningSections("Vorspann\n## Regel\nA")).toThrow(/vor der ersten Überschrift/);
    // Other headings would become nodes of their own and are refused.
    const heading = await create(root, "Mit Überschrift", ["--inhalt", "# Schlecht"]);
    expect(heading.code).toBe(EXIT.usage);
  });
});

describe("duplicate check before create", () => {
  test("the same title is no new learning: exit 3, duplicate: true and the path of the existing one", async () => {
    const root = await learningVault();
    const first = await create(root, "Bun-Version je Repo festhalten");
    const again = await create(root, "bun version je repo festhalten!", [], "T-dup");
    expect(again.code).toBe(EXIT.duplicate);
    expect(again.json).toMatchObject({ duplicate: true, pfad: first.json.pfad, titel: "Bun-Version je Repo festhalten", aehnlichkeit: 1 });
    expect(again.json.fehler).toBeString();
    expect(again.err).toContain(first.json.pfad);
    expect(await readdir(join(root, "Learnings", "coder"))).toHaveLength(1);
    // Same title under another role is a duplicate too.
    const other = await agent(["create", "--vault", root, "--name", "tester", "--ticket", "T-dup", "--titel", "Bun-Version je Repo festhalten", "--rolle", "tester", "--beleg", "https://example.org/x", "--inhalt", "x"]);
    expect(other.code).toBe(EXIT.duplicate);
    // There is no --force.
    const forced = await create(root, "Bun-Version je Repo festhalten", ["--force"]);
    expect(forced.code).toBe(EXIT.usage);
  });

  test("a very similar title with shared tags is a duplicate, a different one is not", async () => {
    const root = await learningVault();
    await create(root, "Bun-Version je Repo festhalten, das Image braucht Bun 1.4", ["--tag", "bun"]);
    const similar = await create(root, "Bun Version pro Repo festhalten, Image braucht Bun 1.4", ["--tag", "bun"], "T-sim");
    expect(similar.code).toBe(EXIT.duplicate);
    expect(similar.json.aehnlichkeit).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
    const different = await create(root, "Postgres-Migration hängt im Test", ["--tag", "bun"], "T-sim");
    expect(different.code).toBe(EXIT.ok);
  });

  test("a retired learning can be learned again, and a duplicate does not use up one of the three writes", async () => {
    const root = await learningVault();
    await learningFile(root, "Learnings/coder/Alt.md", { title: "Docker Socket verweigert Zugriff", status: "veraltet", tags: ["coder"] });
    const fresh = await create(root, "Docker Socket verweigert Zugriff", [], "T-ret");
    expect(fresh.code).toBe(EXIT.ok);
    for (let index = 0; index < 5; index += 1) expect((await create(root, "Docker Socket verweigert Zugriff", [], "T-ret")).code).toBe(EXIT.duplicate);
    expect((await create(root, "Kubernetes Probe schlägt fehl", [], "T-ret")).code).toBe(EXIT.ok);
    expect((await create(root, "Zertifikat im Ingress abgelaufen", [], "T-ret")).code).toBe(EXIT.ok);
    expect((await create(root, "Postgres Migration hängt", [], "T-ret")).code).toBe(EXIT.limit);
  });

  test("learningSimilarity", () => {
    expect(learningSimilarity({ title: "Ein Titel", tags: [] }, { title: "ein  TITEL!", tags: [] })).toBe(1);
    expect(learningSimilarity({ title: "Lockfile Version prüfen", tags: ["coder"] }, { title: "Lockfile Version prüfen und festhalten", tags: ["tester"] })).toBe(0);
    expect(learningSimilarity({ title: "Docker Socket verweigert", tags: ["bereich/learnings", "coder"] }, { title: "Kubernetes Probe schlägt fehl", tags: ["coder"] })).toBeLessThan(DUPLICATE_THRESHOLD);
  });
});

describe("agent append", () => {
  async function existing(extra: Parameters<typeof learningFile>[2] = { title: "Lockfile Version prüfen" }) {
    const root = await learningVault();
    await learningFile(root, "Learnings/coder/Lockfile.md", { staleAfter: PAST, ...extra });
    return root;
  }
  const append = (root: string, extra: string[], ticket = "113") => agent(["append", "Learnings/coder/Lockfile.md", "--vault", root, "--name", "tester", "--ticket", ticket, ...extra]);

  test("adds a node and an evidence link, appends verified and renews stale_after; the status stays", async () => {
    const root = await existing({ title: "Lockfile Version prüfen", status: "bestätigt" });
    const run = await append(root, ["--inhalt", "Zweiter Vorfall am 27.10.", "--beleg", "https://github.com/moellenbeck-digital/BloomMD/actions/runs/1"]);
    const renewed = addDays(new Date().toISOString().slice(0, 10), 90);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ ok: true, pfad: "Learnings/coder/Lockfile.md", modus: "geschrieben", verified: { by: "tester" }, stale_after: renewed, schreibvorgang: 1, limit: 3 });
    const read = (await agent(["read", "Learnings/coder/Lockfile.md", "--vault", root])).json;
    expect(read.frontmatter).toMatchObject({ status: "bestätigt", stale_after: renewed, abgelaufen: false });
    expect(read.frontmatter.verified).toEqual([{ by: "tester", at: new Date().toISOString().slice(0, 10) }]);
    expect(read.inhalt).toMatch(/### Zweiter Vorfall am 27\.10\./);
    expect(read.inhalt).toMatch(/## Beleg[\s\S]*### Beleg zu Ticket 113\s+https:\/\/github\.com\/moellenbeck-digital\/BloomMD\/actions\/runs\/1/);
    expect(read.inhalt).toContain("Version festhalten.");
    // A second append keeps the earlier verified entry.
    await append(root, ["--inhalt", "Dritter Vorfall"]);
    expect((await agent(["read", "Learnings/coder/Lockfile.md", "--vault", root])).json.frontmatter.verified).toHaveLength(2);
  });

  test("--abschnitt and --titel place and name the node; longer text keeps its content", async () => {
    const root = await existing();
    const run = await append(root, ["--abschnitt", "ursache", "--titel", "Neue Ursache", "--inhalt", "Erste Zeile\nzweite Zeile"]);
    expect(run.code).toBe(EXIT.ok);
    const inhalt = (await agent(["read", "Learnings/coder/Lockfile.md", "--vault", root])).json.inhalt as string;
    expect(inhalt).toMatch(/### Neue Ursache\s+Erste Zeile\s+zweite Zeile/);
    expect((await append(root, ["--abschnitt", "unsinn", "--inhalt", "x"])).code).toBe(EXIT.usage);
  });

  test("a veraltet learning gets its verified entry but no new stale_after", async () => {
    const root = await existing({ title: "Lockfile Version prüfen", status: "veraltet" });
    const run = await append(root, ["--inhalt", "Doch noch relevant"]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.stale_after).toBeUndefined();
    expect((await agent(["read", "Learnings/coder/Lockfile.md", "--vault", root])).json.frontmatter).toMatchObject({ status: "veraltet", stale_after: PAST });
  });

  test("wrong calls and missing learnings: exit 2 or 1, no slot used", async () => {
    const root = await existing();
    expect((await append(root, [])).code).toBe(EXIT.usage);
    expect((await append(root, ["--inhalt", "   "])).code).toBe(EXIT.usage);
    expect((await append(root, ["--beleg", "kein-link"])).code).toBe(EXIT.usage);
    expect((await agent(["append", "Learnings/coder/Lockfile.md", "--vault", root, "--name", "tester", "--inhalt", "x"])).code).toBe(EXIT.usage);
    expect((await agent(["append", "Learnings/coder/Lockfile.md", "--vault", root, "--ticket", "113", "--inhalt", "x"])).code).toBe(EXIT.usage);
    expect((await agent(["append", "../x.md", "--vault", root, "--name", "t", "--ticket", "113", "--inhalt", "x"])).code).toBe(EXIT.usage);
    expect((await agent(["append", "Schule/Physik.md", "--vault", root, "--name", "t", "--ticket", "113", "--inhalt", "x"])).code).toBe(EXIT.usage);
    const missing = await agent(["append", "Learnings/coder/Fehlt.md", "--vault", root, "--name", "t", "--ticket", "113", "--inhalt", "x"]);
    expect(missing.code).toBe(EXIT.error);
    for (let index = 0; index < 3; index += 1) expect((await append(root, ["--inhalt", `Ergänzung ${index}`])).code).toBe(EXIT.ok);
  });
});

describe("write counter per ticket", () => {
  test("three writes pass, the fourth fails with limit: 3 and exit 4; reading and searching do not count", async () => {
    const root = await learningVault();
    await agent(["search", "x", "--vault", root]);
    await agent(["stale", "--vault", root]);
    expect((await create(root, "Apfel zerfällt im Container", [], "T-1")).json.schreibvorgang).toBe(1);
    await agent(["read", "Learnings/coder/Apfel zerfällt im Container.md", "--vault", root]);
    await agent(["search", "Apfel", "--vault", root]);
    expect((await agent(["append", "Learnings/coder/Apfel zerfällt im Container.md", "--vault", root, "--name", "coder", "--ticket", "T-1", "--inhalt", "a"])).json.schreibvorgang).toBe(2);
    expect((await create(root, "Docker Socket verweigert Zugriff", [], "T-1")).json.schreibvorgang).toBe(3);
    const fourth = await create(root, "Kubernetes Probe schlägt fehl", [], "T-1");
    expect(fourth.code).toBe(EXIT.limit);
    expect(fourth.json).toMatchObject({ limit: 3, ticket: "T-1", geschrieben: 3 });
    expect(fourth.json.fehler).toBeString();
    expect((await agent(["append", "Learnings/coder/Apfel zerfällt im Container.md", "--vault", root, "--name", "coder", "--ticket", "T-1", "--inhalt", "b"])).code).toBe(EXIT.limit);
    expect(await readdir(join(root, "Learnings", "coder"))).toHaveLength(2);
    // Another ticket has its own three, and "#T-1" is the same ticket as "T-1".
    expect((await create(root, "Kubernetes Probe schlägt fehl", [], "T-2")).code).toBe(EXIT.ok);
    expect((await create(root, "Postgres Migration hängt", [], "#T-1")).code).toBe(EXIT.limit);
    expect(WRITE_LIMIT_PER_TICKET).toBe(3);
  });

  test("the counter lives in the vault state next to the other agent data", async () => {
    const root = await learningVault();
    await create(root, "Apfel zerfällt im Container", [], "T-state");
    expect(await readdir(join(root, ".bloommd", "ticket-writes", "T-state"))).toEqual(["1.json"]);
    const slot = JSON.parse(await readFile(join(root, ".bloommd", "ticket-writes", "T-state", "1.json"), "utf8"));
    expect(slot).toMatchObject({ befehl: "create", agent: "coder", modus: "geschrieben" });
  });

  test("parallel calls in one process never exceed three writes", async () => {
    const root = await learningVault();
    const titles = ["Apfel zerfällt im Container", "Docker Socket verweigert Zugriff", "Kubernetes Probe schlägt fehl", "Postgres Migration hängt", "Zertifikat im Ingress abgelaufen", "Bun Lockfile inkompatibel", "Redis Verbindung bricht ab", "Nginx Upload zu groß"];
    const { result: codes, out } = await capture(() =>
      Promise.all(titles.map((title) => runLearningCommand("create", ["--vault", root, "--name", "coder", "--ticket", "T-par", "--titel", title, "--rolle", "coder", "--beleg", "https://example.org/p", "--inhalt", "x"], learningDeps))),
    );
    expect(codes.filter((code) => code === EXIT.ok)).toHaveLength(3);
    expect(codes.filter((code) => code === EXIT.limit)).toHaveLength(5);
    expect(out.filter((line) => (JSON.parse(line) as { ok?: boolean }).ok)).toHaveLength(3);
    expect(await readdir(join(root, "Learnings", "coder"))).toHaveLength(3);
  });

  test("parallel processes never exceed three writes", async () => {
    const root = await learningVault();
    const titles = ["Apfel zerfällt im Container", "Docker Socket verweigert Zugriff", "Kubernetes Probe schlägt fehl", "Postgres Migration hängt", "Zertifikat im Ingress abgelaufen", "Bun Lockfile inkompatibel"];
    const results = await Promise.all(
      titles.map(
        (title) =>
          new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
            const child = spawn("bun", [join(import.meta.dir, "cli.ts"), "agent", "create", "--vault", root, "--name", "coder", "--ticket", "T-proc", "--titel", title, "--rolle", "coder", "--beleg", "https://example.org/p", "--inhalt", "x"], { stdio: ["ignore", "pipe", "ignore"] });
            let stdout = "";
            child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
            child.on("error", reject);
            child.on("close", (code) => resolve({ code, stdout }));
          }),
      ),
    );
    expect(results.filter((entry) => entry.code === EXIT.ok)).toHaveLength(3);
    expect(results.filter((entry) => entry.code === EXIT.limit)).toHaveLength(3);
    for (const entry of results) expect(() => JSON.parse(entry.stdout)).not.toThrow();
    expect(await readdir(join(root, "Learnings", "coder"))).toHaveLength(3);
  }, 60_000);

  test("two parallel creates of the same title yield one learning and one duplicate", async () => {
    const root = await learningVault();
    const args = (ticket: string) => ["--vault", root, "--name", "coder", "--ticket", ticket, "--titel", "Gleicher Titel zweimal", "--rolle", "coder", "--beleg", "https://example.org/p", "--inhalt", "x"];
    const { result: codes } = await capture(() => Promise.all([runLearningCommand("create", args("T-a"), learningDeps), runLearningCommand("create", args("T-b"), learningDeps)]));
    expect(codes.sort()).toEqual([EXIT.ok, EXIT.duplicate]);
    expect(await readdir(join(root, "Learnings", "coder"))).toHaveLength(1);
  });
});

describe("rights of the agent (gate)", () => {
  test("in a propose area create and append become proposals; nothing is written and the agent cannot approve", async () => {
    const root = await learningVault("propose");
    const run = await create(root, "Apfel zerfällt im Container");
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ ok: true, modus: "vorgeschlagen", status: "neu", schreibvorgang: 1 });
    expect(run.json.vorschlag).toBeString();
    expect(run.json.hinweis).toContain("Mensch");
    await expect(readFile(join(root, run.json.pfad), "utf8")).rejects.toThrow();
    // A person approves with the existing owner command; only then the learning exists.
    const proposals = new KnowledgeService(new VaultKnowledgeStore(root), "Owner");
    await proposals.applyProposal(run.json.vorschlag, "Max");
    expect(await readFile(join(root, run.json.pfad), "utf8")).toContain("Apfel zerfällt im Container");
    const append = await agent(["append", run.json.pfad, "--vault", root, "--name", "tester", "--ticket", "113", "--inhalt", "Noch ein Fall"]);
    expect(append.json).toMatchObject({ ok: true, modus: "vorgeschlagen" });
    expect(await readFile(join(root, run.json.pfad), "utf8")).not.toContain("Noch ein Fall");
    // The commands offer no way to approve or to force.
    for (const flag of ["--approve", "--apply", "--force", "--overwrite"]) {
      expect((await create(root, "Anderes Thema im Cluster", [flag])).code).toBe(EXIT.usage);
    }
  });

  test("a read-only agent can search and read but is refused when writing, and the refusal keeps the slot free", async () => {
    const root = await learningVault("write");
    await create(root, "Apfel zerfällt im Container");
    await writeAccessConfig(join(root, ".bloommd"), { access: "read", areas: {} });
    expect((await agent(["search", "Apfel", "--vault", root, "--name", "tester"])).json.anzahl).toBe(1);
    expect((await agent(["read", "Learnings/coder/Apfel zerfällt im Container.md", "--vault", root, "--name", "tester"])).code).toBe(EXIT.ok);
    for (let index = 0; index < 4; index += 1) {
      const refused = await create(root, `Docker Socket verweigert Zugriff ${index}x`, [], "T-ro");
      expect(refused.code).toBe(EXIT.error);
      expect(refused.json.fehler).toContain("may only read");
    }
    const refusedAppend = await agent(["append", "Learnings/coder/Apfel zerfällt im Container.md", "--vault", root, "--name", "tester", "--ticket", "T-ro", "--inhalt", "x"]);
    expect(refusedAppend.code).toBe(EXIT.error);
    await writeAccessConfig(join(root, ".bloommd"), { access: "read", areas: { Learnings: "write" } });
    expect((await create(root, "Postgres Migration hängt", [], "T-ro")).code).toBe(EXIT.ok);
  });
});

describe("agent stale", () => {
  test("lists expired and soon expiring learnings as JSON, most overdue first", async () => {
    const root = await learningVault();
    await learningFile(root, "Learnings/coder/Alt.md", { title: "Alt", staleAfter: PAST, scope: "BloomMD, coder" });
    await learningFile(root, "Learnings/coder/Neu.md", { title: "Neu", staleAfter: FUTURE });
    const soon = addDays(new Date().toISOString().slice(0, 10), 5);
    await learningFile(root, "Learnings/coder/Bald.md", { title: "Bald", staleAfter: soon });
    await mkdir(join(root, "Schule"), { recursive: true });
    await writeFile(join(root, "Schule", "Alt.md"), "---\nstale_after: 2020-01-01\n---\n# Alt\n", "utf8");
    const now = await agent(["stale", "--vault", root]);
    expect(now.code).toBe(EXIT.ok);
    expect(now.json).toMatchObject({ anzahl: 1, tage: 0 });
    expect(now.json.stale[0]).toMatchObject({ pfad: "Learnings/coder/Alt.md", titel: "Alt", status: "neu", stale_after: PAST, abgelaufen: true, scope: "BloomMD, coder" });
    expect(now.json.stale[0].tage_ueberfaellig).toBeGreaterThan(1000);
    const week = await agent(["stale", "--vault", root, "--days", "7"]);
    expect(week.json.stale.map((entry: { pfad: string }) => entry.pfad)).toEqual(["Learnings/coder/Alt.md", "Learnings/coder/Bald.md"]);
    expect(week.json.stale[1]).toMatchObject({ abgelaufen: false, tage_ueberfaellig: -5 });
    expect((await agent(["stale", "--vault", root, "--days", "-1"])).code).toBe(EXIT.usage);
    expect((await agent(["stale", "--vault", root, "--days", "x"])).code).toBe(EXIT.usage);
    // Nothing to check is an empty list as JSON, not NO_REPLY.
    const empty = await agent(["stale", "--vault", await learningVault()]);
    expect(empty.json).toEqual({ stale: [], anzahl: 0, tage: 0 });
  });

  test("the plain-text form for routines stays as it was", async () => {
    const root = await learningVault();
    const run = await agent(["stale", root]);
    expect(run.code).toBe(0);
    expect(run.out).toEqual(["NO_REPLY"]);
    await learningFile(root, "Learnings/coder/Alt.md", { title: "Alt", staleAfter: PAST });
    expect((await agent(["stale", root])).out[0]).toContain("BloomMD-Maps zur Prüfung");
    expect((await agent(["stale", "--vault", root])).json.anzahl).toBe(1);
  });
});

describe("agent search --status", () => {
  async function statuses() {
    const root = await learningVault();
    await learningFile(root, "Learnings/coder/Neu.md", { title: "Lockfile neu", status: "neu", staleAfter: FUTURE });
    await learningFile(root, "Learnings/coder/Bestaetigt.md", { title: "Lockfile bestätigt", status: "bestätigt", staleAfter: FUTURE });
    await learningFile(root, "Learnings/coder/Bestaetigt abgelaufen.md", { title: "Lockfile bestätigt abgelaufen", status: "bestätigt", staleAfter: PAST });
    await learningFile(root, "Learnings/coder/Verworfen.md", { title: "Lockfile verworfen", status: "verworfen", staleAfter: FUTURE });
    await learningFile(root, "Learnings/coder/Veraltet.md", { title: "Lockfile veraltet", status: "veraltet", staleAfter: FUTURE });
    await learningFile(root, "Learnings/coder/Unbestaetigt.md", { title: "Lockfile unbestätigt", status: "unbestätigt", staleAfter: FUTURE });
    return root;
  }
  const names = (run: Run) => run.json.treffer.map((hit: { pfad: string }) => hit.pfad.replace("Learnings/coder/", "").replace(".md", "")).sort();

  test("an exact status filter, in any case and with bestaetigt, wins over the exclusion of expired and retired ones", async () => {
    const root = await statuses();
    for (const word of ["bestätigt", "BESTÄTIGT", "Bestaetigt", "bestaetigt"]) {
      const run = await agent(["search", "Lockfile", "--status", word, "--vault", root, "--name", "tester"]);
      expect(run.code).toBe(EXIT.ok);
      expect(names(run)).toEqual(["Bestaetigt", "Bestaetigt abgelaufen"]);
      expect(run.json.treffer.every((hit: { status: string }) => hit.status === "bestätigt")).toBe(true);
    }
    expect(names(await agent(["search", "Lockfile", "--status", "verworfen", "--vault", root]))).toEqual(["Verworfen"]);
    expect(names(await agent(["search", "Lockfile", "--status", "veraltet", "--vault", root]))).toEqual(["Veraltet"]);
    expect(names(await agent(["search", "Lockfile", "--status", "neu", "--vault", root]))).toEqual(["Neu"]);
    expect(names(await agent(["search", "Lockfile", "--status", "unbestätigt", "--vault", root]))).toEqual(["Unbestaetigt"]);
  });

  test("with a status filter the search text may be missing; it still narrows when given", async () => {
    const root = await statuses();
    const run = await agent(["search", "--status", "bestätigt", "--vault", root]);
    expect(run.code).toBe(EXIT.ok);
    expect(names(run)).toEqual(["Bestaetigt", "Bestaetigt abgelaufen"]);
    expect(run.json.treffer[0].auszug).toContain("status: bestätigt");
    expect(names(await agent(["search", "abgelaufen", "--status", "bestätigt", "--vault", root]))).toEqual(["Bestaetigt abgelaufen"]);
    const without = await agent(["search", "--vault", root]);
    expect(without.code).toBe(EXIT.usage);
    expect(without.json.fehler).toContain("--status");
  });

  test("without --status nothing changes: neu and unbestätigt are found, verworfen and veraltet are not (no default of only bestätigt)", async () => {
    const root = await statuses();
    expect(names(await agent(["search", "Lockfile", "--limit", "50", "--vault", root]))).toEqual(["Bestaetigt", "Neu", "Unbestaetigt"]);
    expect(names(await agent(["search", "Lockfile", "--limit", "50", "--include-stale", "--vault", root]))).toEqual(["Bestaetigt", "Bestaetigt abgelaufen", "Neu", "Unbestaetigt", "Veraltet", "Verworfen"]);
  });

  test("an unknown status is exit 2", async () => {
    const root = await statuses();
    const run = await agent(["search", "Lockfile", "--status", "stable", "--vault", root]);
    expect(run.code).toBe(EXIT.usage);
    expect(run.json.fehler).toContain("--status erwartet neu, bestätigt, veraltet, ersetzt, unbestätigt, verworfen");
    expect((await agent(["search", "Lockfile", "--status", "--vault", root])).code).toBe(EXIT.usage);
  });
});

describe("agent decide", () => {
  const NOW = new Date("2026-10-31T10:00:00Z");
  const deps: LearningDeps = { ...learningDeps, now: () => NOW };
  const PFAD = "Learnings/coder/Fall.md";
  const decide = (root: string, extra: string[] = [], path = PFAD) =>
    agent(["decide", path, "--vault", root, "--name", "chief-of-staff", "--grund", "Zweiter Vorfall belegt die Regel.", "--quelle", "https://github.com/moellenbeck-digital/BloomMD/issues/176", ...extra], deps);

  async function seeded(status = "neu", access: Access = "write") {
    const root = await learningVault(access);
    await learningFile(root, PFAD, { title: "Fall", status, staleAfter: "2026-12-01", created: "2026-10-26" });
    return root;
  }
  const markdown = (root: string, path = PFAD) => readFile(join(root, path), "utf8");

  test("neu → bestätigt: sets status, appends verified, renews stale_after by 90 days and adds the node Entscheidung", async () => {
    const root = await seeded();
    const run = await decide(root, ["--entscheid", "bestaetigt"]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.out).toHaveLength(1);
    expect(run.json).toMatchObject({ ok: true, pfad: PFAD, modus: "geschrieben", entscheid: "bestätigt", vorher: "neu", status: "bestätigt", verified: { by: "chief-of-staff", at: "2026-10-31" }, stale_after: addDays("2026-10-31", 90) });
    expect(run.json.aenderung).toBeTruthy();
    const text = await markdown(root);
    expect(text).toContain('status: "bestätigt"');
    expect(text).toMatch(new RegExp(`stale_after: "?${addDays("2026-10-31", 90)}"?`));
    expect(text).toMatch(/verified:\s+- by: "?chief-of-staff"?\s+at: "?2026-10-31"?/);
    expect(text).toMatch(/## Entscheidung/);
    for (const line of ["- Datum: 2026-10-31", "- Entscheid: bestätigt", "- Grund: Zweiter Vorfall belegt die Regel.", "- Quelle: https://github.com/moellenbeck-digital/BloomMD/issues/176", "- Wer: chief-of-staff"]) expect(text).toContain(line);
    // The result is found by the status filter of the preflight.
    const found = await agent(["search", "--status", "bestätigt", "--vault", root]);
    expect(found.json.treffer.map((hit: { pfad: string }) => hit.pfad)).toEqual([PFAD]);
    expect(found.json.treffer[0]).toMatchObject({ status: "bestätigt", stale_after: addDays("2026-10-31", 90), abgelaufen: false });
  });

  test("neu, unbestätigt and bestätigt → verworfen: status and verified, stale_after stays", async () => {
    for (const from of ["neu", "unbestätigt", "bestätigt"]) {
      const root = await seeded(from);
      const run = await decide(root, ["--entscheid", "verworfen"]);
      expect(run.code).toBe(EXIT.ok);
      expect(run.json).toMatchObject({ ok: true, entscheid: "verworfen", vorher: from, status: "verworfen", verified: { by: "chief-of-staff", at: "2026-10-31" } });
      expect(run.json).not.toHaveProperty("stale_after");
      const text = await markdown(root);
      expect(text).toContain('status: "verworfen"');
      expect(text).toContain("stale_after: 2026-12-01");
      expect(text).toContain("- Entscheid: verworfen");
      // Retired now: the default search no longer finds it, the status filter does.
      expect((await agent(["search", "Fall", "--vault", root])).json.anzahl).toBe(0);
      expect((await agent(["search", "--status", "verworfen", "--vault", root])).json.anzahl).toBe(1);
    }
  });

  test("every other transition is exit 2 with a clear message and writes nothing", async () => {
    const cases: Array<[string, string, string]> = [
      ["unbestätigt", "bestaetigt", "bleibt unbestätigt"],
      ["bestätigt", "bestaetigt", "schon bestätigt"],
      ["veraltet", "bestaetigt", "ausgemustert"],
      ["veraltet", "verworfen", "ausgemustert"],
      ["ersetzt", "bestaetigt", "ausgemustert"],
      ["ersetzt", "verworfen", "ausgemustert"],
      ["verworfen", "bestaetigt", "ausgemustert"],
      ["verworfen", "verworfen", "ausgemustert"],
    ];
    for (const [from, to, hint] of cases) {
      const root = await seeded(from);
      const before = await markdown(root);
      const run = await decide(root, ["--entscheid", to]);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toContain(`Status „${from}“`);
      expect(run.json.fehler).toContain(hint);
      expect(run.json.fehler).toContain("Nichts geschrieben");
      expect(run.err).toContain(run.json.fehler);
      expect(await markdown(root)).toBe(before);
      expect((await agent(["log", root])).json.changes).toEqual([]);
    }
  });

  test("a learning without status is refused; the status word is read in any case", async () => {
    const root = await learningVault();
    await mkdir(join(root, "Learnings", "coder"), { recursive: true });
    await writeFile(join(root, PFAD), "---\ntype: learning\ntitle: Fall\n---\n\n# Fall\n\n## Regel\n\nx\n", "utf8");
    const run = await decide(root, ["--entscheid", "verworfen"]);
    expect(run.code).toBe(EXIT.usage);
    expect(run.json.fehler).toContain("ohne Status");
    const upper = await seeded("NEU");
    expect((await decide(upper, ["--entscheid", "VERWORFEN"])).code).toBe(EXIT.ok);
  });

  test("--grund, --quelle and --name are required, --entscheid must be bestaetigt or verworfen, there is no --ticket", async () => {
    const root = await seeded();
    const full = ["decide", PFAD, "--vault", root, "--name", "chief-of-staff", "--entscheid", "verworfen", "--grund", "g", "--quelle", "q"];
    expect((await agent(full, deps)).code).toBe(EXIT.ok);
    const fresh = await seeded();
    const without = (flag: string) => {
      const index = full.indexOf(flag);
      return full.map((value, position) => (position === 3 ? fresh : value)).filter((_, position) => position !== index && position !== index + 1);
    };
    for (const flag of ["--grund", "--quelle", "--name", "--entscheid"]) {
      const run = await agent(without(flag), deps);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toContain(flag);
    }
    for (const bad of ["neu", "veraltet", "ersetzt", "unbestaetigt", "stable", ""]) {
      expect((await agent(["decide", PFAD, "--vault", fresh, "--name", "x", "--entscheid", bad, "--grund", "g", "--quelle", "q"], deps)).code).toBe(EXIT.usage);
    }
    expect((await agent(["decide", PFAD, "--vault", fresh, "--name", "x", "--entscheid", "verworfen", "--grund", "g", "--quelle", "q", "--ticket", "176"], deps)).code).toBe(EXIT.usage);
    expect((await agent(["decide", "--vault", fresh, "--name", "x", "--entscheid", "verworfen", "--grund", "g", "--quelle", "q"], deps)).code).toBe(EXIT.usage);
    expect((await agent(["decide", PFAD, "--grund", "g", "--quelle", "q", "--name", "x", "--entscheid", "verworfen"], deps)).code).toBe(EXIT.usage);
    expect(await markdown(fresh)).toContain("status: neu");
  });

  test("a path outside Learnings or a missing learning is refused", async () => {
    const root = await seeded();
    await mkdir(join(root, "Schule"), { recursive: true });
    await writeFile(join(root, "Schule", "Privat.md"), "---\nstatus: neu\n---\n# Privat\n", "utf8");
    const outside = await decide(root, ["--entscheid", "verworfen"], "Schule/Privat.md");
    expect(outside.code).toBe(EXIT.usage);
    expect(await readFile(join(root, "Schule", "Privat.md"), "utf8")).toContain("status: neu");
    expect((await decide(root, ["--entscheid", "verworfen"], "Learnings/coder/Gibt es nicht.md")).code).toBe(EXIT.error);
    expect((await decide(root, ["--entscheid", "verworfen"], "../x.md")).code).toBe(EXIT.usage);
  });

  test("it is no ticket write: no counter, any number of decisions; the entry is in the log and undo takes it back", async () => {
    const root = await learningVault();
    for (const name of ["Eins", "Zwei", "Drei", "Vier", "Fuenf"]) await learningFile(root, `Learnings/coder/${name}.md`, { title: name, status: "neu", staleAfter: "2026-12-01" });
    for (const name of ["Eins", "Zwei", "Drei", "Vier", "Fuenf"]) expect((await decide(root, ["--entscheid", "bestaetigt"], `Learnings/coder/${name}.md`)).code).toBe(EXIT.ok);
    expect((await readdir(join(root, ".bloommd"))).includes("ticket-writes")).toBe(false);
    const log = (await agent(["log", root])).json.changes as Array<{ changeId: string; path: string; reason?: string; source?: string }>;
    expect(log).toHaveLength(5);
    expect(log[0]!.reason).toContain("Entscheidung bestätigt");
    expect(log[0]!.source).toContain("issues/176");
    const target = log.find((entry) => entry.path.endsWith("Eins.md"))!;
    const undone = await agent(["undo", root, target.changeId]);
    expect(undone.code).toBe(EXIT.ok);
    const text = await markdown(root, "Learnings/coder/Eins.md");
    expect(text).toContain("status: neu");
    expect(text).not.toContain("Entscheidung");
    expect(text).not.toContain("chief-of-staff");
    expect(await markdown(root, "Learnings/coder/Zwei.md")).toContain('status: "bestätigt"');
  });

  test("a deciding agent with propose rights only files a proposal", async () => {
    const root = await seeded("neu", "propose");
    const before = await markdown(root);
    const run = await decide(root, ["--entscheid", "bestaetigt"]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ ok: true, modus: "vorgeschlagen" });
    expect(run.json.vorschlag).toBeTruthy();
    expect(await markdown(root)).toBe(before);
    const readOnly = await seeded("neu", "read");
    expect((await decide(readOnly, ["--entscheid", "bestaetigt"])).code).toBe(EXIT.error);
  });

  test("--help and the usage list decide", async () => {
    const run = await agent(["decide", "--help"]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.out[0]).toContain("bloommd-wiki agent decide");
    expect(run.out[0]).toContain("unbestätigt → bestätigt");
    expect(AGENT_USAGE).toContain("agent decide <pfad> --entscheid");
  });
});

describe("agent review", () => {
  const NOW = new Date("2026-10-31T10:00:00Z");
  const deps: LearningDeps = { ...learningDeps, now: () => NOW };
  const review = (root: string, extra: string[] = []) => agent(["review", "--vault", root, ...extra], deps);

  async function seeded() {
    const root = await learningVault();
    await learningFile(root, "Learnings/tester/Alt neu.md", { title: "Lint nur über cli.ts", tags: ["tester", "lint"], status: "neu", staleAfter: FUTURE, created: "2026-10-01", beleg: "https://github.com/moellenbeck-digital/BloomMD/pull/159" });
    await learningFile(root, "Learnings/coder/Jung neu.md", { title: "Playwright Browser nachinstallieren", tags: ["coder", "playwright"], status: "neu", staleAfter: FUTURE, created: "2026-10-29", beleg: "https://github.com/moellenbeck-digital/BloomMD/pull/141" });
    await learningFile(root, "Learnings/coder/Mitte neu.md", { title: "Postgres Healthcheck im CI", tags: ["coder", "ci"], status: "neu", staleAfter: FUTURE, created: "2026-10-20" });
    await learningFile(root, "Learnings/architect/Bestaetigt.md", { title: "Ticket zuschneiden", tags: ["architect"], status: "bestätigt", staleAfter: "2026-10-10", created: "2026-09-01", beleg: "https://example.org/b" });
    await learningFile(root, "Learnings/architect/Bald.md", { title: "Worktree aufräumen", tags: ["architect", "git"], status: "unbestätigt", staleAfter: "2026-11-05", created: "2026-10-02" });
    await learningFile(root, "Learnings/architect/Spaeter.md", { title: "Branch benennen", tags: ["architect", "git"], status: "bestätigt", staleAfter: "2026-12-31", created: "2026-10-02" });
    return root;
  }

  test("(a) lists all neu learnings, oldest first, with path, title, age in days and evidence link", async () => {
    const root = await seeded();
    const run = await review(root);
    expect(run.code).toBe(EXIT.ok);
    expect(run.err).toBe("");
    const text = run.out.join("\n");
    expect(run.out).toHaveLength(1);
    expect(text).toContain("Learnings-Review 2026-10-31");
    expect(text).toContain("Status neu (3)");
    const lines = text.split("\n").filter((line) => line.startsWith("• Learnings/") && line.includes(" – "));
    expect(lines.slice(0, 3)).toEqual([
      "• Learnings/tester/Alt neu.md – Lint nur über cli.ts – 30 Tage – https://github.com/moellenbeck-digital/BloomMD/pull/159",
      "• Learnings/coder/Mitte neu.md – Postgres Healthcheck im CI – 11 Tage – kein Beleg-Link",
      "• Learnings/coder/Jung neu.md – Playwright Browser nachinstallieren – 2 Tage – https://github.com/moellenbeck-digital/BloomMD/pull/141",
    ]);
    expect(text).toContain("agent decide <pfad> --entscheid bestaetigt|verworfen");
    // Only neu is listed there; the others are not.
    expect(text.split("Abgelaufen")[0]).not.toContain("Bestaetigt.md");
  });

  test("(b) lists expired and soon expiring learnings with the logic of agent stale and --days", async () => {
    const root = await seeded();
    const text = (await review(root)).out.join("\n");
    expect(text).toContain("Abgelaufen (1):");
    expect(text).toContain("• Ticket zuschneiden – Learnings/architect/Bestaetigt.md, bestätigt, seit 2026-10-10 (21 Tage überfällig)");
    expect(text).toContain("Läuft in den nächsten 14 Tagen ab (1):");
    expect(text).toContain("• Worktree aufräumen – Learnings/architect/Bald.md, unbestätigt, läuft ab 2026-11-05");
    expect(text).not.toContain("Branch benennen");
    const short = (await review(root, ["--days", "3"])).out.join("\n");
    expect(short).toContain("Abgelaufen (1):");
    expect(short).not.toContain("Läuft in den nächsten");
    const wide = (await review(root, ["--days", "61"])).out.join("\n");
    expect(wide).toContain("Läuft in den nächsten 61 Tagen ab (2):");
    expect(wide).toContain("Branch benennen");
    // Same set as agent stale.
    const stale = (await agent(["stale", "--vault", root, "--days", "14"])).json.stale.map((entry: { pfad: string }) => entry.pfad).sort();
    expect(stale).toEqual(["Learnings/architect/Bald.md", "Learnings/architect/Bestaetigt.md"]);
  });

  test("(c) lists duplicate candidates among learnings that are not retired", async () => {
    const root = await seeded();
    await learningFile(root, "Learnings/tester/Lint zweiter.md", { title: "Lint nur über cli.ts prüfen", tags: ["tester", "lint"], status: "unbestätigt", staleAfter: FUTURE, created: "2026-10-30" });
    await learningFile(root, "Learnings/tester/Lint verworfen.md", { title: "Lint nur über cli.ts", tags: ["tester", "lint"], status: "verworfen", staleAfter: FUTURE, created: "2026-10-30" });
    await learningFile(root, "Learnings/tester/Lint veraltet.md", { title: "Lint nur über cli.ts", tags: ["tester", "lint"], status: "veraltet", staleAfter: FUTURE, created: "2026-10-30" });
    await learningFile(root, "Learnings/tester/Lint ersetzt.md", { title: "Lint nur über cli.ts", tags: ["tester", "lint"], status: "ersetzt", staleAfter: FUTURE, created: "2026-10-30" });
    const text = (await review(root)).out.join("\n");
    const duplicates = text.split("Duplikat-Kandidaten")[1]!;
    expect(duplicates).toContain(`(1), Ähnlichkeit ab ${DUPLICATE_THRESHOLD}`);
    expect(duplicates).toContain("Lint nur über cli.ts ↔ Lint nur über cli.ts prüfen");
    expect(duplicates).toContain("Learnings/tester/Alt neu.md | Learnings/tester/Lint zweiter.md");
    for (const retired of ["verworfen", "veraltet", "ersetzt"]) expect(duplicates).not.toContain(`Lint ${retired}.md`);
    // Retired learnings are not listed under neu either.
    expect(text).toContain("Status neu (3)");
  });

  test("a learning that is no longer neu leaves the list; decided ones do not come back", async () => {
    const root = await seeded();
    expect((await agent(["decide", "Learnings/tester/Alt neu.md", "--vault", root, "--name", "cos", "--entscheid", "bestaetigt", "--grund", "g", "--quelle", "q"], deps)).code).toBe(EXIT.ok);
    const text = (await review(root)).out.join("\n");
    expect(text).toContain("Status neu (2)");
    expect(text.split("Abgelaufen")[0]).not.toContain("Alt neu.md");
  });

  test("nothing to report is exactly NO_REPLY; only Learnings is looked at; it writes nothing", async () => {
    const root = await learningVault();
    expect((await review(root)).out).toEqual(["NO_REPLY"]);
    await learningFile(root, "Learnings/coder/Fest.md", { title: "Fest", status: "bestätigt", staleAfter: FUTURE, created: "2026-10-01" });
    await mkdir(join(root, "Schule"), { recursive: true });
    await writeFile(join(root, "Schule", "Privat.md"), "---\nstatus: neu\nstale_after: 2020-01-01\n---\n# Privat\n", "utf8");
    const before = await readFile(join(root, "Learnings/coder/Fest.md"), "utf8");
    const run = await review(root);
    expect(run).toMatchObject({ code: EXIT.ok, out: ["NO_REPLY"] });
    expect(await readFile(join(root, "Learnings/coder/Fest.md"), "utf8")).toBe(before);
    expect((await agent(["log", root])).json.changes).toEqual([]);
  });

  test("(b) leaves out retired learnings (veraltet, ersetzt, verworfen), agent stale itself stays as it was", async () => {
    const root = await learningVault();
    await learningFile(root, "Learnings/coder/Abgelaufen.md", { title: "Abgelaufen bestätigt", status: "bestätigt", staleAfter: PAST, created: "2026-01-01" });
    for (const status of ["veraltet", "ersetzt", "verworfen"]) {
      await learningFile(root, `Learnings/coder/${status}.md`, { title: `Ausgemustert ${status}`, tags: ["coder", status], status, staleAfter: PAST, created: "2026-01-01" });
    }
    const text = (await review(root)).out.join("\n");
    expect(text).toContain("Abgelaufen (1):");
    expect(text).toContain("Learnings/coder/Abgelaufen.md");
    for (const status of ["veraltet", "ersetzt", "verworfen"]) expect(text).not.toContain(`Learnings/coder/${status}.md`);
    expect((await agent(["stale", "--vault", root])).json.anzahl).toBe(4);
    // Only retired learnings, all expired: nothing to report.
    const quiet = await learningVault();
    await learningFile(quiet, "Learnings/coder/Alt.md", { title: "Alt", status: "verworfen", staleAfter: PAST });
    expect((await review(quiet)).out).toEqual(["NO_REPLY"]);
  });

  async function newLearnings(root: string, count: number, created: string, offset = 0) {
    for (let index = 0; index < count; index += 1) {
      const number = offset + index;
      await learningFile(root, `Learnings/coder/Thema ${number}.md`, { title: `Thema Nummer ${number} ganz eigen${"x".repeat(number)}`, tags: ["coder", `thema${number}`], status: "neu", staleAfter: FUTURE, created });
    }
  }

  test("(e) more than 10 neu learnings from the last 7 days make a quality line; exactly 10 do not", async () => {
    const eleven = await learningVault();
    await newLearnings(eleven, 11, "2026-10-28");
    const text = (await review(eleven)).out.join("\n");
    expect(text.split("\n")[1]).toBe("Qualitätsmeldung: 11 neue Learnings ohne Bestätigung");
    expect(text).toContain("Status neu (11)");
    const ten = await learningVault();
    await newLearnings(ten, 10, "2026-10-28");
    const quiet = (await review(ten)).out.join("\n");
    expect(quiet).not.toContain("Qualitätsmeldung");
    expect(quiet).toContain("Status neu (10)");
  });

  test("(e) counts only neu learnings created within 7 days of today", async () => {
    const root = await learningVault();
    await newLearnings(root, 10, "2026-10-24");
    await newLearnings(root, 5, "2026-10-23", 10);
    await newLearnings(root, 5, "2026-10-01", 15);
    let text = (await review(root)).out.join("\n");
    // created 2026-10-24 is exactly 7 days back and counts; 2026-10-23 and older do not.
    expect(text).not.toContain("Qualitätsmeldung");
    await newLearnings(root, 1, "2026-10-31", 20);
    text = (await review(root)).out.join("\n");
    expect(text).toContain("Qualitätsmeldung: 11 neue Learnings ohne Bestätigung");
    // Learnings of other statuses are not counted.
    const other = await learningVault();
    await newLearnings(other, 10, "2026-10-30");
    for (let index = 0; index < 5; index += 1) await learningFile(other, `Learnings/coder/Fest ${index}.md`, { title: `Fester Fall ${index} völlig anders${"y".repeat(index)}`, tags: ["coder", `fest${index}`], status: "bestätigt", staleAfter: FUTURE, created: "2026-10-30" });
    expect((await review(other)).out.join("\n")).not.toContain("Qualitätsmeldung");
  });

  test("--json has the same data; with nothing to report it is no NO_REPLY but empty lists", async () => {
    const root = await seeded();
    await learningFile(root, "Learnings/tester/Lint zweiter.md", { title: "Lint nur über cli.ts prüfen", tags: ["tester", "lint"], status: "unbestätigt", staleAfter: FUTURE, created: "2026-10-30" });
    const run = await review(root, ["--json"]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.out).toHaveLength(1);
    expect(run.json).toMatchObject({ datum: "2026-10-31", befund: true, tage: 14, qualitaet: { neu_letzte_7_tage: 1, grenze: 10, meldung: null } });
    expect(run.json.neu).toEqual([
      { pfad: "Learnings/tester/Alt neu.md", titel: "Lint nur über cli.ts", alter_tage: 30, beleg: "https://github.com/moellenbeck-digital/BloomMD/pull/159" },
      { pfad: "Learnings/coder/Mitte neu.md", titel: "Postgres Healthcheck im CI", alter_tage: 11, beleg: null },
      { pfad: "Learnings/coder/Jung neu.md", titel: "Playwright Browser nachinstallieren", alter_tage: 2, beleg: "https://github.com/moellenbeck-digital/BloomMD/pull/141" },
    ]);
    expect(run.json.stale.map((entry: { pfad: string }) => entry.pfad)).toEqual(["Learnings/architect/Bestaetigt.md", "Learnings/architect/Bald.md"]);
    expect(run.json.stale[0]).toMatchObject({ status: "bestätigt", stale_after: "2026-10-10", tage_ueberfaellig: 21, abgelaufen: true });
    expect(run.json.duplikate).toEqual([{ a: { pfad: "Learnings/tester/Alt neu.md", titel: "Lint nur über cli.ts" }, b: { pfad: "Learnings/tester/Lint zweiter.md", titel: "Lint nur über cli.ts prüfen" }, aehnlichkeit: expect.any(Number) }]);
    expect(run.json.duplikate[0].aehnlichkeit).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
    const empty = await review(await learningVault(), ["--json"]);
    expect(empty.code).toBe(EXIT.ok);
    expect(empty.json).toMatchObject({ befund: false, neu: [], stale: [], duplikate: [], qualitaet: { neu_letzte_7_tage: 0, meldung: null } });
    const quality = await learningVault();
    await newLearnings(quality, 11, "2026-10-30");
    expect((await review(quality, ["--json"])).json.qualitaet).toEqual({ neu_letzte_7_tage: 11, grenze: 10, meldung: "Qualitätsmeldung: 11 neue Learnings ohne Bestätigung" });
  });

  test("scripts/learnings-review.sh runs agent review on LEARNINGS_VAULT and passes extra arguments", async () => {
    const script = join(import.meta.dir, "..", "..", "..", "scripts", "learnings-review.sh");
    const cli = join(import.meta.dir, "cli.ts");
    const run = (vault: string, args: string[] = []) => new Promise<{ code: number | null; out: string }>((resolve) => {
      const child = spawn("sh", [script, ...args], { env: { ...process.env, LEARNINGS_VAULT: vault, BLOOMMD_WIKI_BIN: `${process.execPath} ${cli}` } });
      let out = "";
      child.stdout.on("data", (chunk) => { out += String(chunk); });
      child.on("close", (code) => resolve({ code, out }));
    });
    const root = await learningVault();
    expect(await run(root)).toEqual({ code: 0, out: "NO_REPLY\n" });
    await learningFile(root, "Learnings/coder/Offen.md", { title: "Offen", status: "neu", staleAfter: FUTURE, created: "2026-10-01" });
    const text = await run(root);
    expect(text.code).toBe(0);
    expect(text.out).toContain("Status neu (1)");
    expect(text.out).toContain("Learnings/coder/Offen.md");
    expect(JSON.parse((await run(root, ["--json"])).out)).toMatchObject({ befund: true, neu: [{ pfad: "Learnings/coder/Offen.md" }] });
  });

  test("a wrong call is exit 2 with JSON on stdout; the help names the three parts", async () => {
    const root = await learningVault();
    for (const args of [["review"], ["review", "--vault", root, "--days", "-1"], ["review", "--vault", root, "--days", "x"], ["review", "--vault", root, "extra"], ["review", "--vault", root, "--cloud", "https://x.example"]]) {
      const run = await agent(args, deps);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toBeTruthy();
    }
    const help = await agent(["review", "--help"]);
    expect(help.code).toBe(EXIT.ok);
    expect(help.out[0]).toContain("bloommd-wiki agent review");
    expect(AGENT_USAGE).toContain("agent review");
  });
});

describe("help and usage", () => {
  test("--help per command prints text and exits 0; AGENT_USAGE lists the commands", async () => {
    for (const command of ["search", "read", "create", "append", "decide", "review", "stale"]) {
      const run = await agent([command, "--help"]);
      expect(run.code).toBe(EXIT.ok);
      expect(run.out[0]).toContain(`bloommd-wiki agent ${command}`);
      expect(AGENT_USAGE).toContain(`agent ${command}`);
    }
    expect(AGENT_USAGE).toContain("wissen/bloommd");
    expect(AGENT_USAGE).toContain("3 Duplikat");
    // The other owner commands are untouched.
    expect(AGENT_USAGE).toContain("agent approve <ziel> <id>");
  });
});
