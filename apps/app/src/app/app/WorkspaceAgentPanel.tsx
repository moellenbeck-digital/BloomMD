"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Bot,
  Check,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock3,
  Eye,
  FileText,
  GitCompareArrows,
  ListTree,
  LoaderCircle,
  Send,
  ShieldCheck,
  UserMinus,
  X,
} from "lucide-react";
import { AgentTokenAccess } from "./AgentTokenAccess";

interface WorkspaceInfo {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}
interface ActiveDocument {
  id: string;
  filename: string;
  workspaceId: string;
}
interface NodeContext {
  id: string;
  title: string;
  path: string;
  content: string;
}
interface Agent {
  id: string;
  displayName: string;
  status: "active" | "revoked";
  pairedAt: string | null;
  lastSeenAt: string | null;
}
interface Proposal {
  id: string;
  proposedMarkdown: string;
  proposedNodeContent: string | null;
  proposedChildNodes: Array<{
    title: string;
    content: string;
    kind: "task" | "decision";
  }>;
  rationale: string;
  status: "pending" | "rejected" | "applied" | "stale";
}
interface Task {
  id: string;
  agentName: string;
  prompt: string;
  status: "queued" | "running" | "proposed" | "completed" | "failed";
  resultSummary: string | null;
  failureCode: string | null;
  createdAt: string;
  nodeId: string | null;
  proposals: Proposal[];
}

interface WorkspaceAgentPanelProps {
  open: boolean;
  onClose: () => void;
  workspace: WorkspaceInfo;
  document: ActiveDocument | null;
  locale: "de" | "en";
  onApplied: () => Promise<void>;
  mode?: "manage" | "node";
  node?: NodeContext | null;
  variant?: "dialog" | "sidebar";
}

const copy = {
  de: {
    manageTitle: "Agenten verwalten",
    manageSubtitle:
      "Verbinde lokale Agenten mit diesem Workspace oder widerrufe ihren Zugang.",
    nodeTitle: "Agent für Knoten fragen",
    nodeSubtitle:
      "Der Auftrag bleibt auf diesen Knoten begrenzt. Antworten erscheinen hier und werden erst nach deiner Freigabe übernommen.",
    add: "OpenClaw hinzufügen",
    addHint: "Der Agent erhält keinen direkten Schreibzugriff.",
    noAgent: "Noch kein aktiver Agent in diesem Workspace.",
    selectAgent: "Agent auswählen",
    prompt: "Dein Auftrag",
    placeholder:
      "Erweitere diesen Knoten und recherchiere die wichtigsten Punkte.",
    context: "Knoten-Kontext",
    send: "Auftrag senden",
    sending: "Auftrag wird gesendet…",
    noTasks: "Noch keine Aufträge für diesen Knoten.",
    apply: "Übernehmen",
    reject: "Verwerfen",
    inspect: "Vorschlag ansehen",
    hide: "Vorschlag ausblenden",
    proposed: "Vorschlag bereit",
    completed: "Antwort bereit",
    failed: "Auftrag fehlgeschlagen",
    running: "In Bearbeitung",
    queued: "Gesendet · wartet auf Agent",
    revoke: "Zugang widerrufen",
    paired: "Gepaart",
    pendingPairing: "Wartet auf Pairing",
    runnerOnline:
      "Lokaler Agent aktiv – neue Aufträge werden automatisch abgeholt.",
    runnerOffline:
      "Lokaler Agent ist nicht erreichbar – der Auftrag bleibt sicher wartend.",
    runnerHint: "Installiere und aktiviere das BloomMD-Plugin in OpenClaw.",
    pairing:
      "Diesen einmaligen Pairing-Code sicher an den lokalen Agenten übergeben:",
    audit:
      "Auftrag, Kontext, Agent und deine Entscheidung werden im Workspace-Audit festgehalten.",
    nodeMissing:
      "Wähle einen Knoten in einer Cloud-Datei aus, um einen Agenten zu fragen.",
    close: "Schließen",
    applied: "Übernommen",
    rejected: "Verworfen",
    stale: "Quelle geändert",
    history: "Frühere Aufträge",
    current: "Aktueller Kontext",
    proposalPreview: "Knoten-Vorschau",
    proposalSource: "Ausgangsknoten",
    proposalResult: "Vorgeschlagene Erweiterung",
    tree: "Baum",
    markdown: "Markdown",
    added: "neu",
    changed: "geändert",
    unchanged: "unverändert",
    task: "Aufgabe",
    decision: "Entscheidung",
  },
  en: {
    manageTitle: "Manage agents",
    manageSubtitle:
      "Connect local agents to this workspace or revoke their access.",
    nodeTitle: "Ask an agent about this node",
    nodeSubtitle:
      "The instruction is limited to this node. Responses appear here and are only applied after your approval.",
    add: "Add OpenClaw",
    addHint: "The agent never receives direct write access.",
    noAgent: "There is no active agent in this workspace yet.",
    selectAgent: "Select agent",
    prompt: "Your instruction",
    placeholder: "Expand this node and research the most important points.",
    context: "Node context",
    send: "Send instruction",
    sending: "Sending instruction…",
    noTasks: "No instructions for this node yet.",
    apply: "Apply",
    reject: "Discard",
    inspect: "Inspect proposal",
    hide: "Hide proposal",
    proposed: "Proposal ready",
    completed: "Response ready",
    failed: "Instruction failed",
    running: "Working",
    queued: "Sent · waiting for agent",
    revoke: "Revoke access",
    paired: "Paired",
    pendingPairing: "Waiting for pairing",
    runnerOnline:
      "Local agent active – new instructions are picked up automatically.",
    runnerOffline:
      "Local agent is unavailable – the instruction remains safely queued.",
    runnerHint: "Install and enable the BloomMD plugin in OpenClaw.",
    pairing: "Pass this one-time pairing code securely to the local agent:",
    audit:
      "The instruction, context, agent and your decision are recorded in the workspace audit trail.",
    nodeMissing: "Select a node in a cloud document to ask an agent.",
    close: "Close",
    applied: "Applied",
    rejected: "Discarded",
    stale: "Source changed",
    history: "Earlier instructions",
    current: "Current context",
    proposalPreview: "Node preview",
    proposalSource: "Source node",
    proposalResult: "Proposed expansion",
    tree: "Tree",
    markdown: "Markdown",
    added: "added",
    changed: "changed",
    unchanged: "unchanged",
    task: "Task",
    decision: "Decision",
  },
} as const;

