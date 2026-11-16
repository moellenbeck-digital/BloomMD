import { randomBytes } from "node:crypto";
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { s3ClientConfig } from "../lib/env";

/**
 * S3-compatible service for the media tests (MinIO in CI). Locally an unset `BLOOMMD_TEST_S3_ENDPOINT` means
 * "skip" (`describe.skipIf`); in CI an unset variable throws, so a missing service turns the run red instead of
 * silently skipping the tests (same rule as `testDatabaseUrl`). The credentials belong to the throwaway service only.
 */
export interface TestS3 {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

export function testS3Settings(env: Record<string, string | undefined> = process.env): TestS3 | undefined {
  const endpoint = env.BLOOMMD_TEST_S3_ENDPOINT?.trim();
  if (!endpoint && env.CI === "true") throw new Error("BLOOMMD_TEST_S3_ENDPOINT fehlt in der CI, die S3-Tests dürfen nicht übersprungen werden");
  if (!endpoint) return undefined;
  const accessKey = env.BLOOMMD_TEST_S3_ACCESS_KEY?.trim();
  const secretKey = env.BLOOMMD_TEST_S3_SECRET_KEY?.trim();
  if (!accessKey || !secretKey) throw new Error("BLOOMMD_TEST_S3_ACCESS_KEY und BLOOMMD_TEST_S3_SECRET_KEY gehören zu BLOOMMD_TEST_S3_ENDPOINT");
  return { endpoint, region: env.BLOOMMD_TEST_S3_REGION?.trim() || "us-east-1", accessKey, secretKey };
}

export interface TestBucket {
  name: string;
  client: S3Client;
  drop(): Promise<void>;
}

/** A bucket of its own per run (private: no policy, no ACL), removed with its objects afterwards. */
export async function createTestBucket(s3: TestS3): Promise<TestBucket> {
  const name = `cms-test-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const client = new S3Client(s3ClientConfig({ bucket: name, endpoint: s3.endpoint, region: s3.region, accessKey: s3.accessKey, secretKey: s3.secretKey }));
  await client.send(new CreateBucketCommand({ Bucket: name }));
  return {
    name,
    client,
    async drop() {
      try {
        const listed = await client.send(new ListObjectsV2Command({ Bucket: name }));
        const keys = (listed.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
        if (keys.length > 0) await client.send(new DeleteObjectsCommand({ Bucket: name, Delete: { Objects: keys } }));
        await client.send(new DeleteBucketCommand({ Bucket: name }));
      } finally {
        client.destroy();
      }
    },
  };
}
