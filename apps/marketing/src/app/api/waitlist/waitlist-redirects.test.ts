import { afterEach, describe, expect, test } from "bun:test";
import { GET as confirmWaitlist } from "./confirm/route";
import { GET as unsubscribeWaitlist } from "./unsubscribe/route";

const originalMarketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalNodeEnv = process.env.NODE_ENV;

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

function deleteEnvValue(key: string) {
  delete (process.env as Record<string, string | undefined>)[key];
}

afterEach(() => {
  if (originalMarketingUrl == null) deleteEnvValue("NEXT_PUBLIC_MARKETING_URL");
  else setEnvValue("NEXT_PUBLIC_MARKETING_URL", originalMarketingUrl);
  if (originalSiteUrl == null) deleteEnvValue("NEXT_PUBLIC_SITE_URL");
  else setEnvValue("NEXT_PUBLIC_SITE_URL", originalSiteUrl);
  if (originalNodeEnv == null) deleteEnvValue("NODE_ENV");
  else setEnvValue("NODE_ENV", originalNodeEnv);
});

describe("waitlist mail redirects", () => {
  test("confirmation redirects to the configured marketing origin, not the request origin", async () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://bloommd.io";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const response = await confirmWaitlist(new Request("http://localhost:3000/api/waitlist/confirm?token=invalid"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bloommd.io/waitlist/ungueltig");
  });

  test("unsubscribe redirects to the configured marketing origin, not the request origin", async () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://bloommd.io";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const response = await unsubscribeWaitlist(new Request("http://localhost:3000/api/waitlist/unsubscribe?token=invalid"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bloommd.io/waitlist/ungueltig");
  });

  test("confirmation does not redirect to localhost from production when runtime env is stale", async () => {
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_MARKETING_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const response = await confirmWaitlist(new Request("http://localhost:3000/api/waitlist/confirm?token=invalid"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bloommd.io/waitlist/ungueltig");
  });

  test("unsubscribe does not redirect to localhost from production when runtime env is stale", async () => {
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_MARKETING_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const response = await unsubscribeWaitlist(new Request("http://localhost:3000/api/waitlist/unsubscribe?token=invalid"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bloommd.io/waitlist/ungueltig");
  });
});
