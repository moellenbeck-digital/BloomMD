import { parseFile } from "./parser";

/**
 * A client-local association between one Markdown file and one authorized cloud document.
 *
 * Filesystem identity deliberately does not live here: Desktop and Obsidian keep their own
 * local registry key (absolute path or vault-relative path). This object may be persisted in
 * either client, but is safe to pass through browser-safe collaboration code.
 */
export const SHARED_DOCUMENT_BINDING_SCHEMA_VERSION = 1 as const;

export type SharedDocumentConnectionState = "connected" | "offline" | "conflict" | "revoked";
export type SharedDocumentStateKind = "local" | "sharing" | SharedDocumentConnectionState | "unshared";

export interface SharedDocumentBinding {
  schemaVersion: typeof SHARED_DOCUMENT_BINDING_SCHEMA_VERSION;
  workspaceId: string;
  documentId: string;
  cloudFilename: string;
  lastAcknowledgedMarkdownHash: string;
  lastKnownCloudVersion: number;
  connectionState: SharedDocumentConnectionState;
}

export interface LocalSharedDocumentState {
  kind: "local" | "unshared";
  localMarkdownHash: string;
}

export interface SharingSharedDocumentState {
  kind: "sharing";
  localMarkdownHash: string;
  workspaceId: string;
  cloudFilename: string;
}

export interface BoundSharedDocumentState {
  kind: SharedDocumentConnectionState;
  binding: SharedDocumentBinding;
}

export type SharedDocumentState = LocalSharedDocumentState | SharingSharedDocumentState | BoundSharedDocumentState;

export type SharedDocumentEvent =
  | {
      type: "share_requested";
      workspaceId: string;
      cloudFilename: string;
    }
  | {
      type: "share_confirmed";
      documentId: string;
      cloudVersion: number;
      markdownHash: string;
    }
  | {
      type: "connection_restored";
    }
  | {
      type: "connection_lost";
    }
  | {
      type: "conflict_detected";
    }
  | {
      type: "conflict_resolved";
      cloudVersion: number;
      markdownHash: string;
    }
  | {
      type: "access_revoked";
    }
  | {
      type: "mirror_acknowledged";
      cloudVersion: number;
      markdownHash: string;
    }
  | {
      type: "unshared";
      localMarkdownHash: string;
    };

export type SharedDocumentMirrorWriteKind = "echo" | "external-change";

/**
 * Browser-safe 64-bit content fingerprint used for mirror echo detection. Two independent
 * 32-bit FNV-1a lanes avoid BigInt so the contract also compiles for Obsidian's ES2018 target.
 * It is not a security primitive and never authorizes access; credentials and document
 * permissions remain server-side.
 */
export function hashSharedDocumentMarkdown(markdown: string): string {
  const normalized = sharedDocumentFingerprint(markdown);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < normalized.length; index += 1) {
    const codeUnit = normalized.charCodeAt(index);
    first = Math.imul(first ^ codeUnit, 0x01000193);
    second = Math.imul(second ^ codeUnit, 0x85ebca6b);
  }
  return `fnv1a32x2:${toHex32(first)}${toHex32(second)}`;
}

/**
 * A shared file is represented as Markdown locally but as a Y.Doc in the workspace. The first
 * share can add BloomMD heading IDs and a current timestamp to the cloud serialization without
 * changing what the person wrote. Those transport details must not be mistaken for concurrent
 * edits, otherwise a pristine first share immediately conflicts with itself.
 */
function sharedDocumentFingerprint(markdown: string): string {
  const document = parseFile("shared-document.md", markdown);
  const { id: _id, created: _created, updated: _updated, ...frontmatter } = document.frontmatter;
  const visit = (nodeId: string): unknown => {
    const node = document.nodes.get(nodeId);
    if (!node) return null;
    return {
      level: node.level,
      title: node.title,
      content: node.content,
      ...(node.metadata ? { metadata: sortFingerprintValue(node.metadata) } : {}),
      children: node.children.map(visit),
    };
  };
  return JSON.stringify({
    preamble: document.preamble ?? "",
    frontmatter: sortFingerprintValue(frontmatter),
    root: visit(document.rootId),
  });
}

function sortFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortFingerprintValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortFingerprintValue(child)]));
  }
  return value;
}

function toHex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function createLocalSharedDocumentState(localMarkdownHash: string): LocalSharedDocumentState {
  return { kind: "local", localMarkdownHash: requireText(localMarkdownHash, "localMarkdownHash") };
}

/**
 * Applies only state changes that are meaningful for a per-file shared document. Invalid
 * transitions throw rather than silently reconnecting or discarding a local copy.
 */
