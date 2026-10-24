import { fetchDesktopArtifact } from "@/lib/desktop-update-proxy";

type DesktopArtifactRouteContext = { params: Promise<{ artifact: string }> };

export async function GET(request: Request, context: DesktopArtifactRouteContext) {
  const { artifact } = await context.params;
  return fetchDesktopArtifact(request, artifact);
}

export async function HEAD(request: Request, context: DesktopArtifactRouteContext) {
  const { artifact } = await context.params;
  return fetchDesktopArtifact(request, artifact);
}
