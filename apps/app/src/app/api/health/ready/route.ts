import { NextResponse } from "next/server";
import { checkDatabaseReady } from "../../../../lib/db";
import { productionConfigErrors, productionConfigWarnings } from "../../../../lib/production-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const configurationErrors = productionConfigErrors();
  const configurationWarnings = productionConfigWarnings();
  let database = false;
  let databaseError: string | null = null;

  try {
    database = await checkDatabaseReady();
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "Database readiness failed.";
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
      // Not part of `ready`: a missing optional setting must not take the instance out of rotation.
      warnings: process.env.NODE_ENV === "production"
        ? configurationWarnings.map((warning) => warning.split(" ")[0])
        : configurationWarnings,
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
