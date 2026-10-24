import type { Metadata } from "next";
import { resolveShareLink } from "../../../lib/db";
import { sharedMapView } from "../../../lib/shared-map";
import { SharedMap } from "./SharedMap";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BloomMD – geteilte Map",
  // A share link is for the people it was sent to, never for search engines.
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Tokens are base64url and need no decoding; a malformed one simply resolves to nothing.
  const shared = await resolveShareLink(token).catch(() => null);
  if (!shared) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#FAFAFA] px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Dieser Link ist nicht mehr gültig</h1>
          <p className="mt-2 text-sm text-[#666]">Er ist abgelaufen oder wurde widerrufen. Bitte frag nach einem neuen Link.</p>
          <p className="mt-1 text-sm text-[#999]">This link has expired or was revoked.</p>
        </div>
      </main>
    );
  }
  return <SharedMap map={sharedMapView(shared.filename, shared.markdown)} updatedAt={shared.updatedAt} />;
}
