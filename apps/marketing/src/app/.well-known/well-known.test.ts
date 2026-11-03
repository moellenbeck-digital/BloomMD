import { afterEach, describe, expect, test } from "bun:test";
import { GET as getAssetLinks } from "./assetlinks.json/route";
import { GET as getAasa, HEAD as headAasa } from "./apple-app-site-association/route";

const original = { team: process.env.APPLE_TEAM_ID, cert: process.env.ANDROID_CERT_SHA256 };

afterEach(() => {
  for (const [key, value] of [["APPLE_TEAM_ID", original.team], ["ANDROID_CERT_SHA256", original.cert]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("well-known routes", () => {
  test("answer 404 without configuration", () => {
    delete process.env.APPLE_TEAM_ID;
    delete process.env.ANDROID_CERT_SHA256;
    expect(getAasa().status).toBe(404);
    expect(headAasa().status).toBe(404);
    expect(getAssetLinks().status).toBe(404);
  });

  test("read the environment per request", async () => {
    process.env.APPLE_TEAM_ID = "ABCDE12345";
    process.env.ANDROID_CERT_SHA256 = "11".repeat(32);
    const aasa = getAasa();
    expect(aasa.status).toBe(200);
    expect(aasa.headers.get("content-type")).toBe("application/json");
    expect(JSON.stringify(await aasa.json())).toContain("ABCDE12345.app.bloommd.mobile");
    const links = getAssetLinks();
    expect(links.status).toBe(200);
    expect(JSON.stringify(await links.json())).toContain(Array(32).fill("11").join(":"));
  });
});
