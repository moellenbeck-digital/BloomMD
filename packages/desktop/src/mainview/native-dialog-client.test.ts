import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RPC_MAX_REQUEST_TIME_MS } from "../shared/native-dialog";
import type { NativeDialogResultMessage } from "../shared/rpc-types";
import { createNativeDialogClient } from "./native-dialog-client";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TestRPC {
  request: Record<string, (params: unknown) => Promise<unknown>>;
  addMessageListener: (message: string, listener: (payload: NativeDialogResultMessage) => void) => void;
}
type CreateTestRPC = (options: { maxRequestTime: number; transport: { registerHandler: (handler: (packet: Packet) => void) => void; send: (packet: Packet) => void } }) => TestRPC;

type Packet = { type: "request"; id: number; method: string; params: unknown } | { type: "response"; id: number; success: boolean; payload?: unknown; error?: string } | { type: "message"; id: string; payload: unknown };

describe("native dialogs outlive the RPC request timeout", () => {
  // Scaled-down timings: the real timeout is RPC_MAX_REQUEST_TIME_MS (60 s), see the contract test below.
  const REQUEST_TIMEOUT_MS = 40;
  const DIALOG_OPEN_MS = 160;

  let createRPC: CreateTestRPC;
  const hadWindow = "window" in globalThis;

  beforeAll(async () => {
    // electrobun/view reads `window` at import time.
    if (!hadWindow) (globalThis as Record<string, unknown>).window = {};
    createRPC = (await import("electrobun/view")).createRPC as unknown as CreateTestRPC;
  });

  afterAll(() => {
    if (!hadWindow) delete (globalThis as Record<string, unknown>).window;
  });

  /** Webview-side RPC wired to a fake Bun that answers requests through `bun`. */
  function setup(bun: (packet: Extract<Packet, { type: "request" }>, respond: (payload: unknown) => void) => void) {
    let handler: ((packet: Packet) => void) | undefined;
    const rpc = createRPC({
      maxRequestTime: REQUEST_TIMEOUT_MS,
      transport: {
        registerHandler: (h) => { handler = h; },
        send: (request) => {
          if (request.type !== "request") return;
          queueMicrotask(() => bun(request, (payload) => handler?.({ type: "response", id: request.id, success: true, payload })));
        },
      },
    });
    const dialogs = createNativeDialogClient((method, params) => rpc.request[method]!(params) as Promise<{ started: true }>);
    rpc.addMessageListener("nativeDialogResult", (message) => dialogs.handleResult(message));
    const sendFromBun = (message: NativeDialogResultMessage) => handler?.({ type: "message", id: "nativeDialogResult", payload: message });
    return { rpc, dialogs, sendFromBun };
  }

  test("a folder choice made after the request timeout is still delivered", async () => {
    let dialogId = "";
    const { dialogs, sendFromBun } = setup((request, respond) => {
      dialogId = (request.params as { dialogId: string }).dialogId;
      respond({ started: true });
    });

    const choice = dialogs.open("chooseDirectory");
    await sleep(DIALOG_OPEN_MS);
    expect(dialogs.pendingCount()).toBe(1);
    sendFromBun({ dialogId, method: "chooseDirectory", result: { path: "/Users/me/Notes" } });

    expect(await choice).toEqual({ path: "/Users/me/Notes" });
    expect(dialogs.pendingCount()).toBe(0);
  });

  test("a canceled dialog stays a quiet empty choice, a real error stays an error", async () => {
    const ids: string[] = [];
    const { dialogs, sendFromBun } = setup((request, respond) => {
      ids.push((request.params as { dialogId: string }).dialogId);
      respond({ started: true });
    });

    const canceled = dialogs.open("chooseDirectory");
    const failed = dialogs.open("chooseDirectory");
    await sleep(DIALOG_OPEN_MS);
    sendFromBun({ dialogId: ids[0]!, method: "chooseDirectory", result: { path: null } });
    sendFromBun({ dialogId: ids[1]!, method: "chooseDirectory", result: { path: null, error: "Selected path is not a directory." } });

    expect(await canceled).toEqual({ path: null });
    expect(await failed).toEqual({ path: null, error: "Selected path is not a directory." });
  });

  test("an error raised in Bun rejects the dialog", async () => {
    let dialogId = "";
    const { dialogs, sendFromBun } = setup((request, respond) => {
      dialogId = (request.params as { dialogId: string }).dialogId;
      respond({ started: true });
    });

    const outcome = dialogs.open("importFile").then(() => null, (error: Error) => error);
    await sleep(DIALOG_OPEN_MS);
    sendFromBun({ dialogId, method: "importFile", error: "disk full" });

    expect((await outcome)?.message).toBe("disk full");
    expect(dialogs.pendingCount()).toBe(0);
  });

  test("resource file and import dialogs also outlive the timeout and pass their parameters", async () => {
    const seen: Array<{ method: string; params: Record<string, unknown> }> = [];
    const { dialogs, sendFromBun } = setup((request, respond) => {
      seen.push({ method: request.method, params: request.params as Record<string, unknown> });
      respond({ started: true });
    });

    const resource = dialogs.open("chooseResourceFile", { kind: "pdf" });
    const imported = dialogs.open("importFile");
    await sleep(DIALOG_OPEN_MS);
    sendFromBun({ dialogId: seen[0]!.params.dialogId as string, method: "chooseResourceFile", result: { path: "resources/a.pdf" } });
    sendFromBun({ dialogId: seen[1]!.params.dialogId as string, method: "importFile", result: { filePath: null } });

    expect(await resource).toEqual({ path: "resources/a.pdf" });
    expect(await imported).toEqual({ filePath: null });
    expect(seen.map((entry) => [entry.method, entry.params.kind])).toEqual([["chooseResourceFile", "pdf"], ["importFile", undefined]]);
  });

  test("a result that arrives before the acknowledgement is not lost", async () => {
    const { dialogs, sendFromBun } = setup((request, respond) => {
      const { dialogId } = request.params as { dialogId: string };
      sendFromBun({ dialogId, method: "chooseDirectory", result: { path: "/fast" } });
      respond({ started: true });
    });

    expect(await dialogs.open("chooseDirectory")).toEqual({ path: "/fast" });
  });

  test("a dialog Bun never acknowledges fails with the normal timeout instead of hanging", async () => {
    const { dialogs } = setup(() => {});

    const outcome = await dialogs.open("chooseDirectory").then(() => null, (error: Error) => error);

    expect(outcome?.message).toBe("RPC request timed out.");
    expect(dialogs.pendingCount()).toBe(0);
  });

  test("an ordinary request that outlives the timeout still fails with the RPC timeout", async () => {
    const { rpc } = setup((request, respond) => {
      if (request.method === "listMindmaps") setTimeout(() => respond({ files: [] }), DIALOG_OPEN_MS);
    });

    const outcome = await rpc.request.listMindmaps!({}).then(() => null, (error: Error) => error);

    expect(outcome?.message).toBe("RPC request timed out.");
  });
});

