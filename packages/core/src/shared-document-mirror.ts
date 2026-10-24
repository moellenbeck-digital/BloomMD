import {
  transitionSharedDocumentState,
  type SharedDocumentBinding,
  type SharedDocumentConnectionState,
  type SharedDocumentState,
} from "./shared-document-binding";

/** A platform adapter for one explicitly bound local Markdown file. */
export interface SharedDocumentMirrorFileAdapter {
  readMarkdown(): Promise<string>;
  writeMarkdown(markdown: string): Promise<void>;
}

export type SharedDocumentMirrorPublishResult =
  | { kind: "acknowledged"; cloudVersion: number; markdownHash?: string }
  | { kind: "conflict" }
  | { kind: "revoked" };

export type SharedDocumentMirrorResult =
  | { kind: "echo" }
  | { kind: "published"; cloudVersion: number }
  | { kind: "mirrored"; cloudVersion: number }
  | { kind: "conflict" }
  | { kind: "offline" }
  | { kind: "revoked" };

export interface SharedDocumentMirrorOptions {
  binding: SharedDocumentBinding;
  file: SharedDocumentMirrorFileAdapter;
  hashMarkdown(markdown: string): string;
  publishLocalMarkdown(markdown: string, expectedCloudVersion: number): Promise<SharedDocumentMirrorPublishResult>;
  onBindingChange?(binding: SharedDocumentBinding): void;
  /** Classifies transport failures without coupling the shared core to an HTTP client. */
  classifyPublishError?(error: unknown): "offline" | "revoked";
}

/**
 * Serializes exactly one local file with its cloud Yjs document.
 *
 * The bridge intentionally makes no filesystem, watcher, WebSocket, or Yjs assumptions. A
 * platform passes watcher content to `handleLocalMarkdown` and serialized remote Yjs content to
 * `applyRemoteMarkdown`. Every operation is serialized so a watcher echo cannot race a remote
 * mirror write into a second cloud mutation.
 */
export class SharedDocumentMirror {
  private binding: SharedDocumentBinding;
  private readonly file: SharedDocumentMirrorFileAdapter;
  private readonly hashMarkdown: (markdown: string) => string;
  private readonly publishLocalMarkdown: (markdown: string, expectedCloudVersion: number) => Promise<SharedDocumentMirrorPublishResult>;
  private readonly onBindingChange?: (binding: SharedDocumentBinding) => void;
  private readonly classifyPublishError: (error: unknown) => "offline" | "revoked";
  private operation: Promise<void> = Promise.resolve();

  constructor(options: SharedDocumentMirrorOptions) {
    this.binding = { ...options.binding };
    this.file = options.file;
    this.hashMarkdown = options.hashMarkdown;
    this.publishLocalMarkdown = options.publishLocalMarkdown;
    this.onBindingChange = options.onBindingChange;
    this.classifyPublishError = options.classifyPublishError ?? (() => "offline");
  }

  getBinding(): SharedDocumentBinding {
    return { ...this.binding };
  }

  async handleLocalMarkdown(markdown: string): Promise<SharedDocumentMirrorResult> {
    return this.enqueue(() => this.handleLocalMarkdownNow(markdown));
  }

  async applyRemoteMarkdown(markdown: string, cloudVersion: number): Promise<SharedDocumentMirrorResult> {
    return this.enqueue(() => this.applyRemoteMarkdownNow(markdown, cloudVersion));
  }

  async markConnectionRestored(): Promise<SharedDocumentBinding> {
    return this.enqueue(async () => {
      if (this.binding.connectionState === "offline") this.transition({ type: "connection_restored" });
      return this.getBinding();
    });
  }

  async markConnectionLost(): Promise<SharedDocumentBinding> {
    return this.enqueue(async () => {
      if (this.binding.connectionState === "connected") this.transition({ type: "connection_lost" });
      return this.getBinding();
    });
  }

  async markAccessRevoked(): Promise<SharedDocumentBinding> {
    return this.enqueue(async () => {
      if (this.binding.connectionState !== "revoked") this.transition({ type: "access_revoked" });
      return this.getBinding();
    });
  }

