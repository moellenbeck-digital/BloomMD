import { NextResponse } from "next/server";
import { productionConfigErrors } from "../../../../lib/production-config";
import { checkWaitlistDatabaseReady, isWaitlistConfigured } from "../../../../lib/waitlist-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const configurationErrors = productionConfigErrors();
  let database = false;
  let databaseError: string | null = null;

  try {
    database = isWaitlistConfigured() ? await checkWaitlistDatabaseReady() : false;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "Waitlist database readiness failed.";
  }

  const ready = configurationErrors.length === 0 && database;
  return NextResponse.json(
    {
      status: ready ? "ready" : "not-ready",
      checks: {
        configuration: configurationErrors.length === 0,
        database,
      },
      errors: process.env.NODE_ENV === "production"
        ? configurationErrors.map((error) => error.split(" ")[0]).concat(databaseError ? ["database"] : [])
        : [...configurationErrors, ...(databaseError ? [databaseError] : [])],
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
