import { fetchOpenClawPlugin } from "@/lib/openclaw-plugin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LATEST_ARTIFACT = "latest.tgz";
const VERSIONED_PLUGIN_ARTIFACT =
  /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.tgz$/;

type RouteContext = { params: Promise<{ artifact: string }> };

function versionFromArtifact(artifact: string): string | null {
  return VERSIONED_PLUGIN_ARTIFACT.exec(artifact)?.[1] ?? null;
}

async function pluginResponse(request: Request, context: RouteContext) {
  const { artifact } = await context.params;
  if (artifact === LATEST_ARTIFACT) return fetchOpenClawPlugin(request);

  const version = versionFromArtifact(artifact);
  if (!version) {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return fetchOpenClawPlugin(request, version);
}

export async function GET(request: Request, context: RouteContext) {
  return pluginResponse(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
  return pluginResponse(request, context);
}
