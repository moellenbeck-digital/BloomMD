import { createHash, createHmac } from "node:crypto";
import { isFeedbackStorageConfigured, storeFeedbackAttachment } from "../src/lib/feedback-storage";

interface FeedbackStorageVerificationConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function configFromEnv(): FeedbackStorageVerificationConfig {
  return {
    endpoint: requireEnv("BLOOMMD_FEEDBACK_S3_ENDPOINT").replace(/\/+$/, ""),
    region: requireEnv("BLOOMMD_FEEDBACK_S3_REGION"),
    bucket: requireEnv("BLOOMMD_FEEDBACK_S3_BUCKET"),
    accessKeyId: requireEnv("BLOOMMD_FEEDBACK_S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY"),
  };
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

function authorizationHeader(input: {
  method: "DELETE";
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  now: Date;
  config: FeedbackStorageVerificationConfig;
}) {
  const day = dateStamp(input.now);
  const scope = `${day}/${input.config.region}/s3/aws4_request`;
  const signedHeaderRows = Object.entries(input.headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
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

async function deleteObject(config: FeedbackStorageVerificationConfig, objectKey: string) {
  const now = new Date();
  const url = new URL(`${config.endpoint}/${config.bucket}/${encodeKey(objectKey)}`);
  const payloadHash = sha256Hex(new Uint8Array());
  const headers = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate(now),
  };
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": headers["x-amz-date"],
      Authorization: authorizationHeader({ method: "DELETE", url, headers, payloadHash, now, config }),
    },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Feedback attachment delete failed with status ${response.status}.`);
  }
  return response.status;
}

async function main() {
  const config = configFromEnv();
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  const expectedSha256 = sha256Hex(pngBytes);
  const stored = await storeFeedbackAttachment({
    feedbackId: `monitoring-delete-${Date.now()}`,
    attachment: {
      id: crypto.randomUUID(),
      kind: "screenshot",
      filename: "m1-monitoring-delete-probe.png",
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
      sha256: expectedSha256,
      bytes: pngBytes,
    },
  });
  if (!stored.signedUrl) throw new Error("Feedback attachment signed URL is missing.");

  const beforeDelete = await fetch(stored.signedUrl);
  const downloaded = new Uint8Array(await beforeDelete.arrayBuffer());
  const downloadedSha256 = sha256Hex(downloaded);
  if (!beforeDelete.ok) throw new Error(`Feedback attachment signed GET failed with status ${beforeDelete.status}.`);
  if (downloadedSha256 !== expectedSha256) throw new Error("Feedback attachment signed GET hash mismatch.");

  const deleteStatus = await deleteObject(config, stored.objectKey);
  const afterDelete = await fetch(stored.signedUrl);
  if (afterDelete.ok) throw new Error(`Feedback attachment signed GET succeeded after delete with status ${afterDelete.status}.`);

  console.log(JSON.stringify({
    storageConfigured: isFeedbackStorageConfigured(),
    enabled: process.env.BLOOMMD_FEEDBACK_ENABLED === "1",
    retentionDays: process.env.BLOOMMD_FEEDBACK_ATTACHMENT_RETENTION_DAYS || null,
    uploaded: true,
    signedGetBeforeDelete: beforeDelete.status,
    sha256Matches: true,
    deleted: true,
    deleteStatus,
    signedGetAfterDelete: afterDelete.status,
    objectKeyPrefix: `${stored.objectKey.split("/").slice(0, 3).join("/")}/...`,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
