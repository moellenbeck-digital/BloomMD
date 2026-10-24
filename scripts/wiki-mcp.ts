import { WIKI_AGENT_TOOLS, callWikiAgentTool } from "../packages/core/src/wiki-agent";

type JsonRpcRequest = { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> };

const rootDir = Bun.argv[2] ?? process.env.BLOOMMD_WIKI_DIR;
if (!rootDir) {
  process.stderr.write("Usage: bun run wiki:mcp -- <wiki-bundle-dir>\n");
  process.exit(1);
}

function send(message: Record<string, unknown>): void {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

async function handle(message: JsonRpcRequest): Promise<void> {
  if (message.method === "notifications/initialized") return;
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "bloommd-wiki", version: "0.1.0" } } });
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools: WIKI_AGENT_TOOLS } });
    return;
  }
  if (message.method === "tools/call") {
    const params = message.params ?? {};
    const name = typeof params.name === "string" ? params.name : "";
    try {
      const result = await callWikiAgentTool(rootDir!, name, (params.arguments ?? {}) as Record<string, unknown>);
      send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result.value, null, 2) }], ...(result.isError ? { isError: true } : {}) } });
    } catch (error) {
      send({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Wiki tool failed." }] } });
    }
    return;
  }
  if (message.id !== undefined) send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1]);
    if (!Number.isSafeInteger(length) || length < 0) { buffer = buffer.subarray(headerEnd + 4); continue; }
    const messageEnd = headerEnd + 4 + length;
    if (buffer.length < messageEnd) return;
    const payload = buffer.subarray(headerEnd + 4, messageEnd).toString("utf8");
    buffer = buffer.subarray(messageEnd);
    try { void handle(JSON.parse(payload) as JsonRpcRequest); }
    catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid MCP message"}\n`); }
  }
});
