import { appleAppSiteAssociation, wellKnownResponse } from "@/lib/app-links";

// Read at request time: the team id comes from the runtime environment, not the build.
export const dynamic = "force-dynamic";

export function GET() {
  return wellKnownResponse(appleAppSiteAssociation(), "GET");
}

export function HEAD() {
  return wellKnownResponse(appleAppSiteAssociation(), "HEAD");
}