  /**
   * Resolves an explicit conflict by publishing the reviewed local version.
   *
   * This is deliberately not part of ordinary watcher handling: choosing the local version is a
   * user decision, never an implicit overwrite of a concurrent cloud update.
   */
  async resolveConflictUsingLocalMarkdown(markdown: string): Promise<SharedDocumentMirrorResult> {
    return this.enqueue(async () => {
      if (this.binding.connectionState !== "conflict") return { kind: "conflict" };
      try {
        const result = await this.publishLocalMarkdown(markdown, this.binding.lastKnownCloudVersion);
        if (result.kind === "conflict") return { kind: "conflict" };
        if (result.kind === "revoked") {
          this.transition({ type: "access_revoked" });
          return { kind: "revoked" };
        }
        const markdownHash = result.markdownHash ?? this.hashMarkdown(markdown);
        this.transition({ type: "conflict_resolved", cloudVersion: result.cloudVersion, markdownHash });
        return { kind: "published", cloudVersion: result.cloudVersion };
      } catch (error) {
        if (this.classifyPublishError(error) === "revoked") {
          this.transition({ type: "access_revoked" });
          return { kind: "revoked" };
        }
        return { kind: "offline" };
      }
    });
  }

  /** Resolves an explicit conflict by replacing the local file with the reviewed cloud version. */
  async resolveConflictUsingRemoteMarkdown(markdown: string, cloudVersion: number): Promise<SharedDocumentMirrorResult> {
    return this.enqueue(async () => {
      if (this.binding.connectionState !== "conflict") return { kind: "conflict" };
      await this.file.writeMarkdown(markdown);
      this.transition({
        type: "conflict_resolved",
        cloudVersion,
        markdownHash: this.hashMarkdown(markdown),
      });
      return { kind: "mirrored", cloudVersion };
    });
  }

  private async handleLocalMarkdownNow(markdown: string): Promise<SharedDocumentMirrorResult> {
    const markdownHash = this.hashMarkdown(markdown);
    if (markdownHash === this.binding.lastAcknowledgedMarkdownHash) return { kind: "echo" };
    if (this.binding.connectionState === "revoked") return { kind: "revoked" };
    if (this.binding.connectionState === "conflict") return { kind: "conflict" };
    if (this.binding.connectionState === "offline") return { kind: "offline" };

    try {
      const result = await this.publishLocalMarkdown(markdown, this.binding.lastKnownCloudVersion);
      if (result.kind === "conflict") {
        this.transition({ type: "conflict_detected" });
        return { kind: "conflict" };
      }
      if (result.kind === "revoked") {
        this.transition({ type: "access_revoked" });
        return { kind: "revoked" };
      }
      const acknowledgedHash = result.markdownHash ?? markdownHash;
      this.transition({ type: "mirror_acknowledged", cloudVersion: result.cloudVersion, markdownHash: acknowledgedHash });
      return { kind: "published", cloudVersion: result.cloudVersion };
    } catch (error) {
      if (this.classifyPublishError(error) === "revoked") {
        this.transition({ type: "access_revoked" });
        return { kind: "revoked" };
      }
      this.transition({ type: "connection_lost" });
      return { kind: "offline" };
    }
  }

  private async applyRemoteMarkdownNow(markdown: string, cloudVersion: number): Promise<SharedDocumentMirrorResult> {
    const remoteHash = this.hashMarkdown(markdown);
    if (this.binding.connectionState === "revoked") return { kind: "revoked" };

    const localMarkdown = await this.file.readMarkdown();
    const localHash = this.hashMarkdown(localMarkdown);
    if (localHash !== this.binding.lastAcknowledgedMarkdownHash && localHash !== remoteHash) {
      if (this.binding.connectionState !== "conflict") this.transition({ type: "conflict_detected" });
      return { kind: "conflict" };
    }

    if (this.binding.connectionState === "offline") this.transition({ type: "connection_restored" });
    if (this.binding.connectionState === "conflict") return { kind: "conflict" };

    if (localHash !== remoteHash) await this.file.writeMarkdown(markdown);
    this.transition({ type: "mirror_acknowledged", cloudVersion, markdownHash: remoteHash });
    return { kind: "mirrored", cloudVersion };
  }

  private transition(event: Parameters<typeof transitionSharedDocumentState>[1]): void {
    const state: SharedDocumentState = { kind: this.binding.connectionState as SharedDocumentConnectionState, binding: this.binding };
    const next = transitionSharedDocumentState(state, event);
    if (next.kind === "connected" || next.kind === "offline" || next.kind === "conflict" || next.kind === "revoked") {
      this.binding = next.binding;
      this.onBindingChange?.(this.getBinding());
    }
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }
}
