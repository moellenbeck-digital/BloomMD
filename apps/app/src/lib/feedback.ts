import { createHash, randomUUID } from "node:crypto";

export const feedbackTypes = ["bug", "idea", "question", "ux"] as const;
export const feedbackAreas = ["web", "desktop", "sync", "docs", "other"] as const;

export type FeedbackType = (typeof feedbackTypes)[number];
export type FeedbackArea = (typeof feedbackAreas)[number];
export type FeedbackAttachmentKind = "screenshot" | "video";

export interface FeedbackPayload {
  type: FeedbackType;
  area: FeedbackArea;
  message: string;
  route: string | null;
  diagnostics: string | null;
  contactEmail: string | null;
}

export interface ValidatedFeedbackAttachment {
  id: string;
  kind: FeedbackAttachmentKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Uint8Array;
  sha256: string;
}

export class FeedbackValidationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

const screenshotMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const videoMimeTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const maxScreenshotBytes = 10 * 1024 * 1024;
const maxVideoBytes = 50 * 1024 * 1024;

function normalizeEnumValue<T extends string>(value: FormDataEntryValue | null, allowed: readonly T[], fallback: T): T {
  const raw = String(value || "").trim().toLowerCase();
  return allowed.includes(raw as T) ? raw as T : fallback;
}

function normalizeRoute(value: FormDataEntryValue | null) {
  const route = String(value || "").trim();
  if (!route) return null;
  if (route.length > 300) return route.slice(0, 300);
  return route;
}

function normalizeOptionalText(value: FormDataEntryValue | null, maxLength: number) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeContactEmail(value: FormDataEntryValue | null) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new FeedbackValidationError("Bitte gib eine gültige Kontakt-E-Mail-Adresse an oder lass das Feld leer.");
  }
  return email.slice(0, 254);
}

export function normalizeFeedbackForm(form: FormData): FeedbackPayload {
  const message = String(form.get("message") || "").trim();
  if (message.length < 10) throw new FeedbackValidationError("Bitte beschreibe dein Feedback mit mindestens 10 Zeichen.");
  if (message.length > 5_000) throw new FeedbackValidationError("Feedback darf maximal 5.000 Zeichen enthalten.");

  return {
    type: normalizeEnumValue(form.get("type"), feedbackTypes, "bug"),
    area: normalizeEnumValue(form.get("area"), feedbackAreas, "web"),
    message,
    route: normalizeRoute(form.get("route")),
    diagnostics: normalizeOptionalText(form.get("diagnostics"), 4_000),
    contactEmail: normalizeContactEmail(form.get("contactEmail")),
  };
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function sanitizeFilename(value: string) {
  const safe = value.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return safe || "attachment";
}

async function validateFile(file: File, kind: FeedbackAttachmentKind): Promise<ValidatedFeedbackAttachment> {
  const allowed = kind === "screenshot" ? screenshotMimeTypes : videoMimeTypes;
  const maxBytes = kind === "screenshot" ? maxScreenshotBytes : maxVideoBytes;
  if (!allowed.has(file.type)) {
    throw new FeedbackValidationError(kind === "screenshot" ? "Screenshot muss PNG, JPEG oder WebP sein." : "Video muss MP4, WebM oder QuickTime sein.");
  }
  if (file.size > maxBytes) {
    throw new FeedbackValidationError(kind === "screenshot" ? "Screenshot darf maximal 10 MB groß sein." : "Video darf maximal 50 MB groß sein.", 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    id: randomUUID(),
    kind,
    filename: sanitizeFilename(file.name),
    mimeType: file.type,
    sizeBytes: file.size,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function validateFeedbackAttachments(
  form: FormData,
  options: { requireScreenshot?: boolean } = {},
): Promise<ValidatedFeedbackAttachment[]> {
  const requireScreenshot = options.requireScreenshot ?? true;
  const screenshots = form.getAll("screenshots").filter(isFileLike);
  if (requireScreenshot && screenshots.length < 1) throw new FeedbackValidationError("Bitte füge mindestens einen Screenshot hinzu.");
  if (screenshots.length > 3) throw new FeedbackValidationError("Bitte füge maximal drei Screenshots hinzu.");

  const videos = form.getAll("video").filter(isFileLike);
  if (videos.length > 1) throw new FeedbackValidationError("Bitte füge maximal ein Video hinzu.");

  const attachments = [
    ...(await Promise.all(screenshots.map((file) => validateFile(file, "screenshot")))),
    ...(await Promise.all(videos.map((file) => validateFile(file, "video")))),
  ];
  const totalBytes = attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
  if (totalBytes > 65 * 1024 * 1024) throw new FeedbackValidationError("Anhänge dürfen zusammen maximal 65 MB groß sein.", 413);
  return attachments;
}
