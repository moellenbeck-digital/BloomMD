import { applyWikiProposal, approveWikiProposal, parseWikiPage, readWikiBundle, validateWikiProposal, type WikiPage, type WikiProposal } from "@bloommd/core/wiki";
import { pageCitations } from "@bloommd/core/wiki-preview";
import {
  discardWikiProposal,
  isValidWikiProposalId,
  listOpenWikiProposals,
  loadWikiProposal,
  markWikiProposalApplied,
  toWikiProposal,
  WikiProposalStoreError,
  type WikiProposalRecord,
} from "@bloommd/core/wiki-proposals";
import { readFile } from "node:fs/promises";

/** Longest reason a reviewer may give when discarding; it ends up in the proposal file. */
export const MAX_DISCARD_REASON_LENGTH = 2000;

const PAGE_CHANGED_PREFIX = "Source changed since proposal creation: ";

export interface WikiProposalsConfig {
  proposalsDir: string;
  wikiDir: string;
}

/**
 * The proposal review feature is off unless `BLOOMMD_WIKI_PROPOSALS_DIR` is set. It also needs the
 * bundle the proposals apply to, so without `BLOOMMD_WIKI_DIR` it stays off as well.
 */
export function wikiProposalsConfig(env: Record<string, string | undefined> = process.env): WikiProposalsConfig | null {
  const proposalsDir = env.BLOOMMD_WIKI_PROPOSALS_DIR?.trim();
  const wikiDir = env.BLOOMMD_WIKI_DIR?.trim();
  return proposalsDir && wikiDir ? { proposalsDir, wikiDir } : null;
}

/** Name recorded for a decision: taken from the session, never from the client. One line, bounded. */
export function reviewerName(session: { name?: string; email: string }): string {
  const name = (session.name?.trim() || session.email).replace(/\s+/g, " ").trim();
  return name.slice(0, 120);
}

/** Server-side register of expected source hashes. It is never sent to the browser as is. */
export async function readWikiSourceHashes(path = process.env.BLOOMMD_WIKI_SOURCE_HASHES): Promise<Record<string, string>> {
  if (!path) return {};
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch (error) {
    console.error("[BloomMD] Wiki source hash register could not be read:", error instanceof Error ? error.name : "unknown");
    return {};
  }
}

export type SourceHashStatus = "unchanged" | "changed" | "no-hash" | "unverified";

export interface WikiProposalSourceView {
  id: string;
  resource: string;
  title: string | null;
  contentHash: string | null;
  /** unchanged / changed against the register, no-hash: the source carries none, unverified: no register entry to compare. */
  hashStatus: SourceHashStatus;
  paths: string[];
}

export interface WikiProposalChangeView {
  path: string;
  reason: string;
  sourceIds: string[];
  /** Current page in the bundle; `null` when the page does not exist (yet). */
  before: string | null;
  after: string;
  pageChanged: boolean;
}

export interface WikiProposalView {
  id: string;
  createdAt: string;
  changes: WikiProposalChangeView[];
  sources: WikiProposalSourceView[];
  hasSources: boolean;
  /** The page changed since the proposal was created, so applying is refused. */
  pageChanged: boolean;
  /** Other reasons the proposal cannot be applied (invalid hash, missing frontmatter, ...). */
  validationErrors: string[];
  canApprove: boolean;
}

function hashStatus(citation: { contentHash: string | null; drifted: boolean }, id: string, known: Record<string, string>): SourceHashStatus {
  if (!citation.contentHash) return "no-hash";
  if (citation.drifted) return "changed";
  return known[id] === citation.contentHash ? "unchanged" : "unverified";
}

