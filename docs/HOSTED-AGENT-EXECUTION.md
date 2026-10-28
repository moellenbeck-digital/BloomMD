# Hosted Agent Execution — Design Specification

Verified against: 2026-10-28 · BloomMD 0.5.1 · 48e8e7d · Ticket [#90](https://github.com/moellenbeck-digital/BloomMD/issues/90)

## 1. Status and goal

### 1.1 Status

**Planning only. Nothing in this document is implemented or enabled.** No code that runs a hosted agent exists in the repository, no production path is switched on, and merging this document changes no behaviour. [`docs/BETA-SCOPE.md`](BETA-SCOPE.md) keeps "hosted autonomous agents" out of the beta, and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) keeps agent execution out of the core runtime. Both stay true until the gate in section 8 is passed.

Every statement about the current state in this document was checked against the source at the commit above. Statements marked **Requirement** describe what a future implementation must do; they are not claims about existing code.

### 1.2 Two different things

| | Local agent pairing (exists today) | Hosted execution (this spec, not built) |
|---|---|---|
| Where the agent process runs | On the user's machine (OpenClaw plugin or `bloommd-agent`) | On infrastructure the operator runs |
| Who starts and stops it | The user (plugin config, local runner) | An operator-owned orchestrator, per job |
| Whose model access | The user's own model account | The operator's model account |
| What BloomMD hands out | One claimed task and its bounded context, to a paired agent that polls | The same bounded context, to a short-lived sandbox the operator controls |
| Who bears the risk of the agent process | The user | The operator |
| Source | `docs/OPENCLAW-WORKSPACE-AGENT.md`, `packages/agent-runtime`, `plugins/openclaw` | — |

The second row of risk is the point of this document. With a local agent, a misbehaving model can only damage what the user already trusts it with. A hosted agent processes the content of many tenants on the operator's hardware, so the operator must guarantee isolation, limits and auditability that a user would otherwise provide by choosing their own machine.

### 1.3 Goal

Describe how a hosted agent runs **behind the same safeguards that apply locally**: it can only produce proposals in the existing `propose → approve → apply` format, a human applies them after a hash check, and every step is auditable. Hosted execution must not widen what an agent is able to change; it may only change where the agent process runs.

### 1.4 Non-goals

- No new write path, no new apply mechanism, no auto-approval.
- No autonomous or scheduled agents that start without a human request. Every job originates from a person with the right to assign it.
- No choice of model provider, runner technology or price. Those are listed as open questions (section 9).
- No change to the public Wiki route, which stays read-only.

## 2. Current state: what is reusable and what is missing

### 2.1 Three review surfaces exist today

| Surface | Format and store | Review | Hash / staleness check |
|---|---|---|---|
| Wiki proposals (`packages/core/src/wiki.ts`, `wiki-proposals.ts`, `apps/app/src/lib/wiki-proposals.ts`, `apps/app/src/app/api/wiki/proposals/…`) | `WikiProposal` with per-change `beforeHash`/`afterHash` (`sha256:…`), one `<id>.json` per proposal in `BLOOMMD_WIKI_PROPOSALS_DIR`, status `open`/`applied`/`discarded`, `discardReason` | `approve` (approve and apply in one step) and `discard` (reason mandatory), both POST only, session and same-origin required | `validateWikiProposal` compares the current page hash with `beforeHash` and the content with `afterHash`; refusal is `409 wiki-page-changed` |
| Workspace-agent tasks (`bloom_workspace_agents`, `bloom_agent_tasks`, `bloom_agent_proposals`; `/api/agent/v1/*`, `/api/workspaces/<id>/agent-proposals/<id>`) | Task with bounded context, proposal as whole Markdown, node content or typed child nodes | `apply` or `reject`; any workspace member except viewers | `before_version` plus `before_markdown_hash`; node proposals check the expected node title and content; stale proposals are marked `stale` |
| Agent-token proposals (`bloom_agent_token_proposals`, `lib/agent-review.ts`) | Whole-map Markdown from a token with `propose` right | `approve`/`reject`, workspace owner only | Base `version`; the owner may deliberately `overwrite` |

Local MCP tools (`packages/core/src/wiki-agent.ts`) define `knowledge_wiki_propose`, `_approve` and `_apply`. `bloommd-wiki mcp` hides `_approve` and `_apply` unless the person starting the server passes `--allow-agent-approval`, and refuses to call a hidden tool (`packages/wiki-cli/src/index.ts`, `mcp.ts`). The `bloommd-knowledge` MCP has no approve tool at all.

