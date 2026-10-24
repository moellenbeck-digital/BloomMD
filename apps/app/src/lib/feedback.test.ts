import { describe, expect, test } from "bun:test";
import { FeedbackValidationError, normalizeFeedbackForm, validateFeedbackAttachments } from "./feedback";

function feedbackForm(overrides: { message?: string; screenshots?: File[]; video?: File } = {}) {
  const form = new FormData();
  form.set("type", "bug");
  form.set("area", "web");
  form.set("message", overrides.message ?? "Beim Öffnen des lokalen Ordners bricht die Map ab.");
  for (const screenshot of overrides.screenshots ?? [new File(["png"], "screen.png", { type: "image/png" })]) {
    form.append("screenshots", screenshot);
  }
  if (overrides.video) form.append("video", overrides.video);
  return form;
}

describe("feedback validation", () => {
  test("normalizes structured feedback fields", () => {
    const form = feedbackForm();
    form.set("type", "UX");
    form.set("area", "Desktop");
    form.set("route", "/app?file=test.md");

    expect(normalizeFeedbackForm(form)).toEqual({
      type: "ux",
      area: "desktop",
      message: "Beim Öffnen des lokalen Ordners bricht die Map ab.",
      route: "/app?file=test.md",
      diagnostics: null,
      contactEmail: null,
    });
  });

  test("requires at least one screenshot for M1 triage", async () => {
    const form = feedbackForm({ screenshots: [] });

    await expect(validateFeedbackAttachments(form)).rejects.toBeInstanceOf(FeedbackValidationError);
  });

  test("allows desktop feedback without a screenshot", async () => {
    const form = feedbackForm({ screenshots: [] });

    await expect(validateFeedbackAttachments(form, { requireScreenshot: false })).resolves.toEqual([]);
  });

  test("accepts screenshots and an optional small video", async () => {
    const attachments = await validateFeedbackAttachments(feedbackForm({
      screenshots: [new File(["image"], "screen.webp", { type: "image/webp" })],
      video: new File(["video"], "clip.webm", { type: "video/webm" }),
    }));

    expect(attachments.map((attachment) => attachment.kind)).toEqual(["screenshot", "video"]);
    expect(attachments[0]?.sha256).toHaveLength(64);
  });
});
