export function nextServerCommand(port: number): string {
  if (process.env.PLAYWRIGHT_SERVER_MODE === "production") return `bunx next start -p ${port}`;
  return process.env.CI ? `bunx next dev -p ${port}` : `bun run dev -- -p ${port}`;
}
