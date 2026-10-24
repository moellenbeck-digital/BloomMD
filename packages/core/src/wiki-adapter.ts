/**
 * Provider-neutral adapters for agent-authored Wiki proposals.
 *
 * The point of this module is what it refuses to do. An adapter may be backed by OpenAI, Anthropic,
 * a local model or an MCP client — none of that changes the contract, and none of it grants write
 * access. Every route to disk still goes through `applyWikiProposal`, which demands explicit
 * approval and re-checks content hashes.
 *
 * The pipeline is deliberately staged so each step can be rejected on its own:
 *
 *   read sources -> propose affected pages -> produce Markdown patch -> validate -> approve -> apply
 *
 * An adapter that skips a stage cannot reach the next one, because the stage output is the next
 * stage's only input. That is enforced by the types rather than by asking adapters to behave.
 */

import {
  createWikiProposal,
  hashWikiContent,
  readWikiBundle,
  validateWikiProposal,
  type WikiChange,
  type WikiPage,
  type WikiProposal,
  type WikiSourceProvenance,
} from "./wiki";

/** A source an adapter was given to work from. Adapters never fetch on their own. */
export interface WikiAgentSource {
  id: string;
  /** Where the material came from: a URL, a file path, a ticket id. */
  resource: string;
  content: string;
  title?: string;
  author?: string;
  retrievedAt?: string;
}

/** A page the adapter believes its sources affect, before any text is written. */
export interface WikiPageProposalIntent {
  path: string;
  reason: string;
  /** Ids of the supplied sources this intent rests on. Must be non-empty. */
  sourceIds: string[];
}

/** The adapter's actual edit for one page. */
export interface WikiAgentPatch {
  path: string;
  content: string;
  reason: string;
  sourceIds: string[];
}

/**
 * What a provider integration has to implement.
 *
 * Both methods are pure with respect to the bundle: they receive material and return intent or
 * text. Neither is handed a filesystem path, which is what keeps "the adapter cannot write" a
 * structural property rather than a rule someone has to remember.
 */
export interface WikiAgentAdapter {
  /** Identifies the provider in the audit log. */
  readonly name: string;
  /** Decides which pages the sources affect. */
  proposeAffectedPages(input: {
    sources: WikiAgentSource[];
    pages: ReadonlyArray<Pick<WikiPage, "path" | "title" | "type" | "status">>;
  }): Promise<WikiPageProposalIntent[]>;
  /** Writes the Markdown for one intended change. */
  draftPatch(input: {
    intent: WikiPageProposalIntent;
    sources: WikiAgentSource[];
    currentContent: string | null;
  }): Promise<WikiAgentPatch>;
}

export interface AdapterRunResult {
  proposal: WikiProposal;
  /** Non-fatal notes: intents the adapter produced that were dropped, and why. */
  warnings: string[];
}

export class WikiAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiAdapterError";
  }
}

/** Frontmatter every generated page carries, so a reader can see what wrote it. */
function provenanceFrontmatter(adapterName: string, sources: WikiAgentSource[]): string {
  // The key is `by`, not `actor`: that is what `parseActorEvent` reads. Writing `actor` here made
  // the page parse back as "unattributed", silently losing the provenance the adapter had just
  // recorded — the one thing this frontmatter exists to carry.
  const lines = [
    "generated:",
    `  by: ${JSON.stringify(adapterName)}`,
    `  at: ${JSON.stringify(new Date().toISOString())}`,
    "sources:",
  ];
  for (const source of sources) {
    lines.push(`  - id: ${JSON.stringify(source.id)}`);
    lines.push(`    resource: ${JSON.stringify(source.resource)}`);
    lines.push(`    contentHash: ${JSON.stringify(hashWikiContent(source.content))}`);
    if (source.title) lines.push(`    title: ${JSON.stringify(source.title)}`);
    if (source.retrievedAt) lines.push(`    retrievedAt: ${JSON.stringify(source.retrievedAt)}`);
  }
  return lines.join("\n");
}

/**
 * Verifies a patch cites the sources it claims.
 *
 * A generated claim without a citation is the failure mode that makes agent-written documentation
 * worthless: it reads as authoritative and cannot be checked. The rule is therefore structural —
 * a patch with no source ids never becomes a proposal.
 */
