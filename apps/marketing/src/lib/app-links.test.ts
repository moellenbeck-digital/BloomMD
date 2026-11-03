import { describe, expect, test } from "bun:test";
import { androidAssetLinks, appOpenUrl, appleAppSiteAssociation, parseOpenRequest, wellKnownResponse } from "./app-links";

const FINGERPRINT = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";

describe("apple-app-site-association", () => {
  test("is absent without a team id and never carries a placeholder", () => {
    expect(appleAppSiteAssociation({})).toBeNull();
    expect(appleAppSiteAssociation({ APPLE_TEAM_ID: "" })).toBeNull();
    expect(appleAppSiteAssociation({ APPLE_TEAM_ID: "TEAMID" })).toBeNull();
    expect(appleAppSiteAssociation({ APPLE_TEAM_ID: "ABCDE12345\"x" })).toBeNull();
  });

  test("binds /open and /open/* to the app of the team", () => {
    expect(appleAppSiteAssociation({ APPLE_TEAM_ID: " abcde12345 " })).toEqual({
      applinks: { details: [{ appIDs: ["ABCDE12345.app.bloommd.mobile"], components: [{ "/": "/open" }, { "/": "/open/*" }] }] },
    });
  });
});

describe("assetlinks.json", () => {
  test("is absent without a valid fingerprint", () => {
    expect(androidAssetLinks({})).toBeNull();
    expect(androidAssetLinks({ ANDROID_CERT_SHA256: "" })).toBeNull();
    expect(androidAssetLinks({ ANDROID_CERT_SHA256: "AB:CD" })).toBeNull();
    expect(androidAssetLinks({ ANDROID_CERT_SHA256: "TODO" })).toBeNull();
  });

  test("lists every valid fingerprint once, normalized", () => {
    const bare = FINGERPRINT.replace(/:/g, "").toLowerCase();
    const other = "00:".repeat(31) + "00";
    const links = androidAssetLinks({ ANDROID_CERT_SHA256: `${FINGERPRINT}, ${bare}\n${other},junk` });
    expect(links).toEqual([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "app.bloommd.mobile", sha256_cert_fingerprints: [FINGERPRINT, other] },
    }]);
  });
});

describe("wellKnownResponse", () => {
  test("answers 404 without a body when there is nothing to publish", async () => {
    const response = wellKnownResponse(null, "GET");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  test("serves application/json and no body for HEAD", async () => {
    const get = wellKnownResponse({ a: 1 }, "GET");
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toBe("application/json");
    expect(await get.json()).toEqual({ a: 1 });
    const head = wellKnownResponse({ a: 1 }, "HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });
});

describe("parseOpenRequest / appOpenUrl", () => {
  test("builds the scheme link from validated values only", () => {
    expect(appOpenUrl(parseOpenRequest({ path: "Schule/Physik Skript.md", node: "abc_1" }))).toBe("bloommd://open?path=Schule%2FPhysik%20Skript.md&node=abc_1");
    expect(appOpenUrl(parseOpenRequest({ doc: "Doc-1", node: "n" }))).toBe("bloommd://open?doc=Doc-1&node=n");
    expect(appOpenUrl(parseOpenRequest({ path: "/Abs/x.md" }))).toBe("bloommd://open?path=Abs%2Fx.md");
    expect(appOpenUrl(parseOpenRequest({ path: ["a.md", "b.md"] }))).toBe("bloommd://open?path=a.md");
  });

  test("drops invalid nodes and rejects invalid targets", () => {
    expect(appOpenUrl(parseOpenRequest({ path: "x.md", node: "<script>" }))).toBe("bloommd://open?path=x.md");
    for (const path of ["", "../x.md", "a/../x.md", "a//x.md", "x.txt", "<script>alert(1)</script>"]) expect(appOpenUrl(parseOpenRequest({ path }))).toBeNull();
    for (const doc of ["", "..", "a/b", "a b", "a".repeat(129), "<img onerror=x>"]) expect(appOpenUrl(parseOpenRequest({ doc }))).toBeNull();
    expect(appOpenUrl(parseOpenRequest({}))).toBeNull();
  });
});