### 2.2 Reusable as is

- The proposal data model and its hash fields; the apply sequence in `applyWikiProposal` (validate hashes, write atomically per page, regenerate `index.md`, append to `log.md`).
- The review UI and API contract of `/wiki` (before/after, cited sources with hash status, "no source" warning, reviewer name taken from the session, never from the request).
- The workspace-agent contract: a paired agent identity per workspace, hashed revocable tokens (`bloom_agent_…`), one claimed task at a time with only the bounded context, results returned as proposals, per-agent rate limits.
- Agent-token rights (`read`/`propose`/`write` per area, longest matching area wins, default `propose`) enforced server side from the database on every call (`lib/agent-gate.ts`).
- The single-writer rule: the sync server is the only writer of cloud documents; apply goes through `writeThroughSyncServer` or `applyNodeContentThroughSyncServer`.
- The change log with pre-image and undo for agent-token changes (`bloom_agent_token_changes`, `undoAgentChange`).
- `assertPublicHttpUrl` (`lib/link-preview.ts`) as the starting point for a server-side fetcher that refuses private addresses.

### 2.3 Gaps the hosted path depends on

These gaps do not matter for a single user running their own agent. They matter once the operator runs the agent for others. Each one must be closed, or consciously accepted in the security review, before enablement.

| # | Gap | Evidence | Addressed in |
|---|---|---|---|
| G1 | Wiki proposal routes check only that a session exists. There is no workspace or role check, and the bundle is one deployment-wide folder (`BLOOMMD_WIKI_DIR`). | `api/wiki/proposals/**/route.ts` call `getSession()` only; `wikiProposalsConfig()` | 6 |
| G2 | The Wiki apply keeps no pre-image. The proposal file holds the new content and the two hashes; `applyWikiProposal` returns diffs but does not store them. Multi-page apply writes page by page, and validation and write are not locked against each other. | `wiki.ts` `applyWikiProposal`, `writeAtomic` | 5.4 |
| G3 | `sourceIds` are optional and never checked against the page's `sources`. Only the review UI warns when a proposal names no source. | `WikiChange.sourceIds`, `validateWikiProposal`, `hasSources` | 5.2 |
| G4 | `bloom_audit_events` has no workspace column. `recordAuditEvent` swallows persistence failures. Wiki approvals appear only as a free-text line in `log.md`. | `lib/db.ts` table definition and `recordAuditEvent` | 5.5, 7 |
| G5 | No server-side deadline for a task in `running`. Revoking an agent does not touch its queued or running tasks. | `claimWorkspaceAgentTask`, `revokeWorkspaceAgent`; the only status transitions are claim, complete and fail | 3.6 |
| G6 | A workspace-agent proposal carries one free-text `rationale`, no per-claim citations and no source hashes. | `completeWorkspaceAgentTaskByAgent` | 5.2 |
| G7 | The token-proposal approval can `overwrite` a changed map. | `approveAgentTokenProposal` | 5.3 |
| G8 | `write` is a grantable agent-token right (`AGENT_ACCESS`). | `agent-ledger.ts` | 6 |
| G9 | No runner isolation, egress control, model gateway or quota exists. The only timeout is the local runner's `--timeout-seconds` (default 600). | `packages/agent-runtime/src/index.ts` | 3 |
| G10 | Nothing in the protocol marks document content as data. The agent skill limits scope, but nothing inspects what a proposal introduces (for example new external URLs). | `packages/agent-runtime/skills/bloommd-workspace-agent/SKILL.md` | 5.6 |
| G11 | The public promise "no sale or training with your content" exists (`apps/marketing/src/app/page.tsx`), but there is no per-workspace consent record and nothing enforces it for model calls. The telemetry scrubber removes user, cookies, headers and console breadcrumbs; it has nothing to say about prompts because none exist yet. | `lib/telemetryPrivacy.ts` | 5.7 |

Note on documentation: the "Workspace Agents" section of `docs/ARCHITECTURE.md` describes the app sending context to a "deployment-owned adapter". The current code has no such adapter in `apps/app`; the agent pulls its task (`POST /api/agent/v1/tasks/next`). This specification follows the code.

## 3. Execution boundaries

### 3.1 Trust boundaries

