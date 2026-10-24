import { describe, expect, test } from "bun:test";
import { GET } from "./route";

describe("app version route", () => {
  test("returns public build metadata without secrets", async () => {
    const response = await GET();
    const payload = await response.json() as { deployment?: string; version?: string; displayVersion?: string; token?: string };

    expect(response.status).toBe(200);
    expect(payload.deployment).toBe("app");
    expect(payload.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(payload.displayVersion).toContain("BloomMD");
    expect(payload.token).toBeUndefined();
  });
});
