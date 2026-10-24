import { afterEach, describe, expect, test } from "bun:test";
import { resetMemoryRateLimitsForTests } from "../../../lib/request-security";
import { handleFeedbackPost, type FeedbackRouteDeps } from "./feedback-handler";

const userId = "11111111-1111-4111-8111-111111111111";
const feedbackId = "22222222-2222-4222-8222-222222222222";

function feedbackRequest(overrides: {
  origin?: string | null;
  message?: string;
  screenshot?: File | null;
  desktop?: boolean;
  contactEmail?: string;
} = {}) {
  const form = new FormData();
  form.set("type", "bug");
  form.set("area", overrides.desktop ? "desktop" : "web");
  form.set("message", overrides.message ?? "Die Map verschwindet nach dem Ordnerwechsel.");
  if (overrides.desktop) {
    form.set("desktopFeedback", "1");
    form.set("desktopInstallationId", "desktop-test-installation");
    form.set("diagnostics", "OS: darwin 23 arm64");
  }
  if (overrides.contactEmail) form.set("contactEmail", overrides.contactEmail);
  form.set("formStartedAt", String(Date.now() - 1_000));
  form.set("website", "");
  if (overrides.screenshot !== null) {
    form.append("screenshots", overrides.screenshot ?? new File(["screen"], "screen.png", { type: "image/png" }));
  }
  return new Request("https://bloommd.app/api/feedback", {
    method: "POST",
    headers: {
      ...(overrides.origin === null ? {} : { Origin: overrides.origin ?? "https://bloommd.app" }),
      "X-Forwarded-For": "203.0.113.15",
      "User-Agent": "BunTest",
    },
    body: form,
  });
}

function deps(overrides: Partial<FeedbackRouteDeps> = {}): FeedbackRouteDeps {
  return {
    getIdentity: async () => ({ authKind: "session", userId, email: "tester@example.test" }),
    createFeedbackRecord: async (input) => ({
      id: feedbackId,
      userId,
      userEmail: input.userEmail,
      type: input.type,
      area: input.area,
      message: input.message,
      route: input.route ?? null,
      userAgent: input.userAgent ?? null,
      appVersion: input.appVersion ?? null,
      status: "received",
      githubIssueNumber: null,
      githubIssueUrl: null,
      githubProjectItemId: null,
      createdAt: "2026-08-15T10:00:00.000Z",
    }),
    addFeedbackAttachments: async () => [],
    markFeedbackReported: async () => undefined,
    markFeedbackFailed: async () => undefined,
    storeFeedbackAttachment: async ({ attachment }) => ({
      id: attachment.id,
      kind: attachment.kind,
      filename: attachment.filename,
      objectKey: `feedback/${feedbackId}/${attachment.filename}`,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sha256: attachment.sha256,
      signedUrl: "https://storage.example.test/signed",
    }),
    createFeedbackGitHubIssue: async (input) => ({
      number: 1270,
      url: `https://github.com/moellenbeck-digital/BloomMD/issues/${input.feedbackId}`,
      projectItemId: "PVTI_test",
    }),
    storageConfigured: () => true,
    githubConfigured: () => true,
    ...overrides,
  };
}

afterEach(() => {
  resetMemoryRateLimitsForTests();
});

describe("feedback route", () => {
  test("requires an authenticated database-backed user", async () => {
    const response = await handleFeedbackPost(feedbackRequest(), deps({ getIdentity: async () => null }));

    expect(response.status).toBe(401);
  });

  test("rejects cross-origin session feedback", async () => {
    const response = await handleFeedbackPost(feedbackRequest({ origin: "https://evil.example.test" }), deps());

    expect(response.status).toBe(403);
  });

  test("creates feedback, stores screenshot metadata, and creates a GitHub issue", async () => {
    let storedAttachments = 0;
    let reportedIssue = 0;
    const response = await handleFeedbackPost(feedbackRequest(), deps({
      addFeedbackAttachments: async (_id, attachments) => {
        storedAttachments = attachments.length;
        return [];
      },
      markFeedbackReported: async (input) => {
        reportedIssue = input.githubIssueNumber;
      },
    }));

    expect(response.status).toBe(201);
    const body = await response.json() as { feedbackId: string; issueNumber: number };
    expect(body.feedbackId).toBe(feedbackId);
    expect(body.issueNumber).toBe(1270);
    expect(storedAttachments).toBe(1);
    expect(reportedIssue).toBe(1270);
  });

  test("accepts web feedback without a screenshot attachment", async () => {
    let storedAttachments = -1;
    const response = await handleFeedbackPost(feedbackRequest({ screenshot: null }), deps({
      addFeedbackAttachments: async (_id, attachments) => {
        storedAttachments = attachments.length;
        return [];
      },
    }));

    expect(response.status).toBe(201);
    expect(storedAttachments).toBe(0);
  });

  test("accepts desktop access-token feedback without an origin header or screenshot", async () => {
    let storedAttachments = -1;
    const response = await handleFeedbackPost(feedbackRequest({ desktop: true, origin: null, screenshot: null }), deps({
      getIdentity: async () => ({ authKind: "access-token", userId, email: "desktop@example.test" }),
      addFeedbackAttachments: async (_id, attachments) => {
        storedAttachments = attachments.length;
        return [];
      },
    }));

    expect(response.status).toBe(201);
    expect(storedAttachments).toBe(0);
  });

  test("accepts anonymous desktop feedback with optional contact email", async () => {
    let createdUserId: string | null | undefined = undefined;
    let createdEmail = "";
    const response = await handleFeedbackPost(
      feedbackRequest({ desktop: true, screenshot: null, contactEmail: "Tester@Example.test" }),
      deps({
        getIdentity: async () => null,
        createFeedbackRecord: async (input) => {
          createdUserId = input.userId;
          createdEmail = input.userEmail;
          return {
            id: feedbackId,
            userId: input.userId ?? null,
            userEmail: input.userEmail,
            type: input.type,
            area: input.area,
            message: input.message,
            route: input.route ?? null,
            userAgent: input.userAgent ?? null,
            appVersion: input.appVersion ?? null,
            status: "received",
            githubIssueNumber: null,
            githubIssueUrl: null,
            githubProjectItemId: null,
            createdAt: "2026-08-15T10:00:00.000Z",
          };
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createdUserId).toBeNull();
    expect(createdEmail).toBe("tester@example.test");
  });
});
