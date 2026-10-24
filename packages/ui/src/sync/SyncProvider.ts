import type * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import {
  SYNC_ORIGIN,
  MSG_SYNC,
  MSG_AWARENESS,
  AWARENESS_COLORS,
  type SyncStatus,
  type SyncFailure,
  type AwarenessIdentity,
  type AwarenessUserState,
} from "./types";
import { getAwarenessColor } from "./presence";

export interface SyncProviderOptions {
  url: string;
  doc: Y.Doc;
  awarenessIdentity?: AwarenessIdentity;
  refreshUrl?: () => Promise<string>;
  onStatusChange?: (status: SyncStatus) => void;
  onFailure?: (failure: SyncFailure) => void;
  /** Called when the server revokes the current workspace/document access. */
  onAccessRevoked?: () => void;
  onAwarenessChange?: (states: Map<number, AwarenessUserState>) => void;
  /** How often a SyncStep1 is sent to resync and prove the connection is alive. */
  resyncIntervalMs?: number;
  /** Silence longer than this closes the socket so the reconnect path can run. */
  connectionTimeoutMs?: number;
  /** Base delay for reconnect backoff. Kept configurable for deterministic tests. */
  reconnectBaseDelayMs?: number;
  /** Maximum automatic attempts before requiring an explicit retry. */
  maxReconnectAttempts?: number;
}

const DEFAULT_RESYNC_INTERVAL_MS = 20_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 60_000;

