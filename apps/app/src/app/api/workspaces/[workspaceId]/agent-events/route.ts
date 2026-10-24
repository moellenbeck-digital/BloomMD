import { getApiRequestIdentity } from "../../../../../lib/auth";
import {
  getWorkspaceForUser,
  normalizeUuid,
  subscribeWorkspaceAgentEvents,
  type WorkspaceAgentEvent,
} from "../../../../../lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

function encodeEvent(event: WorkspaceAgentEvent): Uint8Array {
  return new TextEncoder().encode(
    `event: workspace-agent\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

export async function GET(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId } = await params;
  if (!identity || !userId)
    return Response.json(
      { error: "A cloud session is required." },
      { status: 401 },
    );
  try {
    const workspace = await getWorkspaceForUser(userId, workspaceId);
    let releaseStream = () => {};
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        let unsubscribe = () => {};
        const heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 25_000);
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
            workspace.id,
            (event) => {
              if (!closed) controller.enqueue(encodeEvent(event));
            },
          );
          if (closed) return;
          controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));
        } catch (error) {
          console.error(
            "[BloomMD] Workspace agent event stream failed:",
            error,
          );
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
            : "Workspace agent events are unavailable.",
      },
      { status: 403 },
    );
  }
}
