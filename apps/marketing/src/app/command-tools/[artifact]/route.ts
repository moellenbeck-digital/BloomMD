import { fetchCommandTool } from "@/lib/command-tool-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ artifact: string }> };

async function commandToolResponse(request: Request, context: RouteContext) {
  const { artifact } = await context.params;
  return fetchCommandTool(request, artifact);
}

export async function GET(request: Request, context: RouteContext) {
  return commandToolResponse(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
  return commandToolResponse(request, context);
}