```text
  Person (session, role)            Operator-owned control plane            Untrusted compute
 ───────────────────────          ──────────────────────────────          ────────────────────
  assigns a job            ──►     BloomMD app (authz, quotas)
                                          │ builds context package
                                          ▼
                                   Orchestrator ── starts ──►   Runner sandbox (one job)
                                          ▲                       │  reads context package
                                          │ job-scoped result     │  calls model gateway only
                                          └──────────────────────┘  returns ONE proposal
                                          │
                                          ▼
                                   Proposal store (open)
                                          │
  reviews diff, applies    ◄──────────────┘
          │ human identity, hash check
          ▼
   Sync server / Wiki apply  (the only writers)
```

Three boundaries matter:

1. **Person → control plane.** Authorization by workspace role (section 6). The agent never acts on its own authority.
2. **Control plane → runner.** The runner is untrusted compute. It receives data, never credentials with write capability.
3. **Proposal store → writers.** Crossing this boundary requires a human, the reviewed content hash and an audit event. The runner cannot cross it.

### 3.2 What the runner may see

**Requirement.** The control plane builds one context package per job, exactly as `claimWorkspaceAgentTask` does today for a paired agent.

| May see | Never sees |
|---|---|
| The task text (at most 4000 characters today) | Database URL, `BLOOMMD_SYNC_SECRET`, `BLOOMMD_AUTH_SECRET`, any operator secret |
| The selected node (title, path, content) or the one document named by the task | The rest of the workspace, other workspaces, member lists, email addresses |
| For Wiki jobs: the pages and sources the job names, with their `contentHash` at job start | Access tokens, personal tokens, share links, long-lived agent tokens |
| Workspace name and job ID | Other jobs, other tenants' sandboxes, previous jobs' state |

Content that is fetched on the job's behalf (web pages, uploaded documents) is added to the package by the control plane, not fetched by the runner (section 5.6).

### 3.3 What the runner may do

**Requirement.**

- Read its context package from a read-only mount.
- Call the **model gateway** and nothing else on the network. The gateway is operator-owned: it holds the provider credential, allows one provider endpoint, enforces size and token limits, and logs metadata only.
- Submit exactly one result (summary plus at most one proposal) with a **job-scoped credential**: valid for one job ID, one submission, short lifetime. It cannot poll other jobs, list anything, or read anything.

Everything else is denied: inbound connections, other egress (including DNS and cloud metadata addresses), host filesystem access beyond the sandbox's scratch space, child-process escape, shared volumes between jobs.

### 3.4 Limits

Existing caps stay as they are and apply to hosted jobs unchanged: task text 4000 characters, proposal Markdown 256 KiB, node content 64 KiB, at most 12 child nodes, rationale 4000 characters, Wiki page 2,000,000 bytes, pairing and polling rate limits per agent.

Hosted execution adds limits that do not exist yet. The values below are starting points for the security review, not decisions.

| Limit | Purpose | Starting point |
|---|---|---|
| Wall-clock time per job | Hung or looping model | 10 minutes (matches the local runner default of 600 s) |
| Model tokens per job (in, out) | Cost and abuse | Set per plan; hard stop at the gateway |
| CPU and memory per sandbox | Neighbour isolation | Fixed small profile; no burst |
| Concurrent jobs per workspace and per operator | Fairness, blast radius | 1 per workspace to start |
| Queued jobs per workspace | Backlog abuse | Small fixed number; refuse with a visible reason |
| Jobs per workspace per hour | Cost and abuse | Beyond today's 15 task creations per user and hour only on explicit decision |
| Sandbox lifetime | No state carried over | Destroyed after every job, whatever the outcome |

A limit hit ends the job as `failed` with a stable failure code and an audit event. It never produces a partial proposal.

### 3.5 Who starts and stops a runner

- **Start:** only the orchestrator, only for a job that a person with the right assigned and that passed quota and consent checks. A runner cannot be started by a task text, by a document, by another agent or by a schedule.
- **Normal end:** the runner submits its result or a failure code; the orchestrator destroys the sandbox.
- **Forced end:** deadline reached, workspace owner cancels the job, workspace owner revokes the agent or disables hosted execution, or the operator uses the global kill switch. Forced end destroys the sandbox first, then closes the task as `failed` (`AGENT_JOB_CANCELLED`, `AGENT_JOB_TIMEOUT`), then writes the audit event.
- **Gap G5:** today a task in `running` never expires and revocation leaves queued and running tasks as they are. The orchestrator therefore needs a lease on `running` (claim with deadline, reaper closes expired tasks) and revocation must cancel the agent's open tasks.

