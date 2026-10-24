interface ChatMessage {
  role?: string;
  content?: string | null;
}

interface ChatRequest {
  messages?: ChatMessage[];
  model?: string;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function completion(message: Record<string, unknown>, finishReason: "tool_calls" | "stop") {
  return json({
    id: `chatcmpl-e2e-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1_000),
    model: "workspace-agent",
    choices: [{ index: 0, message, finish_reason: finishReason }],
  });
}

function commandFor(messages: ChatMessage[]) {
  const text = [...messages].reverse().find((message) => message.role === "user")?.content?.toLowerCase() ?? "";
  // The BloomMD runner prompt always contains the pairing-code safety warning. Detect the
  // claimed-task contract first so that wording cannot accidentally route a node task to a
  // setup-only fixture.
  if (text.includes("bloommd runner has already claimed exactly one task")) {
    return "node /home/node/.openclaw/workspace/skills/bloommd-workspace-agent/process-task.mjs";
  }
  if (text.includes("pair")) return "node /home/node/.openclaw/workspace/skills/bloommd-workspace-agent/pair.mjs";
  if (text.includes("revok")) return "node /home/node/.openclaw/workspace/skills/bloommd-workspace-agent/assert-revoked.mjs";
  return "node /home/node/.openclaw/workspace/skills/bloommd-workspace-agent/process-task.mjs";
}

Bun.serve({
  port: 8080,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return new Response("ok");
    if (request.method === "GET" && url.pathname === "/v1/models") {
      return json({ object: "list", data: [{ id: "workspace-agent", object: "model", owned_by: "bloommd-e2e" }] });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") return json({ error: { message: "Not found" } }, 404);
    const body = await request.json() as ChatRequest;
    const messages = body.messages ?? [];
    const toolResult = [...messages]
      .reverse()
      .find((message) => message.role === "tool")?.content;
    if (toolResult) {
      // The deterministic skill writes the same structured result to its ephemeral file and to
      // stdout. Returning that stdout exercises the production parser without inventing a
      // second, test-only proposal format.
      return completion({ role: "assistant", content: toolResult }, "stop");
    }
    const command = commandFor(messages);
    console.log(`[model-stub] selected ${command.split("/").at(-1) ?? "unknown"}`);
    return completion({
      role: "assistant",
      content: null,
      tool_calls: [{
        id: `call_e2e_${crypto.randomUUID().replaceAll("-", "")}`,
        type: "function",
        function: { name: "exec", arguments: JSON.stringify({ command }) },
      }],
    }, "tool_calls");
  },
});