function sourcesOf(record: WikiProposalRecord, known: Record<string, string>): WikiProposalSourceView[] {
  const byId = new Map<string, WikiProposalSourceView>();
  const add = (view: Omit<WikiProposalSourceView, "paths">, path: string) => {
    const existing = byId.get(view.id);
    if (existing) {
      if (!existing.paths.includes(path)) existing.paths.push(path);
    } else {
      byId.set(view.id, { ...view, paths: [path] });
    }
  };
  for (const change of record.changes) {
    let page: WikiPage | null = null;
    try {
      page = parseWikiPage(change.path, change.content);
    } catch (error) {
      console.error(`[BloomMD] Wiki proposal ${record.id}: proposed page ${change.path} could not be parsed:`, error instanceof Error ? error.message : "unknown");
    }
    const citations = page ? pageCitations(page, known) : [];
    for (const citation of citations) {
      add({ id: citation.id, resource: citation.resource, title: citation.title, contentHash: citation.contentHash, hashStatus: hashStatus(citation, citation.id, known) }, change.path);
    }
    // A cited id the proposed page does not carry as provenance is still a claimed source; show it as unhashed.
    for (const id of change.sourceIds ?? []) {
      if (!citations.some((citation) => citation.id === id)) add({ id, resource: id, title: null, contentHash: null, hashStatus: "no-hash" }, change.path);
    }
  }
  return [...byId.values()];
}

/**
 * Validation as a list of reasons. The proposal file is untrusted input, so a path the core refuses
 * (traversal, absolute, not Markdown) becomes a reason instead of an exception.
 */
async function validationErrorsOf(wikiDir: string, proposal: WikiProposal): Promise<string[]> {
  try {
    return await validateWikiProposal(wikiDir, proposal);
  } catch (error) {
    return [`Proposal is invalid: ${error instanceof Error ? error.message : "unknown error"}`];
  }
}

/** Builds what the review UI needs: diffs against the current pages, cited sources and apply-ability. */
export async function buildWikiProposalViews(config: WikiProposalsConfig, known: Record<string, string>): Promise<WikiProposalViewResult> {
  const [records, bundle] = await Promise.all([listOpenWikiProposals(config.proposalsDir), readWikiBundle(config.wikiDir)]);
  const current = new Map(bundle.pages.map((page) => [page.path, page.raw]));
  const proposals: WikiProposalView[] = [];
  for (const record of records) {
    const errors = await validationErrorsOf(config.wikiDir, toWikiProposal(record));
    const changedPaths = new Set(errors.filter((error) => error.startsWith(PAGE_CHANGED_PREFIX)).map((error) => error.slice(PAGE_CHANGED_PREFIX.length)));
    const sources = sourcesOf(record, known);
    proposals.push({
      id: record.id,
      createdAt: record.createdAt,
      changes: record.changes.map((change) => ({
        path: change.path,
        reason: change.reason,
        sourceIds: change.sourceIds ?? [],
        before: current.get(change.path) ?? null,
        after: change.content,
        pageChanged: changedPaths.has(change.path),
      })),
      sources,
      hasSources: sources.length > 0,
      pageChanged: changedPaths.size > 0,
      validationErrors: errors.filter((error) => !error.startsWith(PAGE_CHANGED_PREFIX)),
      canApprove: errors.length === 0,
    });
  }
  return { proposals, sourceVerification: Object.keys(known).length > 0 ? "verified" : "unavailable" };
}

export interface WikiProposalViewResult {
  proposals: WikiProposalView[];
  sourceVerification: "verified" | "unavailable";
}

export type WikiProposalActionResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: 400 | 404 | 409 | 422 | 500; code: string; error: string; paths?: string[] };

function storeFailure(error: unknown): WikiProposalActionResult | null {
  if (!(error instanceof WikiProposalStoreError)) return null;
  switch (error.code) {
    case "invalid-id": return { ok: false, status: 400, code: error.code, error: "Invalid proposal id." };
    case "not-found": return { ok: false, status: 404, code: error.code, error: "Proposal not found." };
    case "not-open": return { ok: false, status: 409, code: error.code, error: "This proposal has already been decided." };
    case "reason-required": return { ok: false, status: 400, code: error.code, error: "A reason is required to discard a proposal." };
    case "name-required": return { ok: false, status: 400, code: error.code, error: "A reviewer name is required." };
    case "invalid-file": return { ok: false, status: 422, code: error.code, error: "The proposal file is invalid." };
  }
}

