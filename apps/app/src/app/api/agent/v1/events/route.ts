import {
  authenticateWorkspaceAgent,
  hasQueuedWorkspaceAgentTask,
  subscribeWorkspaceAgentEvents,
  type WorkspaceAgentEvent,
} from "../../../../../lib/db";
import { readWorkspaceAgentBearerToken } from "../../../../../lib/workspace-agent-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function encodeEvent(event: WorkspaceAgentEvent): Uint8Array {
  return new TextEncoder().encode(
    `event: task-available\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

export async function GET(request: Request) {
  const token = readWorkspaceAgentBearerToken(request);
  if (!token)
    return Response.json(
      { error: "A workspace agent token is required." },
      { status: 401 },
    );
  try {
    const agent = await authenticateWorkspaceAgent(token);
    let releaseStream = () => {};
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 25_000);
        let unsubscribe = () => {};
        const release = () => {
          if (closed) return false;
          closed = true;
          unsubscribe();
          clearInterval(heartbeat);
          return true;
        };
        const close = () => {
          if (release()) controller.close();
        };
        releaseStream = release;
        request.signal.addEventListener("abort", close, { once: true });
        try {
          unsubscribe = await subscribeWorkspaceAgentEvents(
            agent.workspaceId,
            (event) => {
              if (
                event.type === "task.queued" &&
                event.agentId === agent.id &&
                !closed
              )
                controller.enqueue(encodeEvent(event));
            },
          );
          if (closed) return;
          controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));
          if (!closed && (await hasQueuedWorkspaceAgentTask(agent)))
            controller.enqueue(
              encodeEvent({
                workspaceId: agent.workspaceId,
                agentId: agent.id,
                type: "task.queued",
              }),
            );
        } catch (error) {
          console.error("[BloomMD] Agent task event stream failed:", error);
          if (release()) controller.error(error);
        }
      },
      cancel() {
        // A consumer cancellation already closes the controller. Only release resources here.
        releaseStream();
      },
    });
    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Workspace agent event stream is unavailable.",
      },
      { status: 401 },
    );
  }
}
