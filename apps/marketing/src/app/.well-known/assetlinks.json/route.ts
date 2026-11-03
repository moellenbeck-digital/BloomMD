import { androidAssetLinks, wellKnownResponse } from "@/lib/app-links";

// Read at request time: the certificate fingerprints come from the runtime environment, not the build.
export const dynamic = "force-dynamic";

export function GET() {
  return wellKnownResponse(androidAssetLinks(), "GET");
}

export function HEAD() {
  return wellKnownResponse(androidAssetLinks(), "HEAD");
}
