import { afterEach, describe, expect, test } from "bun:test";
import { createFeedbackGitHubIssue } from "./feedback-github";

const originalEnv = {
  BLOOMMD_FEEDBACK_GITHUB_TOKEN: process.env.BLOOMMD_FEEDBACK_GITHUB_TOKEN,
  BLOOMMD_FEEDBACK_GITHUB_REPO: process.env.BLOOMMD_FEEDBACK_GITHUB_REPO,
  BLOOMMD_FEEDBACK_GITHUB_PROJECT_ID: process.env.BLOOMMD_FEEDBACK_GITHUB_PROJECT_ID,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

describe("feedback GitHub integration", () => {
  test("creates a labeled GitHub issue without exposing browser-side tokens", async () => {
    process.env.BLOOMMD_FEEDBACK_GITHUB_TOKEN = "github_pat_realistic_test_token_1234567890";
    process.env.BLOOMMD_FEEDBACK_GITHUB_REPO = "moellenbeck-digital/BloomMD";
    delete process.env.BLOOMMD_FEEDBACK_GITHUB_PROJECT_ID;

    const requestBodies: Array<{ title?: string; body?: string; labels?: string[] }> = [];
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as { title?: string; body?: string; labels?: string[] });
      return new Response(JSON.stringify({ number: 1270, html_url: "https://github.com/moellenbeck-digital/BloomMD/issues/1270", node_id: "I_1270" }), { status: 201 });
    }) as typeof fetch;

    const issue = await createFeedbackGitHubIssue({
      feedbackId: "11111111-1111-4111-8111-111111111111",
      type: "bug",
      area: "web",
      message: "Die Canvas verschwindet nach dem Ordnerwechsel.",
      userEmail: "tester@example.test",
      userId: "22222222-2222-4222-8222-222222222222",
      route: "/app",
      diagnostics: "OS: darwin 23 arm64",
      contactEmail: null,
      userAgent: "BunTest",
      appVersion: "sha-test",
      buildInfo: {
        product: "BloomMD",
        packageName: "@bloommd/web-app",
        deployment: "app",
        version: "0.1.0-beta.2",
        gitSha: "de8aff39cb9c93c36d62036899735eaf4c72dfa8",
        shortSha: "de8aff3",
        gitTag: "v0.1.0-beta.2",
        buildTime: "2026-08-16T09:00:00.000Z",
        displayVersion: "BloomMD 0.1.0-beta.2 (de8aff3)",
      },
      submittedAt: "2026-08-16T09:05:00.000Z",
      attachments: [{
        id: "33333333-3333-4333-8333-333333333333",
        kind: "screenshot",
        filename: "screen.png",
        objectKey: "feedback/111/screenshot/screen.png",
        mimeType: "image/png",
        sizeBytes: 123,
        sha256: "a".repeat(64),
        signedUrl: "https://storage.example.test/signed",
      }],
    }, fetcher);

    const requestBody = requestBodies[0];
    expect(issue.number).toBe(1270);
    expect(requestBody?.labels).toEqual(["user-feedback", "beta-feedback"]);
    expect(requestBody?.body).toContain("Feedback ID");
    expect(requestBody?.body).toContain("Git-SHA");
    expect(requestBody?.body).toContain("## Diagnose");
    expect(requestBody?.body).toContain("OS: darwin 23 arm64");
    expect(requestBody?.body).toContain("de8aff39cb9c93c36d62036899735eaf4c72dfa8");
    expect(requestBody?.body).toContain("https://storage.example.test/signed");
  });
});