function pageChangedFailure(errors: string[]): WikiProposalActionResult | null {
  const paths = errors.filter((error) => error.startsWith(PAGE_CHANGED_PREFIX)).map((error) => error.slice(PAGE_CHANGED_PREFIX.length));
  if (paths.length === 0) return null;
  return {
    ok: false,
    status: 409,
    code: "wiki-page-changed",
    error: `The page has changed since the proposal was created: ${paths.join(", ")}. The Wiki was not modified.`,
    paths,
  };
}

/**
 * Approves and applies in one step: `approveWikiProposal` for the named reviewer, directly followed by
 * `applyWikiProposal`, then the proposal file is marked as applied. Anything that fails validation
 * leaves the bundle untouched.
 */
export async function approveAndApplyWikiProposal(config: WikiProposalsConfig, id: string, reviewer: string): Promise<WikiProposalActionResult> {
  if (!isValidWikiProposalId(id)) return { ok: false, status: 400, code: "invalid-id", error: "Invalid proposal id." };
  try {
    const record = await loadWikiProposal(config.proposalsDir, id);
    if (!record) return { ok: false, status: 404, code: "not-found", error: "Proposal not found." };
    if (record.status !== "open") return { ok: false, status: 409, code: "not-open", error: "This proposal has already been decided." };

    const approved = approveWikiProposal(toWikiProposal(record), reviewer);
    const errors = await validationErrorsOf(config.wikiDir, approved);
    const changed = pageChangedFailure(errors);
    if (changed) return changed;
    if (errors.length > 0) return { ok: false, status: 422, code: "proposal-invalid", error: `The proposal cannot be applied: ${errors.join(" ")}` };

    let diffs;
    try {
      diffs = await applyWikiProposal(config.wikiDir, approved);
    } catch (error) {
      // A concurrent change between validation and apply surfaces here; it is a conflict, not a server fault.
      const raced = pageChangedFailure(error instanceof Error ? error.message.split("\n") : []);
      if (raced) return raced;
      throw error;
    }
    try {
      await markWikiProposalApplied(config.proposalsDir, approved, { by: reviewer });
    } catch (error) {
      console.error(`[BloomMD] Wiki proposal ${id} was applied but could not be marked as applied:`, error instanceof Error ? error.message : "unknown");
      return { ok: false, status: 500, code: "mark-failed", error: "The proposal was applied to the Wiki but could not be marked as applied." };
    }
    return {
      ok: true,
      status: 200,
      body: { ok: true, id, status: "applied", appliedBy: reviewer, diffs: diffs.map((diff) => ({ path: diff.path, beforeHash: diff.beforeHash, afterHash: diff.afterHash })) },
    };
  } catch (error) {
    const known = storeFailure(error);
    if (known) return known;
    console.error(`[BloomMD] Wiki proposal ${id} could not be applied:`, error instanceof Error ? error.message : "unknown");
    return { ok: false, status: 500, code: "apply-failed", error: "The proposal could not be applied." };
  }
}

/** Discards with a mandatory reason. Does not touch the Wiki bundle. */
export async function discardWikiProposalAs(config: WikiProposalsConfig, id: string, reason: unknown, reviewer: string): Promise<WikiProposalActionResult> {
  if (typeof reason !== "string" || !reason.trim()) return { ok: false, status: 400, code: "reason-required", error: "A reason is required to discard a proposal." };
  if (reason.trim().length > MAX_DISCARD_REASON_LENGTH) {
    return { ok: false, status: 400, code: "reason-too-long", error: `The reason must contain at most ${MAX_DISCARD_REASON_LENGTH} characters.` };
  }
  try {
    const discarded = await discardWikiProposal(config.proposalsDir, id, { reason, by: reviewer });
    return { ok: true, status: 200, body: { ok: true, id, status: "discarded", discardedBy: discarded.discardedBy, discardedAt: discarded.discardedAt } };
  } catch (error) {
    const known = storeFailure(error);
    if (known) return known;
    console.error(`[BloomMD] Wiki proposal ${id} could not be discarded:`, error instanceof Error ? error.message : "unknown");
    return { ok: false, status: 500, code: "discard-failed", error: "The proposal could not be discarded." };
  }
}
