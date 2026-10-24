import { describe, expect, test } from "bun:test";
import { mobileCorsHeaders } from "./mobile-cors";

describe("mobile app CORS", () => {
  test("allows the app origins on bearer-token routes, without credentials", () => {
    const headers = mobileCorsHeaders("capacitor://localhost", "/api/mobile/token", "production");
    expect(headers?.["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(headers).not.toHaveProperty("Access-Control-Allow-Credentials");
    expect(mobileCorsHeaders("https://localhost", "/api/mindmaps/plan.md", "production")).not.toBeNull();
    expect(mobileCorsHeaders("capacitor://localhost", "/api/sync-ticket", "production")).not.toBeNull();
  });

  test("keeps session routes and other origins closed", () => {
    expect(mobileCorsHeaders("capacitor://localhost", "/api/mobile/authorize", "production")).toBeNull();
    expect(mobileCorsHeaders("capacitor://localhost", "/api/account/access-tokens", "production")).toBeNull();
    expect(mobileCorsHeaders("https://evil.example", "/api/mobile/token", "production")).toBeNull();
    expect(mobileCorsHeaders(null, "/api/mobile/token", "production")).toBeNull();
    expect(mobileCorsHeaders("http://localhost:5174", "/api/mobile/token", "production")).toBeNull();
    expect(mobileCorsHeaders("http://localhost:5174", "/api/mobile/token", "development")).not.toBeNull();
  });
});