type Text = { [K in keyof typeof copy.de]: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function WorkspaceAgentPanel({
  open,
  onClose,
  workspace,
  document,
  locale,
  onApplied,
  mode = "manage",
  node = null,
  variant = "dialog",
}: WorkspaceAgentPanelProps) {
  const text = copy[locale];
  const isNodeComposer = mode === "node";
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  // Bumped when the workspace agent event stream reports a change, so the agent-token section reloads too.
  const [refreshTick, setRefreshTick] = useState(0);
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status === "active"),
    [agents],
  );
  const activeAgent =
    activeAgents.find((agent) => agent.id === selectedAgentId) ??
    activeAgents[0];
  const scopedTasks = useMemo(
    () =>
      isNodeComposer && node
        ? tasks.filter((task) => task.nodeId === node.id)
        : tasks,
    [isNodeComposer, node, tasks],
  );
  const canAssign =
    isNodeComposer &&
    workspace.role !== "viewer" &&
    Boolean(activeAgent && document && node);

  const load = async ({
    background = false,
  }: { background?: boolean } = {}) => {
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const [agentResponse, taskResponse] = await Promise.all([
        fetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/agents`, {
          cache: "no-store",
        }),
        fetch(
          `/api/workspaces/${encodeURIComponent(workspace.id)}/agent-tasks`,
          { cache: "no-store" },
        ),
      ]);
      const agentData = (await agentResponse.json()) as {
        agents?: Agent[];
        error?: string;
      };
      const taskData = (await taskResponse.json()) as {
        tasks?: Task[];
        error?: string;
      };
      if (!agentResponse.ok || !agentData.agents)
        throw new Error(agentData.error || "Agents could not be loaded.");
      if (!taskResponse.ok || !taskData.tasks)
        throw new Error(taskData.error || "Agent tasks could not be loaded.");
      setAgents(agentData.agents);
      setTasks(taskData.tasks);
    } catch (loadError) {
      if (background) {
        console.error("[BloomMD] Background agent refresh failed:", loadError);
      } else {
        setError(errorMessage(loadError, "Agents could not be loaded."));
      }
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
    const events = new EventSource(
      `/api/workspaces/${encodeURIComponent(workspace.id)}/agent-events`,
    );
    events.addEventListener("workspace-agent", () => {
      void load({ background: true });
      setRefreshTick((tick) => tick + 1);
    });
    const timer = window.setInterval(() => {
      void load({ background: true });
      setRefreshTick((tick) => tick + 1);
    }, 60_000);
    return () => {
      events.close();
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace.id, node?.id]);

  const addAgent = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspace.id)}/agents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openclaw",
            displayName: "OpenClaw",
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        pairingCode?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Agent could not be added.");
      setPairingCode(payload.pairingCode ?? null);
      await load();
    } catch (addError) {
      setError(errorMessage(addError, "Agent could not be added."));
    } finally {
      setSaving(false);
    }
  };

  const revokeAgent = async (agent: Agent) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspace.id)}/agents/${encodeURIComponent(agent.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Agent could not be revoked.");
      await load();
    } catch (revokeError) {
      setError(errorMessage(revokeError, "Agent could not be revoked."));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeAgent || !document || !node) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspace.id)}/agent-tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: activeAgent.id,
            documentId: document.id,
            filename: document.filename,
            nodeId: node.id,
            command,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Agent task could not be queued.");
      setCommand("");
      await load();
    } catch (submitError) {
      setError(errorMessage(submitError, "Agent task could not be queued."));
    } finally {
      setSaving(false);
    }
  };

  const review = async (proposal: Proposal, action: "apply" | "reject") => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspace.id)}/agent-proposals/${encodeURIComponent(proposal.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Proposal could not be reviewed.");
      if (action === "apply") await onApplied();
      await load();
    } catch (reviewError) {
      setError(errorMessage(reviewError, "Proposal could not be reviewed."));
    } finally {
      setSaving(false);
    }
  };

  const taskLabel = (task: Task) =>
    task.status === "proposed"
      ? text.proposed
      : task.status === "completed"
        ? text.completed
        : task.status === "failed"
          ? text.failed
          : task.status === "queued"
            ? text.queued
            : text.running;
  const proposalLabel = (proposal: Proposal) =>
    proposal.status === "applied"
      ? text.applied
      : proposal.status === "rejected"
        ? text.rejected
        : proposal.status === "stale"
          ? text.stale
          : text.proposed;
  if (!open) return null;

  const body = (
    <>
      {error && (
        <p
          className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
          <LoaderCircle size={16} className="animate-spin" />
          Loading…
        </p>
      ) : isNodeComposer ? (
        <NodeComposer
          text={text}
          node={node}
          document={document}
          activeAgents={activeAgents}
          activeAgent={activeAgent}
          setSelectedAgentId={setSelectedAgentId}
          command={command}
          setCommand={setCommand}
          canAssign={canAssign}
          saving={saving}
          submit={submit}
          scopedTasks={scopedTasks}
          taskLabel={taskLabel}
          proposalLabel={proposalLabel}
          expandedProposal={expandedProposal}
          setExpandedProposal={setExpandedProposal}
          review={review}
          locale={locale}
        />
      ) : (
        <AgentManager
          text={text}
          workspace={workspace}
          activeAgents={activeAgents}
          saving={saving}
          addAgent={addAgent}
          revokeAgent={revokeAgent}
          pairingCode={pairingCode}
          locale={locale}
        />
      )}
      {!isNodeComposer && workspace.role === "owner" && !loading && (
        <AgentTokenAccess
          workspaceId={workspace.id}
          locale={locale}
          refreshTick={refreshTick}
          onApplied={onApplied}
        />
      )}
      <p className="mt-5 text-xs leading-5 text-[var(--color-ink-faint)]">
        {text.audit}
      </p>
    </>
  );

  if (variant === "sidebar") {
    return (
      <section
        className="h-full bg-[var(--color-surface)] px-4 py-4"
        aria-label={text.nodeTitle}
        data-testid="node-agent-sidebar"
      >
        {body}
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/35 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
    >
      <section
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={isNodeComposer ? text.nodeTitle : text.manageTitle}
        data-testid={
          isNodeComposer ? "node-agent-composer" : "workspace-agent-manager"
        }
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex gap-3">
            <span className="mt-0.5 rounded-lg bg-[#FF6B35]/10 p-2 text-[#FF6B35]">
              <Bot size={20} />
            </span>
            <div>
              <h2 className="font-[var(--font-display,Outfit,sans-serif)] text-lg font-semibold">
                {isNodeComposer ? text.nodeTitle : text.manageTitle}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--color-ink-muted)]">
                {isNodeComposer ? text.nodeSubtitle : text.manageSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)]"
            aria-label={text.close}
          >
            <X size={18} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{body}</div>
      </section>
    </div>
  );
}

function AgentManager({
  text,
  workspace,
  activeAgents,
  saving,
  addAgent,
  revokeAgent,
  pairingCode,
  locale,
}: {
  text: Text;
  workspace: WorkspaceInfo;
  activeAgents: Agent[];
  saving: boolean;
  addAgent: () => Promise<void>;
  revokeAgent: (agent: Agent) => Promise<void>;
  pairingCode: string | null;
  locale: "de" | "en";
}) {
  const setupHref = `https://bloommd.io/docs/openclaw-agent${locale === "en" ? "?lang=en" : ""}`;
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileText size={15} />
            OpenClaw
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-ink-faint)]">
            {text.addHint}
          </p>
        </div>
        {workspace.role === "owner" && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void addAgent()}
            className="rounded bg-[#FF6B35] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Bot size={14} className="mr-1 inline" />
            {text.add}
          </button>
        )}
      </div>
      <a
        href={setupHref}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs font-semibold text-[#C94D20] hover:bg-[#FF6B35]/5"
      >
        <span>
          {locale === "de"
            ? "OpenClaw auf diesem Rechner einrichten"
            : "Set up OpenClaw on this computer"}
        </span>
        <span aria-hidden="true">↗</span>
      </a>
      {activeAgents.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
          {text.noAgent}
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {activeAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-border)] px-3 py-2"
            >
              <div className="text-sm font-medium">{agent.displayName}</div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck size={13} />
                  {agent.pairedAt ? text.paired : text.pendingPairing}
                </span>
                {workspace.role === "owner" && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void revokeAgent(agent)}
                    className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-700 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"
                  >
                    <UserMinus size={13} className="mr-1 inline" />
                    {text.revoke}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {pairingCode && (
        <div className="mt-3 rounded border border-[#FF6B35]/35 bg-[#FF6B35]/5 p-3 text-sm">
          <p className="font-medium">{text.pairing}</p>
          <code className="mt-2 block break-all rounded bg-[var(--color-surface-raised)] p-2 text-xs">
            {pairingCode}
          </code>
        </div>
      )}
    </section>
  );
}