function citationErrors(patch: WikiAgentPatch, sources: WikiAgentSource[]): string[] {
  const errors: string[] = [];
  if (patch.sourceIds.length === 0) {
    errors.push(`No source cited for ${patch.path}. Generated claims require citations.`);
  }
  const known = new Set(sources.map((source) => source.id));
  for (const id of patch.sourceIds) {
    if (!known.has(id)) errors.push(`Unknown source id "${id}" cited for ${patch.path}.`);
  }
  if (!patch.reason.trim()) errors.push(`No reason given for ${patch.path}.`);
  return errors;
}

/**
 * Runs an adapter and returns a proposal that still needs a human.
 *
 * Deliberately returns rather than applies. The caller has to approve the proposal and call
 * `applyWikiProposal` separately — there is no convenience function that does both, because that
 * function would be the one somebody eventually calls from an automated job.
 */
export async function runWikiAgentAdapter(
  rootDir: string,
  adapter: WikiAgentAdapter,
  sources: WikiAgentSource[],
): Promise<AdapterRunResult> {
  if (sources.length === 0) throw new WikiAdapterError("At least one source is required.");
  const duplicateIds = sources.map((source) => source.id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length > 0) throw new WikiAdapterError(`Duplicate source ids: ${duplicateIds.join(", ")}`);

  const bundle = await readWikiBundle(rootDir);
  const summary = bundle.pages.map((page) => ({
    path: page.path,
    title: page.title,
    type: page.type,
    status: page.status,
  }));

  const intents = await adapter.proposeAffectedPages({ sources, pages: summary });
  const warnings: string[] = [];
  const changes: WikiChange[] = [];
  const seenPaths = new Set<string>();

  for (const intent of intents) {
    if (seenPaths.has(intent.path)) {
      warnings.push(`Dropped a second intent for ${intent.path}; one change per page.`);
      continue;
    }
    seenPaths.add(intent.path);

    const existing = bundle.pages.find((page) => page.path === intent.path);
    const patch = await adapter.draftPatch({
      intent,
      sources: sources.filter((source) => intent.sourceIds.includes(source.id)),
      currentContent: existing?.raw ?? null,
    });

    if (patch.path !== intent.path) {
      // An adapter that redirects its own patch to a different page is either confused or trying
      // to reach one it was not asked about. Neither is worth guessing at.
      warnings.push(`Dropped patch for ${patch.path}: it does not match the intended page ${intent.path}.`);
      continue;
    }

    const problems = citationErrors(patch, sources);
    if (problems.length > 0) {
      warnings.push(...problems.map((problem) => `Dropped patch: ${problem}`));
      continue;
    }

    changes.push({
      path: patch.path,
      content: patch.content,
      reason: `[${adapter.name}] ${patch.reason}`,
      sourceIds: patch.sourceIds,
    });
  }

  if (changes.length === 0) {
    throw new WikiAdapterError(
      warnings.length > 0
        ? `The adapter produced no usable change:\n${warnings.join("\n")}`
        : "The adapter produced no change.",
    );
  }

  const proposal = await createWikiProposal(rootDir, changes);
  const errors = await validateWikiProposal(rootDir, proposal);
  if (errors.length > 0) throw new WikiAdapterError(errors.join("\n"));

  return { proposal, warnings };
}

/**
 * Helper for adapters that write a whole page: prepends provenance frontmatter.
 *
 * Optional — an adapter may compose its own frontmatter. It exists so the common case produces
 * inspectable OKF metadata instead of each provider inventing its own shape.
 */
export function withProvenanceFrontmatter(
  adapterName: string,
  body: string,
  sources: WikiAgentSource[],
  extra: { type?: string; title?: string; status?: string } = {},
): string {
  const head = [
    "---",
    `type: ${JSON.stringify(extra.type ?? "note")}`,
    ...(extra.title ? [`title: ${JSON.stringify(extra.title)}`] : []),
    ...(extra.status ? [`status: ${JSON.stringify(extra.status)}`] : []),
    provenanceFrontmatter(adapterName, sources),
    "---",
    "",
  ];
  return `${head.join("\n")}${body.trimStart()}`;
}

/** Reads back which sources a page cites, for display and for drift checks. */
export function pageSourceIds(page: WikiPage): string[] {
  return page.sources.map((source: WikiSourceProvenance) => source.id);
}
