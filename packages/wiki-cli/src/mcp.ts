/**
 * Minimal MCP server over stdio. MCP clients (Claude, OpenClaw) send one JSON-RPC message per line;
 * older BloomMD tooling used LSP-style `Content-Length` frames. Both are accepted, and each answer
 * uses the framing of the request it answers.
 */

export interface McpTool {
  name: string;
  /** Human-readable name for client UIs. */
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** MCP tool hints; clients such as OpenClaw use them for approval policies. */
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
}

export interface McpServerOptions {
  name: string;
  version: string;
  /** Shown to the model by clients that support server instructions. */
  instructions?: string;
  tools: McpTool[];
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
}

type JsonRpcRequest = { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> };
type Framing = "line" | "content-length";
type Writer = (text: string) => void;

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

function frame(message: Record<string, unknown>, framing: Framing): string {
  const body = JSON.stringify(message);
  return framing === "line" ? `${body}\n` : `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

export async function handleMcpMessage(options: McpServerOptions, message: JsonRpcRequest, reply: (message: Record<string, unknown>) => void): Promise<void> {
  if (message.method?.startsWith("notifications/")) return;
  if (message.method === "ping") {
    reply({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "initialize") {
    const requested = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
    reply({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: options.name, version: options.version },
        ...(options.instructions ? { instructions: options.instructions } : {}),
      },
    });
    return;
  }
  if (message.method === "tools/list") {
    reply({ jsonrpc: "2.0", id: message.id, result: { tools: options.tools } });
    return;
  }
  if (message.method === "tools/call") {
    const params = message.params && typeof message.params === "object" ? message.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    try {
      if (!options.tools.some((tool) => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
      const args = params.arguments ?? {};
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object.");
      const value = await options.call(name, args as Record<string, unknown>);
      reply({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value } });
    } catch (error) {
      reply({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed." }] } });
    }
    return;
  }
  if (message.id !== undefined) reply({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
}

/** Largest accepted message; a bigger one is dropped with an error instead of filling memory. */
export const MAX_MCP_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_HEADER_BYTES = 1024;
const CONTENT_LENGTH = "content-length:";

/** Feeds raw stdin bytes; returns the parser so tests can drive it without a process. */
export function createMcpParser(options: McpServerOptions, write: Writer, pending = new Set<Promise<void>>(), maxFrameBytes = MAX_MCP_FRAME_BYTES) {
  // Unconsumed input is store[start, end); the store grows by doubling, so a large message arriving
  // in many small chunks is copied a constant number of times, not once per chunk.
  let store = Buffer.alloc(0);
  let start = 0;
  let end = 0;
  // How much of the current line was already searched for a newline.
  let scanned = 0;
  // Remainder of an oversized message that is being dropped.
  let skipLine = false;
  let skipBytes = 0;

  const send = (message: Record<string, unknown>, framing: Framing) => {
    try {
      write(frame(message, framing));
    } catch {
      // The client is gone (closed pipe); nothing left to answer.
    }
  };
  const append = (chunk: Buffer) => {
    const live = end - start;
    if (end + chunk.length > store.length) {
      const capacity = live + chunk.length > store.length ? Math.max(64 * 1024, store.length * 2, live + chunk.length) : store.length;
      const next = capacity === store.length ? store : Buffer.allocUnsafe(capacity);
      store.copy(next, 0, start, end);
      store = next;
      start = 0;
      end = live;
    }
    chunk.copy(store, end);
    end += chunk.length;
  };
  const consume = (count: number) => {
    start += count;
    scanned = 0;
    if (start >= end) start = end = 0;
  };
  const tooLarge = (framing: Framing) => send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Invalid Request: message larger than ${maxFrameBytes} bytes` } }, framing);

  const dispatch = (payload: string, framing: Framing) => {
    let message: unknown;
    try {
      message = JSON.parse(payload);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, framing);
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, framing);
      return;
    }
    const request = message as JsonRpcRequest;
    const id = typeof request.id === "string" || typeof request.id === "number" ? request.id : undefined;
    if (typeof request.method !== "string") {
      send({ jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message: "Invalid Request" } }, framing);
      return;
    }
    const handled = handleMcpMessage(options, request, (response) => send(response, framing)).catch(() => {
      if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error" } }, framing);
    });
    pending.add(handled);
    void handled.finally(() => pending.delete(handled));
  };

  return (chunk: Buffer) => {
    append(chunk);
    while (end > start) {
      if (skipBytes > 0) {
        const dropped = Math.min(skipBytes, end - start);
        skipBytes -= dropped;
        consume(dropped);
        continue;
      }
      const view = store.subarray(start, end);
      if (skipLine) {
        const newline = view.indexOf(10);
        if (newline < 0) {
          consume(view.length);
          return;
        }
        skipLine = false;
        consume(newline + 1);
        continue;
      }
      const head = view.subarray(0, Math.min(view.length, CONTENT_LENGTH.length)).toString("utf8").toLowerCase();
      // Wait for enough bytes to tell a Content-Length header from a JSON line.
      if (head.length < CONTENT_LENGTH.length && CONTENT_LENGTH.startsWith(head)) return;
      if (head === CONTENT_LENGTH) {
        const headerEnd = view.indexOf("\r\n\r\n");
        if (headerEnd < 0) {
          if (view.length > MAX_HEADER_BYTES) {
            tooLarge("content-length");
            consume(view.length);
          }
          return;
        }
        const length = Number(/Content-Length:\s*(\d+)/i.exec(view.subarray(0, headerEnd).toString("ascii"))?.[1]);
        const bodyLength = Number.isSafeInteger(length) ? length : 0;
        const frameEnd = headerEnd + 4 + bodyLength;
        if (bodyLength > maxFrameBytes) {
          tooLarge("content-length");
          skipBytes = Math.max(0, frameEnd - view.length);
          consume(Math.min(view.length, frameEnd));
          continue;
        }
        if (view.length < frameEnd) return;
        const payload = view.subarray(headerEnd + 4, frameEnd).toString("utf8");
        consume(frameEnd);
        if (payload) dispatch(payload, "content-length");
        continue;
      }
      const newline = view.indexOf(10, scanned);
      if (newline < 0) {
        if (view.length > maxFrameBytes) {
          tooLarge("line");
          consume(view.length);
          skipLine = true;
        } else {
          scanned = view.length;
        }
        return;
      }
      if (newline > maxFrameBytes) {
        tooLarge("line");
        consume(newline + 1);
        continue;
      }
      const line = view.subarray(0, newline).toString("utf8").trim();
      consume(newline + 1);
      if (line) dispatch(line, "line");
    }
  };
}

export async function runMcpServer(options: McpServerOptions): Promise<void> {
  const pending = new Set<Promise<void>>();
  const feed = createMcpParser(options, (text) => process.stdout.write(text), pending);
  await new Promise<void>((resolve) => {
    process.stdin.on("data", (chunk: Buffer) => feed(chunk));
    process.stdin.on("end", resolve);
  });
  // A client that closes stdin right after its last request still gets the answers.
  while (pending.size > 0) await Promise.allSettled([...pending]);
}
