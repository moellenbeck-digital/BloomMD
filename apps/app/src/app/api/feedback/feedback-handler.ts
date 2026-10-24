import { NextResponse } from "next/server";
import { getApiRequestIdentity, type ApiRequestIdentity } from "../../../lib/auth";
import { addFeedbackAttachments, createFeedbackRecord, markFeedbackFailed, markFeedbackReported, normalizeUuid, type FeedbackRecord } from "../../../lib/db";
import { createFeedbackGitHubIssue, isFeedbackGitHubConfigured } from "../../../lib/feedback-github";
import { normalizeFeedbackForm, validateFeedbackAttachments, FeedbackValidationError } from "../../../lib/feedback";
import { isFeedbackStorageConfigured, storeFeedbackAttachment, type StoredFeedbackAttachment } from "../../../lib/feedback-storage";
import { assertHumanFormSignal, assertRateLimit, assertRequestSize, assertSameOriginForIdentity, FormSpamError, RateLimitError, RequestSecurityError } from "../../../lib/request-security";
import { getBuildInfo } from "../../../lib/build-info";

export interface FeedbackRouteDeps {
  getIdentity: (request: Request) => Promise<ApiRequestIdentity | null>;
  createFeedbackRecord: typeof createFeedbackRecord;
  addFeedbackAttachments: typeof addFeedbackAttachments;
  markFeedbackReported: typeof markFeedbackReported;
  markFeedbackFailed: typeof markFeedbackFailed;
  storeFeedbackAttachment: typeof storeFeedbackAttachment;
  createFeedbackGitHubIssue: typeof createFeedbackGitHubIssue;
  storageConfigured: () => boolean;
  githubConfigured: () => boolean;
}

const defaultDeps: FeedbackRouteDeps = { getIdentity: getApiRequestIdentity, createFeedbackRecord, addFeedbackAttachments, markFeedbackReported, markFeedbackFailed, storeFeedbackAttachment, createFeedbackGitHubIssue, storageConfigured: isFeedbackStorageConfigured, githubConfigured: isFeedbackGitHubConfigured };

function retentionExpiresAt() {
  const days = Number(process.env.BLOOMMD_FEEDBACK_ATTACHMENT_RETENTION_DAYS ?? 90);
  if (!Number.isFinite(days) || days < 1) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function humanSignalFromForm(form: FormData) {
  return new URLSearchParams({ website: String(form.get("website") || ""), formStartedAt: String(form.get("formStartedAt") || "") });
}

function feedbackSubmitter(input: { identity: ApiRequestIdentity | null; form: FormData }) {
  const userId = normalizeUuid(input.identity?.userId);
  const identityEmail = input.identity?.email?.trim().toLowerCase() ?? null;
  if (userId && identityEmail) return { userId, userEmail: identityEmail, authenticated: true, rateLimitIdentifier: identityEmail };
  if (String(input.form.get("desktopFeedback") || "") === "1") {
    const value = String(input.form.get("desktopInstallationId") || "").trim();
    return { userId: null, userEmail: "anonymous-desktop@bloommd.local", authenticated: false, rateLimitIdentifier: /^[a-zA-Z0-9_.:-]{8,120}$/.test(value) ? value : null };
  }
  return null;
}

async function uploadAttachments(input: { feedback: FeedbackRecord; attachments: Awaited<ReturnType<typeof validateFeedbackAttachments>>; deps: FeedbackRouteDeps }) {
  const stored: StoredFeedbackAttachment[] = [];
  for (const attachment of input.attachments) stored.push(await input.deps.storeFeedbackAttachment({ feedbackId: input.feedback.id, attachment }));
  await input.deps.addFeedbackAttachments(input.feedback.id, stored.map((attachment) => ({ id: attachment.id, kind: attachment.kind, filename: attachment.filename, objectKey: attachment.objectKey, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, sha256: attachment.sha256, retentionExpiresAt: retentionExpiresAt() })));
  return stored;
}

export async function handleFeedbackPost(request: Request, deps: FeedbackRouteDeps = defaultDeps) {
  if (process.env.BLOOMMD_FEEDBACK_ENABLED === "0") return NextResponse.json({ error: "Feedback is disabled." }, { status: 404 });
  let feedbackId: string | null = null;
  try {
    assertRequestSize(request, 66 * 1024 * 1024);
    if (!deps.storageConfigured()) return NextResponse.json({ error: "Feedback attachment storage is not configured." }, { status: 503 });
    if (!deps.githubConfigured()) return NextResponse.json({ error: "Feedback GitHub integration is not configured." }, { status: 503 });
    const form = await request.formData();
    assertHumanFormSignal(humanSignalFromForm(form));
    const payload = normalizeFeedbackForm(form);
    const identity = await deps.getIdentity(request);
    if (identity) assertSameOriginForIdentity(request, identity);
    const submitter = feedbackSubmitter({ identity, form });
    if (!submitter) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await assertRateLimit(request, { action: submitter.authenticated ? "feedback-submit" : "feedback-submit-anonymous-desktop", identifier: submitter.rateLimitIdentifier, limit: submitter.authenticated ? 6 : 2, windowMs: 60 * 60 * 1000 });
    const attachments = await validateFeedbackAttachments(form, { requireScreenshot: false });
    const buildInfo = getBuildInfo("app");
    const submittedAt = new Date().toISOString();
    const feedback = await deps.createFeedbackRecord({ userId: submitter.userId, userEmail: payload.contactEmail ?? submitter.userEmail, type: payload.type, area: payload.area, message: payload.message, route: payload.route, userAgent: request.headers.get("user-agent"), appVersion: buildInfo.displayVersion.slice(0, 120) });
    feedbackId = feedback.id;
    const storedAttachments = await uploadAttachments({ feedback, attachments, deps });
    const issue = await deps.createFeedbackGitHubIssue({ feedbackId: feedback.id, userId: submitter.userId, userEmail: feedback.userEmail, type: payload.type, area: payload.area, message: payload.message, route: payload.route, diagnostics: payload.diagnostics, contactEmail: payload.contactEmail, userAgent: request.headers.get("user-agent"), appVersion: feedback.appVersion, buildInfo, submittedAt, attachments: storedAttachments });
    await deps.markFeedbackReported({ feedbackId: feedback.id, githubIssueNumber: issue.number, githubIssueUrl: issue.url, githubProjectItemId: issue.projectItemId });
    return NextResponse.json({ feedbackId: feedback.id, issueNumber: issue.number, issueUrl: issue.url }, { status: 201 });
  } catch (error) {
    if (feedbackId) await deps.markFeedbackFailed(feedbackId).catch(() => undefined);
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    if (error instanceof FeedbackValidationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof FormSpamError) return NextResponse.json({ error: "Feedback rejected." }, { status: 400 });
    console.error("[BloomMD] Feedback submission failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Feedback could not be submitted." }, { status: 500 });
  }
}
