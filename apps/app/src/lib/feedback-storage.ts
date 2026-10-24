import { createHmac, createHash } from "node:crypto";
import type { ValidatedFeedbackAttachment } from "./feedback";

interface FeedbackStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface StoredFeedbackAttachment {
  id: string;
  kind: ValidatedFeedbackAttachment["kind"];
  filename: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  signedUrl: string | null;
}

type Fetcher = typeof fetch;

function feedbackStorageConfig(env: NodeJS.ProcessEnv = process.env): FeedbackStorageConfig | null {
  const endpoint = env.BLOOMMD_FEEDBACK_S3_ENDPOINT?.replace(/\/+$/, "");
  const region = env.BLOOMMD_FEEDBACK_S3_REGION;
  const bucket = env.BLOOMMD_FEEDBACK_S3_BUCKET;
  const accessKeyId = env.BLOOMMD_FEEDBACK_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

export function isFeedbackStorageConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(feedbackStorageConfig(env));
}

function hmac(key: string | Uint8Array, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function amzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(date: Date) {
  return amzDate(date).slice(0, 8);
}

function signingKey(secret: string, date: string, region: string) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function encodeKey(key: string) {
  return key.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function canonicalHeaders(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
}

function authorizationHeader(input: {
  method: "PUT";
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  now: Date;
  config: FeedbackStorageConfig;
}) {
  const day = dateStamp(input.now);
  const scope = `${day}/${input.config.region}/s3/aws4_request`;
  const signedHeaderRows = canonicalHeaders(input.headers);
  const signedHeaders = signedHeaderRows.map(([key]) => key).join(";");
  const headerText = signedHeaderRows.map(([key, value]) => `${key}:${value}\n`).join("");
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    "",
    headerText,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate(input.now),
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(input.config.secretAccessKey, day, input.config.region)).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function presignedGetUrl(input: {
  objectKey: string;
  config: FeedbackStorageConfig;
  now: Date;
  expiresSeconds: number;
}) {
  const day = dateStamp(input.now);
  const scope = `${day}/${input.config.region}/s3/aws4_request`;
  const url = new URL(`${input.config.endpoint}/${input.config.bucket}/${encodeKey(input.objectKey)}`);
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${input.config.accessKeyId}/${scope}`);
  url.searchParams.set("X-Amz-Date", amzDate(input.now));
  url.searchParams.set("X-Amz-Expires", String(input.expiresSeconds));
  url.searchParams.set("X-Amz-SignedHeaders", "host");
  const canonicalRequest = [
    "GET",
    url.pathname,
    [...url.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&"),
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate(input.now),
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(input.config.secretAccessKey, day, input.config.region)).update(stringToSign).digest("hex");
  url.searchParams.set("X-Amz-Signature", signature);
  return url.toString();
}

export async function storeFeedbackAttachment(input: {
  feedbackId: string;
  attachment: ValidatedFeedbackAttachment;
  fetcher?: Fetcher;
  now?: Date;
}): Promise<StoredFeedbackAttachment> {
  const config = feedbackStorageConfig();
  if (!config) throw new Error("Feedback attachment storage is not configured.");
  const now = input.now ?? new Date();
  const objectKey = `feedback/${input.feedbackId}/${input.attachment.kind}/${input.attachment.id}-${input.attachment.filename}`;
  const url = new URL(`${config.endpoint}/${config.bucket}/${encodeKey(objectKey)}`);
  const payloadHash = sha256Hex(input.attachment.bytes);
  const headers = {
    "content-type": input.attachment.mimeType,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate(now),
  };
  const body = new ArrayBuffer(input.attachment.bytes.byteLength);
  new Uint8Array(body).set(input.attachment.bytes);
  const response = await (input.fetcher ?? fetch)(url, {
    method: "PUT",
    headers: {
      "Content-Type": input.attachment.mimeType,
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": headers["x-amz-date"],
      Authorization: authorizationHeader({ method: "PUT", url, headers, payloadHash, now, config }),
    },
    body,
  });
  if (!response.ok) throw new Error(`Feedback attachment upload failed with status ${response.status}.`);
  return {
    id: input.attachment.id,
    kind: input.attachment.kind,
    filename: input.attachment.filename,
    objectKey,
    mimeType: input.attachment.mimeType,
    sizeBytes: input.attachment.sizeBytes,
    sha256: input.attachment.sha256,
    signedUrl: presignedGetUrl({ objectKey, config, now, expiresSeconds: 7 * 24 * 60 * 60 }),
  };
}
