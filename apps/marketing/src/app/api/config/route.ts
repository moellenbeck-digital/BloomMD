import { NextResponse } from "next/server";
import { publicAppUrl } from "../../../lib/deployment";

// GET /api/config -> public marketing configuration.
export async function GET() {
  return NextResponse.json({
    appUrl: publicAppUrl(),
  });
}
