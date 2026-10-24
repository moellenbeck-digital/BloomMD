import { NextResponse } from "next/server";
import { listTemplates } from "../../../lib/templates";

export async function GET() {
  return NextResponse.json({ templates: await listTemplates() });
}