### 3.6 Failure modes

| Failure | Required behaviour | Visible to the user as |
|---|---|---|
| Job exceeds time or token limit | Sandbox destroyed, task `failed`, no proposal | "Agent timed out", no changes |
| Runner crashes or is lost | Lease expires, task `failed` | "Agent not reachable" |
| Result is malformed, too large or breaks a cap | Rejected at submission, task `failed` | "Agent result rejected" |
| Result is submitted twice | Second submission refused (task no longer `running`, job credential spent) | Nothing; audit event |
| Source changed while the agent worked | Proposal is created with the job-start hashes and marked stale at review time; apply refused | "Source changed", re-run offered |
| Model provider unavailable | Task `failed` with a retryable code; no automatic retry loop | "Model unavailable" |
| Quota or concurrency limit reached | Job refused at assignment | Named limit |
| Agent revoked or hosted execution disabled mid-job | Sandbox destroyed; open proposals stay reviewable but are flagged | "Agent revoked" |
| Audit event cannot be written | Apply and rollback are refused (fail closed); a started job is closed as failed | "Temporarily unavailable" |
| Proposal store unavailable | Job fails; nothing is applied | "Temporarily unavailable" |
| Proposal flagged by checks (new external URL, path outside scope, missing citations) | Stored, shown as flagged, apply requires an explicit acknowledgement or is blocked for hard violations | Warning in review |
| Workspace deleted | Cascading cleanup of jobs and proposals (existing foreign keys) | — |

## 4. Reuse of the local protocol

### 4.1 Flow

```text
 person assigns job ──► control plane checks role, consent, quota ──► context package
        runner proposes ──► control plane validates and stores an OPEN proposal
        person reviews diff + sources ──► approve (named, same-origin session) ──► hash check ──► apply
```

Hosted execution adds the first half. The second half, from "open proposal" onwards, is the existing protocol for the same data.

### 4.2 Mapping

| Local protocol element | Hosted equivalent |
|---|---|
| `WikiProposal` with `changes[]` (`path`, `content`, `reason`, `sourceIds`, `beforeHash`, `afterHash`) | Identical. The control plane computes `beforeHash` and `afterHash` from the bundle; the runner supplies only `path`, `content`, `reason`, `sourceIds`. |
| `createWikiProposal` | Called by the control plane on the runner's result, never by the runner |
| Status `open` / `applied` / `discarded`, `discardReason` | Identical |
| `approveWikiProposal(proposal, reviewer)`, reviewer from the session | Identical; the reviewer is always a human |
| `applyWikiProposal` (hash validation, atomic write, index regeneration, log entry) | Identical, plus the safeguards in section 5 |
| Workspace-agent task and proposal contract (`/api/agent/v1/tasks/next`, `…/result`, `…/fail`) | The hosted runner is one more agent provider behind the same contract. Today the only provider is `openclaw` (`WorkspaceAgentProvider`). |
| Map proposals (`bloom_agent_proposals`, node-scoped apply through the sync server) | Unchanged |

### 4.3 No new write path

This is a hard invariant of the design:

1. The hosted path creates **proposals only**, in the formats above. It never writes a page, a document, a log or an index.
2. The orchestrator, the model gateway and the runner hold **no credential** for the sync server's internal command API, for `bloom_documents`, or for the Wiki bundle directory. The control plane's proposal store is the only thing they can reach, and only to add an `open` proposal.
3. **Applying stays a separate, human step.** Only a signed-in person with the required role can apply, through the existing routes, with the existing hash check. Hosted components never call approve or apply. The `--allow-agent-approval` escape hatch of the local MCP has no hosted counterpart and must not be introduced.
4. The public `GET /api/wiki` stays read-only. `apps/app/src/app/api/wiki/route.ts` exports only `GET`, and a test asserts that the proposal list route is `GET` only and that actions are `POST` only. No hosted feature adds a public mutation route.
5. The runner cannot create a proposal for a path or document outside its job scope. The control plane rejects such a result.

Any later feature that would let a hosted agent write directly, auto-approve, or approve another agent's proposal is a new decision with its own security review, not an extension of this one.

## 5. Mandatory safeguards

Each safeguard names the measure, where it is enforced, and how to check it. "Today" states what the source already does.

### 5.1 No silent writes

