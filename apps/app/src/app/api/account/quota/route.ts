import { NextResponse } from "next/server";
import { accountQuotaStatus, isAccountQuotaEnforced } from "../../../../lib/account-quota";
import { getSession } from "../../../../lib/auth";
import { getAccountStorageUsage, normalizeUuid } from "../../../../lib/db";

/**
 * Storage usage of the signed-in account (#380) for the account page: bytes used, the limit and the
 * level (ok / warning from 80 % / reached). Read-only; the usage is shown whether or not the server
 * enforces the quota yet (`enforced`).
 */
export async function GET() {
  const session = await getSession();
  const userId = normalizeUuid(session?.userId);
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usedBytes = await getAccountStorageUsage(userId);
  return NextResponse.json(accountQuotaStatus(usedBytes, isAccountQuotaEnforced()), { headers: { "Cache-Control": "no-store" } });
}