export function transitionSharedDocumentState(state: SharedDocumentState, event: SharedDocumentEvent): SharedDocumentState {
  switch (event.type) {
    case "share_requested":
      if (state.kind !== "local" && state.kind !== "unshared") return invalidTransition(state.kind, event.type);
      return {
        kind: "sharing",
        localMarkdownHash: state.localMarkdownHash,
        workspaceId: requireText(event.workspaceId, "workspaceId"),
        cloudFilename: requireText(event.cloudFilename, "cloudFilename"),
      };
    case "share_confirmed":
      if (state.kind !== "sharing") return invalidTransition(state.kind, event.type);
      return boundState({
        schemaVersion: SHARED_DOCUMENT_BINDING_SCHEMA_VERSION,
        workspaceId: state.workspaceId,
        documentId: requireText(event.documentId, "documentId"),
        cloudFilename: state.cloudFilename,
        lastAcknowledgedMarkdownHash: requireText(event.markdownHash, "markdownHash"),
        lastKnownCloudVersion: requireVersion(event.cloudVersion),
        connectionState: "connected",
      });
    case "connection_lost":
      if (state.kind !== "connected") return invalidTransition(state.kind, event.type);
      return updateBoundState(state, "offline");
    case "connection_restored":
      if (state.kind !== "offline") return invalidTransition(state.kind, event.type);
      return updateBoundState(state, "connected");
    case "conflict_detected":
      if (state.kind !== "connected" && state.kind !== "offline") return invalidTransition(state.kind, event.type);
      return updateBoundState(state, "conflict");
    case "conflict_resolved":
      if (state.kind !== "conflict") return invalidTransition(state.kind, event.type);
      return boundState({
        ...state.binding,
        connectionState: "connected",
        lastAcknowledgedMarkdownHash: requireText(event.markdownHash, "markdownHash"),
        lastKnownCloudVersion: requireVersion(event.cloudVersion),
      });
    case "access_revoked":
      if (!isBoundState(state)) return invalidTransition(state.kind, event.type);
      return updateBoundState(state, "revoked");
    case "mirror_acknowledged":
      if (state.kind !== "connected" && state.kind !== "offline") return invalidTransition(state.kind, event.type);
      return boundState({
        ...state.binding,
        lastAcknowledgedMarkdownHash: requireText(event.markdownHash, "markdownHash"),
        lastKnownCloudVersion: requireVersion(event.cloudVersion),
      });
    case "unshared":
      return {
        kind: "unshared",
        localMarkdownHash: requireText(event.localMarkdownHash, "localMarkdownHash"),
      };
  }
}

/**
 * A watcher event matching the most recently acknowledged mirror content is the client's own
 * write (typically a remote Yjs update rendered to Markdown), not a new local edit to upload.
 */
export function classifySharedDocumentMirrorWrite(binding: SharedDocumentBinding, markdownHash: string): SharedDocumentMirrorWriteKind {
  return binding.lastAcknowledgedMarkdownHash === requireText(markdownHash, "markdownHash") ? "echo" : "external-change";
}

export function serializeSharedDocumentBinding(binding: SharedDocumentBinding): string {
  return JSON.stringify(validateSharedDocumentBinding(binding));
}

/**
 * Parses persisted client-local metadata defensively. Unknown schema versions stay unreadable
 * rather than being guessed, so a future migration cannot accidentally reconnect a file.
 */
export function parseSharedDocumentBinding(value: string): SharedDocumentBinding {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Shared document binding is not valid JSON.");
  }
  return validateSharedDocumentBinding(parsed);
}

export function validateSharedDocumentBinding(value: unknown): SharedDocumentBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Shared document binding must be an object.");
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== SHARED_DOCUMENT_BINDING_SCHEMA_VERSION) {
    throw new Error(`Unsupported shared document binding schema version: ${String(candidate.schemaVersion)}.`);
  }
  const connectionState = candidate.connectionState;
  if (!isConnectionState(connectionState)) throw new Error("Shared document binding has an invalid connectionState.");
  return {
    schemaVersion: SHARED_DOCUMENT_BINDING_SCHEMA_VERSION,
    workspaceId: requireText(candidate.workspaceId, "workspaceId"),
    documentId: requireText(candidate.documentId, "documentId"),
    cloudFilename: requireText(candidate.cloudFilename, "cloudFilename"),
    lastAcknowledgedMarkdownHash: requireText(candidate.lastAcknowledgedMarkdownHash, "lastAcknowledgedMarkdownHash"),
    lastKnownCloudVersion: requireVersion(candidate.lastKnownCloudVersion),
    connectionState,
  };
}

function updateBoundState(state: SharedDocumentState, connectionState: SharedDocumentConnectionState): BoundSharedDocumentState {
  if (!isBoundState(state)) return invalidTransition(state.kind, connectionState);
  return boundState({ ...state.binding, connectionState });
}

function boundState(binding: SharedDocumentBinding): BoundSharedDocumentState {
  const validBinding = validateSharedDocumentBinding(binding);
  return { kind: validBinding.connectionState, binding: validBinding };
}

function isBoundState(state: SharedDocumentState): state is BoundSharedDocumentState {
  return state.kind === "connected" || state.kind === "offline" || state.kind === "conflict" || state.kind === "revoked";
}

function isConnectionState(value: unknown): value is SharedDocumentConnectionState {
  return value === "connected" || value === "offline" || value === "conflict" || value === "revoked";
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function requireVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("cloudVersion must be a non-negative safe integer.");
  }
  return value;
}

function invalidTransition(from: SharedDocumentStateKind, event: SharedDocumentEvent["type"] | SharedDocumentConnectionState): never {
  throw new Error(`Cannot transition shared document state from ${from} using ${event}.`);
}