- **Measure.** A hosted job can change nothing in a workspace. The only artefact it produces is an `open` proposal, which is visible in the review list and in the audit log. A job that produces no proposal produces a summary only.
- **Enforced at.** Credentials: runner and orchestrator have no write credential (4.3). Server: the proposal store accepts only the `open` state from the hosted path; approve and apply routes require a session. Agent-token rights: hosted tokens are capped at `propose` (section 6).
- **How to verify.**
  - Automated: an integration test runs a hosted job end to end and asserts that no document version, page hash, `index.md` or `log.md` changed before a human approves. The existing `bun run test:e2e:agent` already asserts "proposal instead of direct write" for the local path and is the template.
  - Automated: a test that calls approve and apply with the job-scoped credential and with a hosted agent token and expects 401/403.
  - Deployment: a credential inventory for the runner network and sandbox shows no database, sync-secret or write-capable token.
- **Today.** Local: holds for the Wiki MCP by default and for the knowledge MCP always. Cloud: an agent token with `write` right can write directly (G8).

### 5.2 Source citations on every generated claim

- **Measure.** Every generated passage in a proposed page cites at least one source from the job's context package. Citations use the existing provenance fields: `sources[]` in the page frontmatter (`resource`, `id`, `contentHash`, `retrievedAt`) and `sourceIds` on the change. The page carries `generated: {by, at}` naming the hosted agent identity and job; `verified` stays empty until a human signs off, so the derived trust tier is `generated`, never `verified`.
- **Enforced at.** The control plane validates the result before it becomes an open proposal. It can check structure deterministically: each citation resolves to a `sources[]` entry, that source belongs to the job's context package, its `contentHash` equals the hash taken at job start, and no passage is uncited. It cannot check that a claim is true. Truth is the reviewer's job, supported by the source hash status already shown in review.
- **How to verify.**
  - Unit tests for the validator with uncited passages, unknown source IDs, sources outside the package, and drifted hashes (extending `wiki.test.ts` and the proposal route tests).
  - Review UI test that a proposal with no resolvable source cannot be approved without an explicit acknowledgement, and that hash status per source is shown (`wiki-proposals` route tests already cover the status values).
  - Sampling: a periodic human audit of applied hosted proposals checks claim-to-source fidelity; the result feeds the enablement criteria (section 8).
- **Today.** `sourceIds` is optional and unchecked (G3); the UI warns when no source is named. Workspace-agent proposals carry only a free-text `rationale` (G6).

### 5.3 Content hash checked before applying

- **Measure.** Apply is refused when the target changed since the job read it. For Wiki pages the check is `beforeHash` against the current page hash plus `afterHash` against the content. For documents it is `before_version` plus `before_markdown_hash`, and for node proposals the expected node title and content. A refused proposal is marked stale and the agent must be asked again; it is never merged or rebased silently by the hosted path.
- **Enforced at.** Server side in the apply routes, immediately before the write, and again by the sync server's `expectedVersion` check. Hosted proposals do not offer the `overwrite` option that agent-token proposals have today (G7).
- **Concurrency requirement.** The Wiki apply validates and then writes without a lock (G2). For hosted use, apply must be serialized per bundle, and a multi-page proposal must either apply fully or not at all (write to a staging copy and swap, or apply under one lock with rollback on first error).
- **How to verify.** Existing: `wiki.test.ts` "rejects optimistic-concurrency conflicts", proposal route tests for 409 `wiki-page-changed` and wrong content hash, `agent-proposals` route tests for stale source and stale node. Additional: a race test with two concurrent applies on the same page, and a multi-page proposal whose second page changed after validation.
- **Today.** Holds for Wiki and workspace-agent proposals; not for token-proposal overwrite and not under concurrency.

### 5.4 Human-readable diff and rollback path for every change

- **Measure.** The reviewer sees a line diff per page (or an outline diff per map) before approving. On apply, the system stores the pre-image and the resulting hash. A rollback restores the pre-image, is itself a named human action with its own audit event, and is refused when the target was edited after the applied change (the same rule as `undoAgentChange`: `CHANGE_EDITED_LATER`).
- **Enforced at.** Review API and UI for the diff; apply transaction for the pre-image; rollback route with the same role as apply.
- **Retention.** Pre-images live at least as long as proposals stay reviewable plus a stated rollback window. The existing change log keeps pre-images only for the last 300 changes (`AGENT_TOKEN_HISTORY_LIMIT`); hosted use needs a time-based window per workspace instead of a global count.
- **How to verify.** Apply then roll back and assert byte-identical content and a fresh hash equal to `beforeHash`; edit after apply and assert the rollback is refused; assert that the diff shown in review equals the diff stored at apply; assert audit events for both steps.
- **Today.** The review shows before and after. Map changes by agent tokens keep a pre-image and an undo. The Wiki bundle keeps none (G2); the apply result lists hashes only.