function RunnerStatus({ agent, text }: { agent: Agent; text: Text }) {
  const lastSeen = agent.lastSeenAt ? Date.parse(agent.lastSeenAt) : Number.NaN;
  const runnerIsOnline =
    Number.isFinite(lastSeen) && Date.now() - lastSeen < 90_000;
  return (
    <div
      className={`mt-3 rounded-md border px-3 py-2 text-xs leading-5 ${runnerIsOnline ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"}`}
    >
      <p className="font-semibold">
        {runnerIsOnline ? text.runnerOnline : text.runnerOffline}
      </p>
      {!runnerIsOnline && (
        <code className="mt-1 block break-all text-[11px] text-[var(--color-ink-muted)]">
          {text.runnerHint}
        </code>
      )}
    </div>
  );
}

function TaskStatusChip({
  status,
  label,
}: {
  status: Task["status"];
  label: string;
}) {
  const style =
    status === "failed"
      ? "border-red-500/35 bg-red-500/10 text-red-800 dark:text-red-200"
      : status === "proposed" || status === "completed"
        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
        : status === "running"
          ? "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200"
          : "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200";
  const Icon =
    status === "failed"
      ? CircleX
      : status === "proposed" || status === "completed"
        ? CircleCheck
        : status === "running"
          ? LoaderCircle
          : Clock3;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${style}`}
    >
      <Icon
        size={13}
        className={status === "running" ? "animate-spin" : undefined}
      />
      {label}
    </span>
  );
}

type PreviewMode = "tree" | "markdown";
type DiffLine = { kind: "added" | "removed" | "unchanged"; value: string };

function lineDiff(source: string, proposed: string): DiffLine[] {
  const sourceLines = source.split("\n");
  const proposedLines = proposed.split("\n");
  const rows = Array.from({ length: sourceLines.length + 1 }, () =>
    Array<number>(proposedLines.length + 1).fill(0),
  );
  const rowAt = (sourceIndex: number, proposedIndex: number) =>
    rows[sourceIndex]?.[proposedIndex] ?? 0;
  for (
    let sourceIndex = sourceLines.length - 1;
    sourceIndex >= 0;
    sourceIndex -= 1
  ) {
    for (
      let proposedIndex = proposedLines.length - 1;
      proposedIndex >= 0;
      proposedIndex -= 1
    ) {
      const row = rows[sourceIndex];
      if (!row) continue;
      row[proposedIndex] =
        sourceLines[sourceIndex] === proposedLines[proposedIndex]
          ? rowAt(sourceIndex + 1, proposedIndex + 1) + 1
          : Math.max(
              rowAt(sourceIndex + 1, proposedIndex),
              rowAt(sourceIndex, proposedIndex + 1),
            );
    }
  }
  const result: DiffLine[] = [];
  let sourceIndex = 0;
  let proposedIndex = 0;
  while (
    sourceIndex < sourceLines.length ||
    proposedIndex < proposedLines.length
  ) {
    if (
      sourceIndex < sourceLines.length &&
      proposedIndex < proposedLines.length &&
      sourceLines[sourceIndex] === proposedLines[proposedIndex]
    ) {
      result.push({ kind: "unchanged", value: sourceLines[sourceIndex] ?? "" });
      sourceIndex += 1;
      proposedIndex += 1;
    } else if (
      proposedIndex < proposedLines.length &&
      (sourceIndex === sourceLines.length ||
        rowAt(sourceIndex, proposedIndex + 1) >=
          rowAt(sourceIndex + 1, proposedIndex))
    ) {
      result.push({ kind: "added", value: proposedLines[proposedIndex] ?? "" });
      proposedIndex += 1;
    } else if (sourceIndex < sourceLines.length) {
      result.push({ kind: "removed", value: sourceLines[sourceIndex] ?? "" });
      sourceIndex += 1;
    }
  }
  return result;
}

function ProposalPreview({
  proposal,
  node,
  text,
}: {
  proposal: Proposal;
  node: NodeContext;
  text: Text;
}) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("tree");
  const proposalText =
    proposal.proposedNodeContent ?? proposal.proposedMarkdown;
  const outline = proposalText
    .split("\n")
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => ({
      depth: line.match(/^#+/)?.[0].length ?? 1,
      title: line.replace(/^#{1,6}\s+/, ""),
    }));
  const diff = lineDiff(node.content, proposalText);
  const hasChanges = diff.some((line) => line.kind !== "unchanged");
  const childNodes = proposal.proposedChildNodes ?? [];
  return (
    <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#C94D20]">
          {text.proposalPreview}
        </p>
        <div
          className="flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          role="tablist"
          aria-label={text.proposalPreview}
        >
          <button
            type="button"
            role="tab"
            aria-selected={previewMode === "tree"}
            onClick={() => setPreviewMode("tree")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${previewMode === "tree" ? "bg-[#FF6B35] text-white" : "text-[var(--color-ink-muted)]"}`}
          >
            <ListTree size={13} />
            {text.tree}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={previewMode === "markdown"}
            onClick={() => setPreviewMode("markdown")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${previewMode === "markdown" ? "bg-[#FF6B35] text-white" : "text-[var(--color-ink-muted)]"}`}
          >
            <GitCompareArrows size={13} />
            {text.markdown}
          </button>
        </div>
      </div>
      {previewMode === "tree" ? (
        <div
          className="mt-3 grid gap-3 border-l-2 border-[var(--color-border)] pl-3"
          data-testid="proposal-tree-preview"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
              {text.proposalSource}
            </p>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
              <CircleDashed
                size={14}
                className="text-[var(--color-ink-faint)]"
              />
              {node.title}
              <span className="rounded-full bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]">
                {hasChanges ? text.changed : text.unchanged}
              </span>
            </div>
          </div>
          <div className="border-l-2 border-[#FF6B35] pl-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#C94D20]">
              {text.proposalResult}
            </p>
            {outline.length > 0 || childNodes.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink)]">
                {outline.map((entry, index) => (
                  <li
                    key={`${entry.title}-${index}`}
                    style={{
                      marginLeft: `${Math.max(0, entry.depth - 1) * 12}px`,
                    }}
                    className="flex items-center gap-2"
                  >
                    <CircleDashed
                      size={13}
                      className="shrink-0 text-[#FF6B35]"
                    />
                    {entry.title}
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                      {text.added}
                    </span>
                  </li>
                ))}
                {childNodes.map((child, index) => (
                  <li
                    key={`${child.kind}-${child.title}-${index}`}
                    className="flex items-center gap-2"
                  >
                    <CircleDashed size={13} className="shrink-0 text-[#FF6B35]" />
                    {child.title}
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                      {text.added} · {child.kind === "task" ? text.task : text.decision}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink-muted)]">
                {proposalText}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div
          className="mt-3 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)]"
          data-testid="proposal-markdown-preview"
        >
          <pre className="min-w-max p-2 text-xs leading-5 whitespace-pre-wrap">
            {diff.map((line, index) => (
              <span
                key={`${line.kind}-${index}-${line.value}`}
                className={`block px-1 ${line.kind === "added" ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100" : line.kind === "removed" ? "bg-red-500/10 text-red-800 line-through dark:text-red-200" : "text-[var(--color-ink-muted)]"}`}
              >
                <span className="mr-2 select-none text-[var(--color-ink-faint)]">
                  {line.kind === "added"
                    ? "+"
                    : line.kind === "removed"
                      ? "−"
                      : " "}
                </span>
                {line.value || " "}
              </span>
            ))}
            {childNodes.map((child, index) => (
              <span
                key={`${child.kind}-${child.title}-${index}`}
                className="block bg-emerald-500/10 px-1 text-emerald-900 dark:text-emerald-100"
              >
                <span className="mr-2 select-none text-[var(--color-ink-faint)]">+</span>
                {`## ${child.title} <!-- ${child.kind} -->`}
              </span>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

function NodeComposer({
  text,
  node,
  document,
  activeAgents,
  activeAgent,
  setSelectedAgentId,
  command,
  setCommand,
  canAssign,
  saving,
  submit,
  scopedTasks,
  taskLabel,
  proposalLabel,
  expandedProposal,
  setExpandedProposal,
  review,
  locale,
}: {
  text: Text;
  node: NodeContext | null;
  document: ActiveDocument | null;
  activeAgents: Agent[];
  activeAgent: Agent | undefined;
  setSelectedAgentId: (value: string) => void;
  command: string;
  setCommand: (value: string) => void;
  canAssign: boolean;
  saving: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  scopedTasks: Task[];
  taskLabel: (task: Task) => string;
  proposalLabel: (proposal: Proposal) => string;
  expandedProposal: string | null;
  setExpandedProposal: (
    value: string | null | ((value: string | null) => string | null),
  ) => void;
  review: (proposal: Proposal, action: "apply" | "reject") => Promise<void>;
  locale: "de" | "en";
}) {
  if (!node || !document)
    return (
      <p className="rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-ink-muted)]">
        {text.nodeMissing}
      </p>
    );
  const currentTasks = scopedTasks.filter(
    (task) =>
      task.status === "queued" ||
      task.status === "running" ||
      task.status === "proposed" ||
      task.proposals.some((proposal) => proposal.status === "pending"),
  );
  const historyTasks = scopedTasks.filter(
    (task) => !currentTasks.some((current) => current.id === task.id),
  );
  const renderTask = (task: Task) => (
    <article
      key={task.id}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C94D20]">
              @{task.agentName}
            </p>
            <TaskStatusChip status={task.status} label={taskLabel(task)} />
          </div>
          <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
            {task.prompt}
          </p>
        </div>
        <time className="shrink-0 text-xs text-[var(--color-ink-faint)]">
          {new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(task.createdAt))}
        </time>
      </div>
      {task.resultSummary && (
        <p className="mt-3 text-sm leading-6 text-[var(--color-ink-muted)]">
          {task.resultSummary}
        </p>
      )}
      {task.failureCode && (
        <p className="mt-3 text-xs font-medium text-red-700 dark:text-red-300">
          {task.failureCode}
        </p>
      )}
      {task.proposals.map((proposal) => (
        <div
          key={proposal.id}
          className="mt-3 rounded-md border border-[#FF6B35]/35 bg-[#FF6B35]/5 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TaskStatusChip
              status={
                proposal.status === "pending"
                  ? "proposed"
                  : proposal.status === "rejected" ||
                      proposal.status === "stale"
                    ? "failed"
                    : "completed"
              }
              label={proposalLabel(proposal)}
            />
            <div className="flex flex-wrap gap-2">
              {proposal.status === "pending" && (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void review(proposal, "reject")}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    <X size={13} className="mr-1 inline" />
                    {text.reject}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void review(proposal, "apply")}
                    className="rounded bg-[#FF6B35] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Check size={13} className="mr-1 inline" />
                    {text.apply}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() =>
                  setExpandedProposal((value) =>
                    value === proposal.id ? null : proposal.id,
                  )
                }
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold"
              >
                <Eye size={13} className="mr-1 inline" />
                {expandedProposal === proposal.id ? text.hide : text.inspect}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--color-ink-muted)]">
            {proposal.rationale}
          </p>
          {expandedProposal === proposal.id && (
            <ProposalPreview proposal={proposal} node={node} text={text} />
          )}
        </div>
      ))}
    </article>
  );
  return (
    <>
      <section
        className="border-l-2 border-[#FF6B35] bg-[#FF6B35]/5 px-4 py-3"
        aria-label={text.context}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[#C94D20]">
          {text.context}
        </p>
        <p className="mt-1 text-base font-semibold text-[var(--color-ink)]">
          {node.title}
        </p>
        <p className="mt-1 font-mono text-xs text-[var(--color-ink-faint)]">
          {node.path}
        </p>
        {node.content.trim() && (
          <p className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink-muted)]">
            {node.content}
          </p>
        )}
      </section>
      <form onSubmit={(event) => void submit(event)} className="mt-4">
        <label className="text-sm font-semibold" htmlFor="node-agent-choice">
          {text.selectAgent}
        </label>
        <select
          id="node-agent-choice"
          value={activeAgent?.id ?? ""}
          onChange={(event) => setSelectedAgentId(event.target.value)}
          disabled={activeAgents.length === 0 || saving}
          className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
        >
          {activeAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.displayName}
            </option>
          ))}
        </select>
        {activeAgent && <RunnerStatus agent={activeAgent} text={text} />}
        {activeAgents.length === 0 && (
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            {text.noAgent}
          </p>
        )}
        <label
          className="mt-4 block text-sm font-semibold"
          htmlFor="node-agent-command"
        >
          {text.prompt}
        </label>
        <textarea
          id="node-agent-command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={text.placeholder}
          className="mt-2 min-h-28 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm outline-none focus:border-[#FF6B35]"
          disabled={!canAssign || saving}
        />
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={!canAssign || saving || !command.trim()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded bg-[#FF6B35] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
            {saving ? text.sending : text.send}
          </button>
        </div>
      </form>
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{text.current}</h3>
          <span className="text-xs text-[var(--color-ink-faint)]">
            {currentTasks.length}
          </span>
        </div>
        {currentTasks.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-ink-faint)]">
            {text.noTasks}
          </p>
        ) : (
          <div className="mt-3 grid gap-3">{currentTasks.map(renderTask)}</div>
        )}
        {historyTasks.length > 0 && (
          <details className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-muted)]">
              {text.history} ({historyTasks.length})
            </summary>
            <div className="mt-3 grid gap-3">
              {historyTasks.map(renderTask)}
            </div>
          </details>
        )}
      </section>
    </>
  );
}
