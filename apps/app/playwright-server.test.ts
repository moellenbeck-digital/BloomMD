import { afterEach, describe, expect, test } from "bun:test";
import { E2E_ROUTE_WARMUP_PATHS, nextServerCommand, warmNextDevRoutes } from "./playwright-server";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Playwright Next server", () => {
  test("starts the compiled app when CI explicitly selects production mode", () => {
    const previousMode = process.env.PLAYWRIGHT_SERVER_MODE;
    process.env.PLAYWRIGHT_SERVER_MODE = "production";

    try {
      expect(nextServerCommand(3211)).toBe("bunx next start -p 3211");
    } finally {
      if (previousMode === undefined) delete process.env.PLAYWRIGHT_SERVER_MODE;
      else process.env.PLAYWRIGHT_SERVER_MODE = previousMode;
    }
  });

  test("warms app and dynamic API routes sequentially before browser tests", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      requests.push(String(input));
      return new Response("ready");
    }) as typeof fetch;

    await warmNextDevRoutes("http://localhost:3211");

    expect(requests).toEqual(E2E_ROUTE_WARMUP_PATHS.map((path) => `http://localhost:3211${path}`));
  });
});