### 5.5 Per-workspace permissions and audit events

- **Measure.** Every hosted action is attributed to a workspace, an acting person or agent identity, and a job. Authorization follows the role table in section 6. Every state change in section 7 writes an audit event, and the events can be listed per workspace.
- **Enforced at.** Authorization in the route handlers using workspace membership from the database on every call (as `getWorkspaceForUser` does today). Audit in the same transaction as the state change where the store allows it, and fail closed otherwise (3.6).
- **Required schema change.** `bloom_audit_events` gains an indexed `workspace_id` so a workspace owner's log can be queried without joining through target tables (G4). Events stay content-free (section 7).
- **How to verify.** For each event type, a test performs the action and finds exactly one event with the right actor, workspace and target. A test breaks the audit write and asserts that apply is refused. A role test per row of the table in section 6, including cross-workspace attempts, which must answer 404 like the existing routes.
- **Today.** Task and proposal lifecycle events exist (`agent.task.*`, `agent.proposal.*`, `agent.token.*`) but not per workspace (G4). Wiki proposals have no database audit event at all.

### 5.6 Prompt-injection isolation for imported web pages and documents

- **Measure.** Imported content is data, never instruction. It cannot grant itself tools, scope or rights, and it cannot reach an exfiltration channel.
  1. **Separate fetch.** Web pages and uploaded documents are fetched and converted by a fetcher in the control plane, not by the runner. The fetcher reuses the public-address check of `assertPublicHttpUrl`, must additionally connect to the address it validated, and enforces size, redirect and content-type limits. Fetching needs the job's authorization; a document cannot trigger a further fetch.
  2. **Structured channel.** The context package keeps the human task and the imported content in separate, labelled fields. The system prompt states that imported content is untrusted data and that instructions found in it are quoted, not followed. This reduces the risk; it does not remove it, so the controls below do not rely on it.
  3. **No tools to abuse.** The runner has no tools with side effects. It has no network (3.3), so a successful injection cannot send private content out.
  4. **Narrow output.** The only result is a proposal whose paths and documents lie inside the job scope. Anything else is rejected.
  5. **Output inspection.** The control plane flags proposals that introduce new external URLs, images or other remote resources that were not in the sources (`extractWikiResources` and `isSafeWikiResourceTarget` classify them), that change frontmatter trust fields (`verified`, `status`), or that touch pages outside the scope. Flagged proposals are marked in review; hard violations are rejected.
  6. **Human last.** The reviewer sees the diff and the sources before anything is applied (5.4).
- **Enforced at.** Fetcher and orchestrator (1, 3), result validator in the control plane (4, 5), review UI (5, 6). The prompt (2) is defence in depth only.
- **How to verify.** A fixed injection test suite run in CI and before every model or prompt change: pages that tell the agent to ignore its task, to fetch a URL, to write to another page, to set `verified`, to emit an image with a data-bearing URL. Each case must end as no proposal, a rejected result, or a flagged proposal, and never as an applied change or an outbound request. A network-level test that the sandbox cannot reach anything but the gateway. Fetcher tests for private, link-local, redirect-to-private and oversized targets.
- **Today.** The local agent skill limits scope by instruction, and the claimed context is bounded; nothing inspects proposals (G10).

### 5.7 No use of private wiki content for training or telemetry without explicit consent

- **Measure.** Content that a job reads or produces is used only to fulfil that job. The operator's model provider is contractually and technically configured for no training and no retention beyond what is needed to answer. Prompts, outputs and content are never written to application logs, error reports or analytics. Any secondary use (debugging a job, evaluation, quality sampling, training) needs an explicit, revocable, per-workspace consent given by a workspace owner, and is off by default.
- **Enforced at.** Model gateway configuration (provider, zero-retention setting, no content in gateway logs), logging and Sentry configuration (a scrub rule for hosted-job fields and a ban on content fields), and a consent record checked before any secondary use. Consent changes are audited.
- **Two consents, kept separate.** Enabling hosted execution means content is sent to the model provider as a sub-processor to answer the task; this is disclosed when an owner enables it. Secondary use is a different, additional opt-in. Legal review of the sub-processor disclosure is an open question (section 9).
- **How to verify.** Canary test: run a job whose content contains a unique marker, then search logs, error reports, gateway logs and analytics for it; it must be absent. Configuration check in CI that the provider settings and scrub rules are present. Consent test: with consent off, secondary-use code paths are unreachable. Review that the public promise on the marketing page and the actual configuration say the same thing.
- **Today.** The promise exists; no consent record or enforcement exists (G11). The telemetry scrubber covers URLs, cookies and headers only.

