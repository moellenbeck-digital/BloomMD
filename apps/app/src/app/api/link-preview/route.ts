import { fetchLinkPreview } from "../../../lib/link-preview";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  if (!value || value.length > 2048) return NextResponse.json({ error: "A valid URL is required." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  try {
    return NextResponse.json({ preview: await fetchLinkPreview(value) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview unavailable." }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
  }
}
