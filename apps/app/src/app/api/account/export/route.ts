import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { exportAccountData, normalizeUuid } from "../../../../lib/db";

export async function GET() {
  const session = await getSession();
  const userId = normalizeUuid(session?.userId);
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await exportAccountData(userId);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="bloommd-account-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