## 6. Permission model

### 6.1 Roles and rights

Workspace roles are `owner`, `editor` and `viewer` (`bloom_workspace_members`). Agent-token rights are `read`, `propose`, `write` per area; without a row an agent only proposes.

| Action | Owner | Editor | Viewer | Agent / runner |
|---|---|---|---|---|
| Enable or disable hosted execution for a workspace; give or withdraw secondary-use consent | ✔ | — | — | — |
| Add or revoke a hosted agent | ✔ (as `addWorkspaceAgent`, `revokeWorkspaceAgent` today) | — | — | — |
| Change agent rights for an area | ✔ | — | — | never (`agentOwnerContext` refuses agent tokens) |
| Assign a job to a hosted agent | ✔ | ✔ | — | — (jobs never start themselves) |
| Cancel a job | ✔ | the person who assigned it | — | — |
| Read proposals and diffs | ✔ | ✔ | — | — |
| Approve / apply a proposal | ✔ | ✔ | — | **never** |
| Discard a proposal | ✔ | ✔ | — | — |
| Roll back an applied change | ✔ | ✔ | — | **never** |
| Read the workspace audit log | ✔ | — | — | — |

The viewer row follows the existing rule that viewers are read-only. The owner-only rows follow the existing rule that rights, log and undo of agent tokens belong to the workspace owner, not to every member.

### 6.2 Rules

1. **Rights cap.** A hosted agent's rights are capped at `propose` in every area. The platform mints the hosted identity with that cap; no API changes it to `write` (G8). With no right set for an area, the agent only proposes; with `read`, it gets context but may not even propose there.
2. **Area scope.** A job runs in the area of its document and uses the longest-matching-area rule of `accessFor`. A job whose target is in a `read` area is refused at assignment.
3. **Approval is a human act in the workspace.** Whoever approves must be a member with owner or editor role at the moment of approval, resolved from the database. The reviewer name comes from the session. Where the two existing surfaces differ today (workspace-agent proposals: editor or owner; token proposals: owner only), hosted proposals use the stricter owner-only rule for areas an owner marks sensitive and editor-or-owner otherwise. Whether to require a second person (four-eyes) is an open question.
4. **Wiki proposals are workspace-scoped.** The current Wiki proposal routes authorize by session alone and operate on one deployment-wide folder (G1). Hosted Wiki proposals must live in a per-workspace store and be authorized by membership and role. Existing self-hosted behaviour can stay unchanged behind its own configuration.
5. **Revocation is immediate and total.** Revoking an agent, removing a member who assigned jobs, or disabling hosted execution cancels queued and running jobs (3.5). Open proposals stay reviewable, marked as coming from a revoked agent.
6. **No privilege through content.** Nothing in a task text, document or source can change rights, roles or scope. Rights are read from the database, never from the request or the agent's output.
7. **Rate limits** from today (task creation, agent adding, polling, proposal review) apply and are tightened by the quota rows in 3.4, not relaxed.

## 7. Audit events

Events are content-free, as the existing ones are: UUIDs, sizes, counts, durations, hashes, model identifier and stable codes, never Markdown, page text, file names, URLs, email addresses, prompts, outputs or token values. They are retained and purged by the same retention job as the existing security events.

