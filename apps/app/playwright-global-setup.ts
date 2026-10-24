import { warmNextDevRoutes } from "./playwright-server";

export default async function globalSetup(): Promise<void> {
  const port = Number(process.env.PLAYWRIGHT_PORT ?? 3211);
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
  await warmNextDevRoutes(baseUrl);
}