describe("desktop RPC wiring", () => {
  test("keeps the 60 s timeout for ordinary requests on both sides", async () => {
    expect(RPC_MAX_REQUEST_TIME_MS).toBe(60_000);
    const view = await readFile(join(SRC, "mainview", "rpc.ts"), "utf8");
    const bun = await readFile(join(SRC, "bun", "index.ts"), "utf8");

    expect(view).toContain("maxRequestTime: RPC_MAX_REQUEST_TIME_MS,");
    expect(bun).toContain("maxRequestTime: RPC_MAX_REQUEST_TIME_MS,");
    expect(view).not.toContain("Infinity");
    expect(bun).not.toContain("Infinity");
  });

  test("routes exactly the three native dialogs through the dialog client", async () => {
    const view = await readFile(join(SRC, "mainview", "rpc.ts"), "utf8");
    const bun = await readFile(join(SRC, "bun", "index.ts"), "utf8");

    expect(view).toContain('return nativeDialogs.open("chooseDirectory");');
    expect(view).toContain('return nativeDialogs.open("chooseResourceFile", { kind });');
    expect(view).toContain('return nativeDialogs.open("importFile");');
    expect(view).toContain("nativeDialogResult: (message) => {");
    expect(view).not.toMatch(/request\.(chooseDirectory|chooseResourceFile|importFile)\(/);
    expect(bun).toContain('startNativeDialog(dialogId, "chooseDirectory"');
    expect(bun).toContain('startNativeDialog(dialogId, "chooseResourceFile"');
    expect(bun).toContain('startNativeDialog(dialogId, "importFile"');
    expect(bun).not.toMatch(/(?:chooseDirectory|chooseResourceFile|importFile): async/);
  });
});
