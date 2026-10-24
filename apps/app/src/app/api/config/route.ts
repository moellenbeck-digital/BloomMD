import { NextResponse } from "next/server";

// GET /api/config → server configuration for remote clients
export async function GET() {
  const syncUrl = process.env.NEXT_PUBLIC_SYNC_URL ?? "";

  return NextResponse.json({
    syncUrl,
    ticketEndpoint: syncUrl ? "/api/sync-ticket" : "",
  });
}
