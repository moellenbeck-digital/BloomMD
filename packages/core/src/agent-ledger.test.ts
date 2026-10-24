import { describe, expect, test } from "bun:test";
import {
  AgentLedger,
  AgentProposalConflictError,
  accessFor,
  isVaultNotePath,
  knowledgeVersion,
  outlineDiff,
  parseAccessConfig,
  vaultArea,
  type AgentDocuments,
  type AgentStateFiles,
} from "./agent-ledger";

/** In-memory state folder and notes, the way the Obsidian plugin's vault adapter behaves. */
function memoryTarget() {
  const state = new Map<string, string>();
  const notes = new Map<string, string>();
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
      if (expected === null ? current !== undefined : current === undefined || knowledgeVersion(current) !== expected) throw new Error(`${path} changed since it was read.`);
      notes.set(path, markdown);
      return { version: knowledgeVersion(markdown) };
    },
    remove: async (path) => void notes.delete(path),
  };
  return { state, notes, files, documents };
}

const MAP = "# Physik <!-- bloommd:id=root -->\n\n## Wärme <!-- bloommd:id=w -->\n\nArbeit.\n";
const NEXT = "# Physik <!-- bloommd:id=root -->\n\n## Wärme <!-- bloommd:id=w -->\n\nArbeit und Energie.\n\n## Optik <!-- bloommd:id=o -->\n";

describe("rights", () => {
  test("without or with a broken agent.json the agent only proposes; areas fold case, strictest wins", () => {
    expect(parseAccessConfig(null)).toEqual({ access: "propose", areas: {} });
    expect(parseAccessConfig("{oops")).toEqual({ access: "propose", areas: {} });
    const config = parseAccessConfig(JSON.stringify({ access: "write", areas: { Arbeit: "propose", arbeit: "read", Schule: "nope" } }));
    expect(config.areas).toEqual({ Arbeit: "propose", arbeit: "read" });
    expect(accessFor(config, "ARBEIT")).toBe("read");
    expect(accessFor(config, "Schule")).toBe("write");
  });

  test("note paths stay inside the vault", () => {
    expect(isVaultNotePath("Schule/Physik.md")).toBe(true);
    for (const bad of ["../x.md", ".obsidian/a.md", "a/.bloommd/x.md", "/abs.md", "Schule/bild.png", "a//b.md", "C:/x.md"]) expect(isVaultNotePath(bad)).toBe(false);
    expect(vaultArea("Schule/Physik/Optik.md")).toBe("Schule");
    expect(vaultArea("Top.md")).toBe("");
  });
});

describe("proposals", () => {
  test("approve writes the note, records an approved history entry, removes the proposal and logs the reviewer", async () => {
    const target = memoryTarget();
    target.notes.set("Schule/Physik.md", MAP);
    const agent = new AgentLedger(target.files, "OpenClaw", "vault");
    const id = await agent.propose({ tool: "bloommd_update_map", path: "Schule/Physik.md", area: "Schule", baseVersion: knowledgeVersion(MAP), markdown: NEXT, summary: "1 created", reason: "Unterricht" });
    const owner = new AgentLedger(target.files, "Max", "vault");
    const [proposal] = await owner.proposals();
    expect(proposal).toEqual(expect.objectContaining({ id, agent: "OpenClaw", reason: "Unterricht" }));
    const result = await owner.applyProposal(proposal!, "Max", target.documents);
    expect(target.notes.get("Schule/Physik.md")).toBe(NEXT);
    expect(await owner.proposals()).toEqual([]);
    const [entry] = await owner.history();
    expect(entry).toEqual(expect.objectContaining({ changeId: result.changeId, origin: "approved", tool: "bloommd_update_map (approved by Max)", before: MAP, afterVersion: knowledgeVersion(NEXT) }));
    expect((await owner.changes()).map((line) => [line.event, line.reviewer ?? null])).toEqual([["approved", "Max"], ["proposed", null]]);
  });

  test("a changed note is a conflict with the current text; overwriting is a deliberate choice", async () => {
    const target = memoryTarget();
    target.notes.set("Schule/Physik.md", MAP);
    const owner = new AgentLedger(target.files, "Max", "vault");
    await owner.propose({ tool: "bloommd_update_map", path: "Schule/Physik.md", area: "Schule", baseVersion: knowledgeVersion(MAP), markdown: NEXT, summary: "x" });
    target.notes.set("Schule/Physik.md", `${MAP}\nEdited by hand.\n`);
    const [proposal] = await owner.proposals();
    const conflict = await owner.applyProposal(proposal!, "Max", target.documents).catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(AgentProposalConflictError);
    expect((conflict as AgentProposalConflictError).current?.markdown).toContain("Edited by hand.");
    expect(target.notes.get("Schule/Physik.md")).toContain("Edited by hand.");
    await owner.applyProposal(proposal!, "Max", target.documents, { overwrite: true });
    expect(target.notes.get("Schule/Physik.md")).toBe(NEXT);
    expect((await owner.history())[0]?.before).toContain("Edited by hand.");
  });

  test("reject removes the proposal and logs reviewer and reason; unknown ids fail", async () => {
    const target = memoryTarget();
    const owner = new AgentLedger(target.files, "Max", "vault");
    const id = await owner.propose({ tool: "bloommd_create_map", path: "Arbeit/Neu.md", area: "Arbeit", baseVersion: null, markdown: "# Neu\n", summary: "new" });
    await owner.rejectProposal(id, "Max", "Gehört nach Projekte");
    expect(await owner.proposals()).toEqual([]);
    expect((await owner.changes(1))[0]).toEqual(expect.objectContaining({ event: "rejected", reviewer: "Max", reason: "Gehört nach Projekte" }));
    await expect(owner.rejectProposal(id, "Max")).rejects.toThrow(/not found/);
    await expect(owner.rejectProposal("../agent", "Max")).rejects.toThrow(/not found/);
  });
});

