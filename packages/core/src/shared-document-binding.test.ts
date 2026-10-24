import { describe, expect, test } from "bun:test";
import {
  classifySharedDocumentMirrorWrite,
  createLocalSharedDocumentState,
  hashSharedDocumentMarkdown,
  parseSharedDocumentBinding,
  serializeSharedDocumentBinding,
  transitionSharedDocumentState,
  type SharedDocumentBinding,
} from "./shared-document-binding";
import { parseFile, serializeToMarkdown } from "./parser";

const binding: SharedDocumentBinding = {
  schemaVersion: 1,
  workspaceId: "workspace-1",
  documentId: "document-1",
  cloudFilename: "notes/plan.md",
  lastAcknowledgedMarkdownHash: "hash-1",
  lastKnownCloudVersion: 4,
  connectionState: "connected",
};

describe("shared document binding", () => {
  test("uses a deterministic browser-safe content fingerprint", () => {
    const first = hashSharedDocumentMarkdown("same markdown");
    expect(first).toBe(hashSharedDocumentMarkdown("same markdown"));
    expect(first).toMatch(/^fnv1a32x2:[0-9a-f]{16}$/);
    expect(first).not.toBe(hashSharedDocumentMarkdown("different markdown"));
  });

  test("ignores generated BloomMD IDs and timestamps when comparing a first shared document", () => {
    const localMarkdown = "---\ntitle: Shared note\ntags:\n  - research\n---\n\n# Shared note\n\n## Finding\n\nKeep this content.\n";
    const cloudMarkdown = serializeToMarkdown(parseFile("shared.md", localMarkdown));

    expect(hashSharedDocumentMarkdown(cloudMarkdown)).toBe(hashSharedDocumentMarkdown(localMarkdown));
    expect(hashSharedDocumentMarkdown(cloudMarkdown.replace("Keep this content.", "Changed content."))).not.toBe(hashSharedDocumentMarkdown(localMarkdown));
  });

  test("moves an explicitly shared local file into a connected binding", () => {
    const sharing = transitionSharedDocumentState(createLocalSharedDocumentState("local-hash"), {
      type: "share_requested",
      workspaceId: binding.workspaceId,
      cloudFilename: binding.cloudFilename,
    });
    const connected = transitionSharedDocumentState(sharing, {
      type: "share_confirmed",
      documentId: binding.documentId,
      cloudVersion: binding.lastKnownCloudVersion,
      markdownHash: binding.lastAcknowledgedMarkdownHash,
    });

    expect(connected).toEqual({ kind: "connected", binding });
  });

  test("models offline, conflict, recovery and access revocation explicitly", () => {
    const offline = transitionSharedDocumentState({ kind: "connected", binding }, { type: "connection_lost" });
    const conflicted = transitionSharedDocumentState(offline, { type: "conflict_detected" });
    const resolved = transitionSharedDocumentState(conflicted, {
      type: "conflict_resolved",
      cloudVersion: 5,
      markdownHash: "hash-2",
    });
    const revoked = transitionSharedDocumentState(resolved, { type: "access_revoked" });

    expect(offline.kind).toBe("offline");
    expect(conflicted.kind).toBe("conflict");
    expect(resolved).toMatchObject({ kind: "connected", binding: { lastKnownCloudVersion: 5, lastAcknowledgedMarkdownHash: "hash-2" } });
    expect(revoked.kind).toBe("revoked");
    expect(() => transitionSharedDocumentState(revoked, { type: "mirror_acknowledged", cloudVersion: 6, markdownHash: "hash-3" })).toThrow("Cannot transition");
    expect(() => transitionSharedDocumentState(revoked, { type: "connection_lost" })).toThrow("Cannot transition");
    expect(() => transitionSharedDocumentState(conflicted, { type: "mirror_acknowledged", cloudVersion: 6, markdownHash: "hash-3" })).toThrow("Cannot transition");
  });

  test("keeps an unshared local copy without retaining an active binding", () => {
    const unshared = transitionSharedDocumentState({ kind: "connected", binding }, { type: "unshared", localMarkdownHash: "local-after-unshare" });
    expect(unshared).toEqual({ kind: "unshared", localMarkdownHash: "local-after-unshare" });
  });

  test("recognizes acknowledged mirror writes as watcher echoes", () => {
    expect(classifySharedDocumentMirrorWrite(binding, "hash-1")).toBe("echo");
    expect(classifySharedDocumentMirrorWrite(binding, "hash-local-edit")).toBe("external-change");
  });

  test("roundtrips only explicit, versioned client-local metadata", () => {
    expect(parseSharedDocumentBinding(serializeSharedDocumentBinding(binding))).toEqual(binding);
    expect(() => parseSharedDocumentBinding(JSON.stringify({ ...binding, schemaVersion: 2 }))).toThrow("Unsupported shared document binding schema version");
    expect(() => parseSharedDocumentBinding(JSON.stringify({ ...binding, connectionState: "uploading" }))).toThrow("invalid connectionState");
  });
});