export class SyncProvider {
  private ws: WebSocket | null = null;
  private doc: Y.Doc;
  private url: string;
  private refreshUrl: (() => Promise<string>) | null;
  private onStatusChange: ((status: SyncStatus) => void) | null;
  private onFailure: ((failure: SyncFailure) => void) | null;
  private onAccessRevoked: (() => void) | null;
  private onAwarenessChange: ((states: Map<number, AwarenessUserState>) => void) | null;
  private awareness: Awareness;
  private status: SyncStatus = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private reconnecting = false;
  private updateHandler: ((update: Uint8Array, origin: unknown) => void) | null = null;
  private awarenessUpdateHandler: (
    (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void
  ) | null = null;
  private awarenessChangeHandler: (() => void) | null = null;
  /**
   * Disconnecting clears the local awareness state so peers stop showing this user. The state has
   * to be remembered here, otherwise a reconnect would rejoin the room invisibly.
   */
  private localAwarenessState: AwarenessUserState;
  private resyncTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private readonly resyncIntervalMs: number;
  private readonly connectionTimeoutMs: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly maxReconnectAttempts: number;
  private reconcilingColor = false;

  constructor(opts: SyncProviderOptions) {
    this.doc = opts.doc;
    this.url = opts.url;
    this.refreshUrl = opts.refreshUrl ?? null;
    this.onStatusChange = opts.onStatusChange ?? null;
    this.onFailure = opts.onFailure ?? null;
    this.onAccessRevoked = opts.onAccessRevoked ?? null;
    this.onAwarenessChange = opts.onAwarenessChange ?? null;
    this.resyncIntervalMs = opts.resyncIntervalMs ?? DEFAULT_RESYNC_INTERVAL_MS;
    this.connectionTimeoutMs = opts.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
    this.reconnectBaseDelayMs = opts.reconnectBaseDelayMs ?? 1000;
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 6;

    // Create awareness tied to Y.Doc
    this.awareness = new Awareness(this.doc);

    // Set initial local state with auto-generated identity
    const clientID = this.doc.clientID;
    const name = opts.awarenessIdentity?.name?.trim()
      || opts.awarenessIdentity?.email?.split("@", 1)[0]?.trim()
      || `User ${(clientID % 1000) + 1}`;
    this.localAwarenessState = {
      name,
      ...(opts.awarenessIdentity?.email?.trim() ? { email: opts.awarenessIdentity.email.trim() } : {}),
      color: getAwarenessColor(opts.awarenessIdentity, clientID),
      selectedNodeId: null,
    };
    this.awareness.setLocalState({ ...this.localAwarenessState });
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getClientID(): number {
    return this.doc.clientID;
  }

  /**
   * Installs a freshly minted, short-lived ticket URL before connecting. Native integrations use
   * this to keep credential exchange outside the reusable WebSocket protocol implementation.
   */
  setConnectionUrl(url: string, refreshUrl?: () => Promise<string>): void {
    if (this.ws) throw new Error("SYNC_PROVIDER_ALREADY_CONNECTED");
    if (!url.trim()) throw new Error("SYNC_PROVIDER_URL_REQUIRED");
    this.url = url;
    this.refreshUrl = refreshUrl ?? null;
  }

  /** Presence snapshot. Exposed so reconnect behaviour can be asserted without a live server. */
  getAwarenessStatesForTest(): Map<number, AwarenessUserState> {
    return this.awareness.getStates() as Map<number, AwarenessUserState>;
  }

  setLocalAwarenessField(field: string, value: unknown): void {
    // Mirrored so the field survives a reconnect, which resets the awareness state.
    this.localAwarenessState = { ...this.localAwarenessState, [field]: value };
    this.awareness.setLocalStateField(field, value);
  }

  connect(): void {
    if (this.ws) return;
    this.clearReconnectTimer();
    this.shouldReconnect = true;

    this.setStatus("connecting");
    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      // Send SyncStep1 for Y.Doc sync
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      ws.send(encoding.toUint8Array(encoder));

      // Forward local Y.Doc updates to server
      this.updateHandler = (update: Uint8Array, origin: unknown) => {
        if (origin === SYNC_ORIGIN) return;
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.writeUpdate(enc, update);
        this.ws.send(encoding.toUint8Array(enc));
      };
      this.doc.on("update", this.updateHandler);

      // Forward local awareness changes to server (skip remote-origin to prevent echo)
      this.awarenessUpdateHandler = (
        { added, updated, removed },
        origin: unknown,
      ) => {
        if (origin === "remote") return;
        const changedClients = added.concat(updated).concat(removed);
        if (this.ws?.readyState !== WebSocket.OPEN || changedClients.length === 0) return;
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_AWARENESS);
        encoding.writeVarUint8Array(enc, encodeAwarenessUpdate(this.awareness, changedClients));
        this.ws.send(encoding.toUint8Array(enc));
        // Also notify UI
        this.notifyAwarenessChange();
      };
      this.awareness.on("update", this.awarenessUpdateHandler);

      // Listen for awareness changes from remote to update UI. Tracked so a reconnect does not
      // stack another listener on top of the previous one.
      this.awarenessChangeHandler = () => this.notifyAwarenessChange();
      this.awareness.on("change", this.awarenessChangeHandler);

      // A reconnect starts from a cleared awareness state, so this user has to re-announce itself.
      if (this.awareness.getLocalState() === null) {
        this.awareness.setLocalState({ ...this.localAwarenessState });
      }

      // Send initial awareness state
      const awarenessEnc = encoding.createEncoder();
      encoding.writeVarUint(awarenessEnc, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEnc,
        encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
      );
      ws.send(encoding.toUint8Array(awarenessEnc));

      this.setStatus("connected");
      this.lastMessageAt = Date.now();
      this.startResyncTimer();
    };

    ws.onmessage = (event: MessageEvent) => {
      this.lastMessageAt = Date.now();
      const message =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : event.data instanceof Uint8Array
            ? event.data
            : null;
      if (!message) return;

      // An actual server frame proves that the connection made it past the WebSocket handshake.
      // Only then is it safe to reset the retry budget. Resetting on `onopen` alone lets a server
      // that immediately rejects every fresh ticket create an endless reconnect loop.
      this.reconnectAttempt = 0;

      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MSG_SYNC) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, enc, this.doc, SYNC_ORIGIN);
        if (encoding.length(enc) > 1) {
          ws.send(encoding.toUint8Array(enc));
        }
      } else if (messageType === MSG_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        try {
          applyAwarenessUpdate(this.awareness, update, "remote");
        } catch (error) {
          // A malformed presence frame must not kill the message handler for the whole session.
          console.warn("[bloommd] Ignored malformed awareness update:", {
            error: error instanceof Error ? error.name : "unknown",
          });
          return;
        }
        this.reconcileLocalColor();
        this.notifyAwarenessChange();
      }
    };

    ws.onclose = (event) => {
      // Ignore a late event from a socket that has already been replaced or explicitly cleaned up.
      if (this.ws !== ws) return;
      const accessRevoked = event.code === 4003;
      const terminalFailure = this.terminalCloseFailure(event.code, event.reason);
      console.warn("[bloommd] Sync WebSocket closed:", {
        code: event.code,
        reason: this.closeReasonCategory(event.code, event.reason),
        reconnectAttempt: this.reconnectAttempt,
      });
      this.cleanup();
      this.setStatus("disconnected");
      if (accessRevoked) {
        this.onAccessRevoked?.();
        this.fail({
          kind: "access-revoked",
          code: event.code,
          reason: this.closeReasonCategory(event.code, event.reason),
        });
        return;
      }
      if (terminalFailure) {
        this.fail(terminalFailure);
        return;
      }
      this.setStatus("reconnecting");
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.cleanup();
    this.setStatus("disconnected");
  }

  /**
   * Explicitly disconnect and wait until the browser has notified the server about the closed
   * socket. Rename/delete mutations use this handoff so the server can flush the old room first.
   */
  async disconnectAndWait(): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      this.disconnect();
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      ws.addEventListener("close", finish, { once: true });
      setTimeout(finish, 1000);
      this.disconnect();
    });
  }

  destroy(): void {
    this.disconnect();
    this.awareness.destroy();
    this.onStatusChange = null;
    this.onFailure = null;
    this.onAwarenessChange = null;
  }

  /** Explicitly retry a connection that stopped after a terminal or exhausted failure. */
  retry(): void {
    if (this.ws || this.status !== "failed") return;
    this.clearReconnectTimer();
    // Count the explicit attempt so a repeatedly rejected refreshed ticket cannot loop forever.
    this.reconnectAttempt = 1;
    this.shouldReconnect = true;
    this.setStatus("reconnecting");
    void this.reconnect();
  }

  private cleanup(): void {
    this.stopResyncTimer();
    if (this.updateHandler) {
      this.doc.off("update", this.updateHandler);
      this.updateHandler = null;
    }
    if (this.awarenessUpdateHandler) {
      this.awareness.off("update", this.awarenessUpdateHandler);
      this.awarenessUpdateHandler = null;
    }
    if (this.awarenessChangeHandler) {
      this.awareness.off("change", this.awarenessChangeHandler);
      this.awarenessChangeHandler = null;
    }
    // Signal disconnect to peers. The identity is kept in localAwarenessState so a reconnect can
    // restore it instead of rejoining invisibly.
    const current = this.awareness.getLocalState() as AwarenessUserState | null;
    if (current) this.localAwarenessState = { ...current };
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  /**
   * A dropped connection does not always fire `onclose` — a sleeping laptop or a NAT timeout can
   * leave a socket that looks open but is dead. A periodic SyncStep1 doubles as a liveness probe:
   * the server always answers it, so continued silence means the connection is gone.
   */
  private startResyncTimer(): void {
    this.stopResyncTimer();
    this.resyncTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastMessageAt > this.connectionTimeoutMs) {
        // Closing triggers onclose, which cleans up and schedules the reconnect.
        this.ws.close();
        return;
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      this.ws.send(encoding.toUint8Array(encoder));
    }, this.resyncIntervalMs);
  }

  private stopResyncTimer(): void {
    if (this.resyncTimer) {
      clearInterval(this.resyncTimer);
      this.resyncTimer = null;
    }
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }

  private notifyAwarenessChange(): void {
    if (!this.onAwarenessChange) return;
    this.onAwarenessChange(
      this.awareness.getStates() as Map<number, AwarenessUserState>,
    );
  }

  /**
   * Resolve a palette collision deterministically. Each client sees the same awareness states,
   * so the lexicographically first identity keeps the contested colour and later identities move
   * to the first unused palette entry. This keeps two-person rooms visually unambiguous without
   * persisting profile preferences.
   */
  private reconcileLocalColor(): void {
    if (this.reconcilingColor) return;
    const local = this.awareness.getLocalState() as AwarenessUserState | null;
    if (!local) return;

    const peers = [...this.awareness.getStates().entries()]
      .filter(([clientID, state]) => clientID !== this.doc.clientID && Boolean(state))
      .map(([clientID, state]) => ({ clientID, state: state as AwarenessUserState }));
    const conflicts = peers.filter(({ state }) => state.color === local.color);
    if (conflicts.length === 0) return;

    const identityKey = (clientID: number, state: AwarenessUserState) =>
      `${state.email?.trim().toLocaleLowerCase() ?? ""}\u0000${state.name.trim().toLocaleLowerCase()}\u0000${clientID}`;
    const localKey = identityKey(this.doc.clientID, local);
    const winner = [
      { clientID: this.doc.clientID, state: local },
      ...conflicts,
    ].sort((left, right) => identityKey(left.clientID, left.state).localeCompare(identityKey(right.clientID, right.state)))[0];
    if (winner?.clientID === this.doc.clientID) return;

    const occupied = new Set(peers.map(({ state }) => state.color));
    const nextColor = AWARENESS_COLORS.find((color) => !occupied.has(color))
      ?? `hsl(${Math.abs([...localKey].reduce((hash, character) => hash * 31 + character.codePointAt(0)!, 7)) % 360} 65% 45%)`;
    if (nextColor === local.color) return;

    this.reconcilingColor = true;
    try {
      this.localAwarenessState = { ...this.localAwarenessState, color: nextColor };
      this.awareness.setLocalStateField("color", nextColor);
    } finally {
      this.reconcilingColor = false;
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    this.clearReconnectTimer();
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.fail({ kind: "reconnect-exhausted", attempts: this.reconnectAttempt });
      return;
    }
    const delay = Math.min(this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnect();
    }, delay);
  }

  private async reconnect(): Promise<void> {
    if (!this.shouldReconnect || this.reconnecting) return;
    this.reconnecting = true;
    try {
      if (this.refreshUrl) this.url = await this.refreshUrl();
      if (this.shouldReconnect) this.connect();
    } catch (error) {
      console.warn("[bloommd] Sync ticket refresh failed:", {
        error: error instanceof Error ? error.name : "unknown",
        reconnectAttempt: this.reconnectAttempt,
      });
      if (this.reconnectAttempt >= this.maxReconnectAttempts) {
        this.fail({ kind: "ticket-refresh-failed", attempts: this.reconnectAttempt });
      } else {
        this.setStatus("reconnecting");
        this.scheduleReconnect();
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private fail(failure: SyncFailure): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.setStatus("failed");
    this.onFailure?.(failure);
  }

  private terminalCloseFailure(code: number, reason: string | undefined): SyncFailure | null {
    if (code === 4001 && (!this.refreshUrl || this.reconnectAttempt)) {
      return { kind: "unauthorized", code, reason: this.closeReasonCategory(code, reason) };
    }
    if (code === 4004) return { kind: "file-not-found", code, reason: this.closeReasonCategory(code, reason) };
    if (code === 4008) return { kind: "room-capacity", code, reason: this.closeReasonCategory(code, reason) };
    return null;
  }

  /** Keep close diagnostics useful without copying server-provided content into logs or state. */
  private closeReasonCategory(code: number, reason: string | undefined): string | undefined {
    const knownReason = {
      4001: "unauthorized",
      4003: "access-revoked",
      4004: "file-not-found",
      4008: "room-capacity",
      1006: "abnormal-closure",
    }[code];
    if (knownReason) return knownReason;
    return reason?.trim() ? "server-provided" : undefined;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
