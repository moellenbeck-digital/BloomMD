import { NextResponse } from "next/server";
import { getBuildInfo } from "../../../lib/build-info";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBuildInfo("marketing"), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
