import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import { SyncProvider } from "./SyncProvider";

/**
 * Minimal WebSocket stand-in. The real server always answers a SyncStep1, so the fake mirrors that
 * contract: tests drive `open`, `deliver` and `close` explicitly.
 */
class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  binaryType = "";
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: Uint8Array) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  deliver(bytes: Uint8Array) {
    this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
  }
}

const globals = globalThis as unknown as { WebSocket: unknown };
let originalWebSocket: unknown;

beforeEach(() => {
  originalWebSocket = globals.WebSocket;
  globals.WebSocket = FakeWebSocket;
  FakeWebSocket.instances = [];
});

afterEach(() => {
  globals.WebSocket = originalWebSocket;
});

const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;

function syncStep1(doc: Y.Doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

describe("SyncProvider presence", () => {
  test("accepts a freshly minted ticket URL before connecting", () => {
    const provider = new SyncProvider({ url: "ws://placeholder", doc: new Y.Doc() });
    provider.setConnectionUrl("wss://sync.example/ws/document?ticket=short-lived");
    expect((provider as unknown as { url: string }).url).toBe("wss://sync.example/ws/document?ticket=short-lived");
    provider.destroy();
  });

  test("announces the supplied identity for hover labels", () => {
    const doc = new Y.Doc();
    const provider = new SyncProvider({
      url: "ws://test",
      doc,
      awarenessIdentity: { name: "Martin Moellenbeck", email: "martin@example.test" },
    });
    provider.connect();
    latest().open();

    expect(provider.getAwarenessStatesForTest().get(doc.clientID)).toMatchObject({
      name: "Martin Moellenbeck",
      email: "martin@example.test",
      selectedNodeId: null,
    });
    provider.destroy();
  });

  test("announces the local user when the connection opens", () => {
    const doc = new Y.Doc();
    const provider = new SyncProvider({ url: "ws://test", doc });
    provider.connect();
    latest().open();

    const states = provider.getAwarenessStatesForTest();
    expect(states.get(doc.clientID)).toBeTruthy();
    provider.destroy();
  });

  test("restores the local user after a reconnect", () => {
    // Regression: cleanup() cleared the local awareness state and nothing restored it, so a
    // reconnected client stayed invisible to every peer for the rest of the session.
    const doc = new Y.Doc();
    const provider = new SyncProvider({ url: "ws://test", doc });
    provider.connect();
    latest().open();
    provider.setLocalAwarenessField("selectedNodeId", "node-7");

    latest().close();
    expect(provider.getAwarenessStatesForTest().get(doc.clientID)).toBeUndefined();

    provider.connect();
    latest().open();

    const restored = provider.getAwarenessStatesForTest().get(doc.clientID);
    expect(restored).toBeTruthy();
    expect(restored?.selectedNodeId).toBe("node-7");
    provider.destroy();
  });

  test("does not stack awareness listeners across reconnects", () => {
    const doc = new Y.Doc();
    let notifications = 0;
    const provider = new SyncProvider({ url: "ws://test", doc, onAwarenessChange: () => { notifications += 1; } });

    provider.connect();
    latest().open();
    for (let i = 0; i < 3; i += 1) {
      latest().close();
      provider.connect();
      latest().open();
    }

    notifications = 0;
    provider.setLocalAwarenessField("selectedNodeId", "node-1");
    // One local change must not fan out into one notification per past connection.
    expect(notifications).toBeLessThanOrEqual(2);
    provider.destroy();
  });
});

describe("SyncProvider connection health", () => {
  test("keeps local changes and advertises them after reconnect", () => {
    const doc = new Y.Doc();
    const provider = new SyncProvider({ url: "ws://test", doc });
    provider.connect();
    latest().open();
    latest().close(1006, "network interruption");

    doc.getMap("pending").set("title", "Local change while offline");
    provider.connect();
    const socket = latest();
    socket.open();
    const beforeServerHandshake = socket.sent.length;
    socket.deliver(syncStep1(new Y.Doc()));

    expect(doc.getMap("pending").get("title")).toBe("Local change while offline");
    expect(socket.sent.length).toBeGreaterThan(beforeServerHandshake);
    provider.destroy();
  });

  test("refreshes the URL before an automatic reconnect", async () => {
    const doc = new Y.Doc();
    let refreshCount = 0;
    const provider = new SyncProvider({
      url: "ws://stale",
      doc,
      refreshUrl: async () => {
        refreshCount += 1;
        return "ws://fresh";
      },
      reconnectBaseDelayMs: 1,
    });
    provider.connect();
    latest().open();
    latest().close(1006, "network interruption");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(refreshCount).toBe(1);
    expect(latest().url).toBe("ws://fresh");
    latest().open();
    expect(provider.getStatus()).toBe("connected");
    provider.destroy();
  });

  test("stops on permanent room failures and exposes a manual retry", async () => {
    const doc = new Y.Doc();
    const failures: string[] = [];
    let failureReason: string | undefined;
    const provider = new SyncProvider({
      url: "ws://test",
      doc,
      refreshUrl: async () => "ws://fresh",
      onFailure: (failure) => {
        failures.push(failure.kind);
        failureReason = failure.reason;
      },
      reconnectBaseDelayMs: 1,
    });
    provider.connect();
    latest().open();
    latest().close(4004, "File not found; token=must-not-leak");

    expect(provider.getStatus()).toBe("failed");
    expect(failures).toEqual(["file-not-found"]);
    expect(failureReason).toBe("file-not-found");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(FakeWebSocket.instances).toHaveLength(1);

    provider.retry();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(latest().url).toBe("ws://fresh");
    latest().open();
    expect(provider.getStatus()).toBe("connected");
    provider.destroy();
  });

  test("fails immediately on unauthorized close when no ticket refresh is available", () => {
    const doc = new Y.Doc();
    let failureKind: string | undefined;
    const provider = new SyncProvider({
      url: "ws://test",
      doc,
      onFailure: (failure) => { failureKind = failure.kind; },
    });
    provider.connect();
    latest().open();
    latest().close(4001, "token=must-not-leak");

    expect(provider.getStatus()).toBe("failed");
    expect(failureKind).toBe("unauthorized");
    provider.destroy();
  });

  test("stops after a refreshed ticket is rejected as unauthorized", async () => {
    const doc = new Y.Doc();
    let refreshCount = 0;
    let failureKind: string | undefined;
    const provider = new SyncProvider({
      url: "ws://stale",
      doc,
      refreshUrl: async () => {
        refreshCount += 1;
        return "ws://fresh";
      },
      reconnectBaseDelayMs: 1,
      onFailure: (failure) => { failureKind = failure.kind; },
    });

    provider.connect();
    latest().open();
    latest().close(4001, "token=must-not-leak");

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(refreshCount).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    latest().open();
    latest().close(4001, "token=must-not-leak");

    expect(provider.getStatus()).toBe("failed");
    expect(failureKind).toBe("unauthorized");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(FakeWebSocket.instances).toHaveLength(2);
    provider.destroy();
  });

  test("bounds automatic reconnect attempts", async () => {
    const doc = new Y.Doc();
    let failureKind: string | undefined;
    const provider = new SyncProvider({
      url: "ws://test",
      doc,
      maxReconnectAttempts: 1,
      reconnectBaseDelayMs: 1,
      onFailure: (failure) => { failureKind = failure.kind; },
    });
    provider.connect();
    latest().open();
    latest().close(1006);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(FakeWebSocket.instances).toHaveLength(2);
    latest().open();
    latest().close(1006);

    expect(provider.getStatus()).toBe("failed");
    expect(failureKind).toBe("reconnect-exhausted");
    provider.destroy();
  });

  test("does not reconnect after an explicit disconnect", async () => {
    const doc = new Y.Doc();
    const provider = new SyncProvider({ url: "ws://test", doc, reconnectBaseDelayMs: 1 });
    provider.connect();
    latest().open();
    latest().close(1006);

    provider.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(provider.getStatus()).toBe("disconnected");
    expect(FakeWebSocket.instances).toHaveLength(1);
    provider.destroy();
  });

  test("stops reconnecting and reports access revocation", async () => {
    const doc = new Y.Doc();
    let revoked = 0;
    let failureKind: string | undefined;
    const provider = new SyncProvider({
      url: "ws://test",
      doc,
      onAccessRevoked: () => { revoked += 1; },
      onFailure: (failure) => { failureKind = failure.kind; },
    });
    provider.connect();
    latest().open();

    latest().close(4003);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(revoked).toBe(1);
    expect(provider.getStatus()).toBe("failed");
    expect(failureKind).toBe("access-revoked");
    expect(FakeWebSocket.instances).toHaveLength(1);
    provider.retry();
    expect(FakeWebSocket.instances).toHaveLength(2);
    latest().open();
    expect(provider.getStatus()).toBe("connected");
    provider.destroy();
  });

  test("sends a resync probe while the connection is quiet", async () => {
    const doc = new Y.Doc();
    const provider = new SyncProvider({ url: "ws://test", doc, resyncIntervalMs: 5, connectionTimeoutMs: 10_000 });
    provider.connect();
    const socket = latest();
    socket.open();
    const before = socket.sent.length;

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(socket.sent.length).toBeGreaterThan(before);
    provider.destroy();
  });

  test("closes a silent connection so the reconnect path can run", async () => {
    const doc = new Y.Doc();
    const provider = new SyncProvider({ url: "ws://test", doc, resyncIntervalMs: 5, connectionTimeoutMs: 10 });
    provider.connect();
    const socket = latest();
    socket.open();

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(provider.getStatus()).not.toBe("connected");
    provider.destroy();
  });

  test("keeps a connection alive while the server keeps answering", async () => {
    const doc = new Y.Doc();
    const provider = new SyncProvider({ url: "ws://test", doc, resyncIntervalMs: 5, connectionTimeoutMs: 30 });
    provider.connect();
    const socket = latest();
    socket.open();

    // Message type 9 is unknown to the protocol and ignored, which isolates the liveness timer.
    const keepAlive = setInterval(() => socket.deliver(new Uint8Array([9])), 5);
    await new Promise((resolve) => setTimeout(resolve, 50));
    clearInterval(keepAlive);

    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
    expect(provider.getStatus()).toBe("connected");
    provider.destroy();
  });

  test("stops probing after destroy", async () => {
    const doc = new Y.Doc();
    const provider = new SyncProvider({ url: "ws://test", doc, resyncIntervalMs: 5 });
    provider.connect();
    const socket = latest();
    socket.open();
    provider.destroy();

    const after = socket.sent.length;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(socket.sent.length).toBe(after);
  });
});