| Event | Actor | Target | New? |
|---|---|---|---|
| `workspace.agent.added`, `.paired`, `.revoked` | Owner / agent | `workspace_agent` | existing |
| `agent.task.created`, `.claimed`, `.completed`, `.failed` | Person / agent | `agent_task` | existing |
| `agent.proposal.applied`, `.rejected`, `.stale` | Person | `agent_proposal` | existing |
| `agent.token.rights_changed`, `.proposal_approved`, `.proposal_rejected`, `.change_undone` | Owner | token / proposal | existing |
| `workspace.hosted_agents.enabled`, `.disabled` | Owner | `workspace` | new |
| `workspace.hosted_agents.consent_changed` (with scope: processing / secondary use, and new value) | Owner | `workspace` | new |
| `agent.job.quota_denied` (with limit name) | Person | `agent_task` | new |
| `agent.runner.started`, `.finished`, `.killed` (reason: timeout, cancelled, revoked, operator) | Orchestrator | `agent_task` | new |
| `agent.job.cancelled` | Person | `agent_task` | new |
| `agent.proposal.created` (with changed paths count, sizes, `beforeHash`/`afterHash`) | Agent | `agent_proposal` | new |
| `agent.proposal.flagged` (flag codes: new-external-url, scope, trust-field, uncited) | Control plane | `agent_proposal` | new |
| `agent.proposal.discarded` | Person | `agent_proposal` | new for Wiki; existing in the proposal file only |
| `wiki.proposal.approved`, `.applied` (with hashes) | Person | `wiki_proposal` | new (today only a `log.md` line) |
| `agent.proposal.rolled_back` | Person | `agent_proposal` | new |
| `agent.audit.write_failed` (to a secondary sink) | Control plane | — | new |

Required properties: every event carries `workspace_id`; actor is exactly one of person or agent, as `recordAuditEvent` already enforces; `outcome` is `success` or `failure`; the event is written in the same transaction as the state change or the state change is refused (5.5); the owner can list events for their workspace.

## 8. Enablement gate

Hosted execution is switched on only when every item below is met, in this order. The first block is the meaning of "the local workflow is reliable and audited" from the ticket.

**A. Local protocol hardened (before any hosted work starts)**

1. Pre-image and rollback for Wiki apply; serialized, all-or-nothing multi-page apply (G2).
2. Citation validation for proposals, not only a UI warning (G3).
3. Workspace-scoped, role-checked Wiki proposal routes and store (G1).
4. Workspace-scoped, database audit events for proposal approve, apply, discard and rollback; audit failure refuses apply (G4).
5. Lease and cancellation for agent tasks (G5).

**B. Hosted components, built behind a disabled flag**

6. Orchestrator, sandbox, model gateway and fetcher as in sections 3 and 5.6, with the credential inventory of 5.1.
7. Hosted agent provider with the `propose` cap; no write-capable credential anywhere in the runner path.
8. All events of section 7, quotas of 3.4, kill switch.

**C. Evidence**

9. All "how to verify" checks above exist and pass in CI: no-silent-write, network-deny, injection suite, canary, rollback, race and role tests.
10. An independent security review of the sandbox, gateway, fetcher and authorization. `docs/ARCHITECTURE.md` already requires an independent production security review for public operation; hosted execution needs its own, because it adds a new place where tenant content is processed.
11. Operational validation: kill-switch drill, runner-loss and lease-expiry drill, restore drill including proposals and pre-images, load test at the planned quota, cost and abuse alerts.
12. Sub-processor disclosure and consent wording reviewed (section 9).

**D. Rollout**

13. Disabled by default; enabled per workspace by an owner; first for an allowlist of beta workspaces; the beta scope document is updated in the same change that enables it.

No part of this ticket implements A, B, C or D.

## 9. Open questions

1. **Model provider and sub-processor.** Which provider, in which region, with which retention terms; or self-hosted models. Needs a decision and legal review of the disclosure shown when an owner enables hosted execution.
2. **Four-eyes.** Should a hosted proposal require approval by someone other than the person who assigned the job, at least for sensitive areas?
3. **Where hosted Wiki proposals live.** A per-workspace database table is the straightforward answer; confirm it replaces the folder store for hosted use while self-hosted keeps the folder.
4. **Runner technology.** Container with a hardened profile versus microVM; decided in the security review against the threat model in sections 3 and 5.6.
5. **Cost and plans.** Hosted jobs have a real per-job cost to the operator; billing is off in the beta (`BLOOMMD_BILLING_ENABLED=0`), so quotas need an owner decision before any pricing question arises.

## 10. Acceptance criteria of the ticket

| Criterion | Where |
|---|---|
| A design documents hosted execution boundaries, permissions, audit events and failure modes | Sections 3, 6, 7, and 3.6 |
| The hosted path reuses the local proposal/approve/apply protocol | Section 4 |
| Production enablement is gated behind security review and operational validation | Section 8 |
| No public web route accepts unaudited Wiki mutations | Section 4.3 (items 3 and 4), 5.1, 5.5 |
