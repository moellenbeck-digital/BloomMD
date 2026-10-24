export function nextDevCommand(port: number): string {
  // The E2E auth bypass is deliberately unavailable in production. Use webpack in
  // CI (Turbopack can serve a partially initialised route tree at startup), but lift
  // Node's default heap ceiling: a long suite compiles many app routes and otherwise
  // makes Next restart the development server mid-run.
  return process.env.CI
    ? `NODE_OPTIONS=--max-old-space-size=6144 bunx next dev --webpack -p ${port}`
    : `bun run dev -- -p ${port}`;
}

export function nextServerCommand(port: number): string {
  if (process.env.PLAYWRIGHT_SERVER_MODE === "production") return `bunx next start -p ${port}`;
  return nextDevCommand(port);
}

export const E2E_ROUTE_WARMUP_PATHS = [
  "/login",
  "/signup",
  "/app",
  "/api/mindmaps",
  "/api/mindmaps/__e2e-route-warmup__.md",
] as const;

export async function warmNextDevRoutes(baseUrl: string): Promise<void> {
  for (const path of E2E_ROUTE_WARMUP_PATHS) {
    const response = await fetch(new URL(path, baseUrl));
    await response.arrayBuffer();
  }
}