describe("undo", () => {
  test("the agent may undo only its own direct writes within its rights; the owner may undo anything", async () => {
    const target = memoryTarget();
    target.notes.set("Schule/Physik.md", NEXT);
    const agent = new AgentLedger(target.files, "OpenClaw", "vault");
    const owner = new AgentLedger(target.files, "Max", "vault");
    const options = { areaOf: vaultArea };
    const written = await agent.remember({ origin: "agent", tool: "bloommd_update_map", path: "Schule/Physik.md", before: MAP, afterVersion: knowledgeVersion(NEXT) });
    await owner.setRights({ access: "write", areas: { Schule: "read" } });
    await expect(agent.undo(written, target.documents, options)).rejects.toThrow(/may only read/);
    await owner.setRights({ access: "propose" });
    expect(await agent.undo(written, target.documents, options)).toEqual(expect.objectContaining({ proposed: expect.stringMatching(/^p/) }));
    expect(target.notes.get("Schule/Physik.md")).toBe(NEXT);
    await expect(new AgentLedger(target.files, "Other", "vault").undo(written, target.documents, options)).rejects.toThrow(/only the owner/);
    expect(await owner.undo(written, target.documents, { ...options, asOwner: true })).toEqual({ undone: written, path: "Schule/Physik.md" });
    expect(target.notes.get("Schule/Physik.md")).toBe(MAP);
    expect((await owner.changes(1))[0]).toEqual(expect.objectContaining({ event: "undone", by: "owner" }));
    await expect(owner.undo(written, target.documents, options)).rejects.toThrow(/not in the history/);
  });

  test("an edited note is not undone; a created note is removed", async () => {
    const target = memoryTarget();
    const owner = new AgentLedger(target.files, "Max", "vault");
    target.notes.set("Neu.md", "# Neu\n");
    const created = await owner.remember({ origin: "agent", tool: "bloommd_create_map", path: "Neu.md", before: null, afterVersion: knowledgeVersion("# Neu\n") });
    target.notes.set("Neu.md", "# Neu\n\nbearbeitet\n");
    await expect(owner.undo(created, target.documents, { asOwner: true, areaOf: vaultArea })).rejects.toThrow(/edited after change/);
    target.notes.set("Neu.md", "# Neu\n");
    await owner.undo(created, target.documents, { asOwner: true, areaOf: vaultArea });
    expect(target.notes.has("Neu.md")).toBe(false);
    await expect(owner.undo("../x", target.documents, { areaOf: vaultArea })).rejects.toThrow(/Unknown change id/);
  });

  test("history keeps the newest entries only", async () => {
    const target = memoryTarget();
    const ledger = new AgentLedger(target.files, "Max", "vault");
    for (let index = 0; index < 3; index += 1) await ledger.remember({ tool: "t", path: "a.md", before: "", afterVersion: "v" });
    expect((await ledger.history()).length).toBe(3);
  });
});

describe("requests", () => {
  test("a person asks about a node, the agent answers, the person removes it", async () => {
    const target = memoryTarget();
    const owner = new AgentLedger(target.files, "Max", "vault");
    await expect(owner.createRequest({ path: "Schule/Physik.md", question: "  " })).rejects.toThrow(/needs a question/);
    const request = await owner.createRequest({ path: "Schule/Physik.md", nodeId: "w", nodeTitle: "Wärme", question: "Erklär den 1. Hauptsatz" });
    expect(request).toEqual(expect.objectContaining({ status: "open", by: "Max", nodeId: "w" }));
    const agent = new AgentLedger(target.files, "OpenClaw", "vault");
    const answered = await agent.answerRequest(request.id, { answer: "ΔU = Q + W", proposalId: "pabc" });
    expect(answered).toEqual(expect.objectContaining({ status: "answered", agent: "OpenClaw", answer: "ΔU = Q + W", proposalId: "pabc" }));
    expect((await owner.requests())[0]?.status).toBe("answered");
    await owner.removeRequest(request.id);
    expect(await owner.requests()).toEqual([]);
    await expect(owner.request("x")).rejects.toThrow(/not found/);
  });
});

describe("outline diff", () => {
  test("lists added, changed and removed headings", () => {
    expect(outlineDiff(MAP, NEXT)).toEqual([{ mark: "~", id: "w", title: "Wärme", level: 2 }, { mark: "+", id: "o", title: "Optik", level: 2 }]);
    expect(outlineDiff(NEXT, MAP)).toEqual([{ mark: "~", id: "w", title: "Wärme", level: 2 }, { mark: "-", id: "o", title: "Optik", level: 2 }]);
    expect(outlineDiff(null, "# Neu\n").map((line) => line.mark)).toEqual(["+"]);
  });
});
