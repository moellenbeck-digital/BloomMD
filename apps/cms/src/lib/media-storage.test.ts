import { describe, expect, test } from "bun:test";
import type { Config } from "payload";
import { buildMedia } from "../collections/Media";
import { mediaStoragePlugins } from "./media-storage";

const s3 = {
  CMS_S3_BUCKET: "cms-media",
  CMS_S3_ENDPOINT: "https://s3.example.test",
  CMS_S3_REGION: "eu-central",
  CMS_S3_ACCESS_KEY: "AKIA-test-access-1234",
  CMS_S3_SECRET_KEY: "s3-test-secret-value-5678",
};

/** Applies the plugins of one environment to a configuration with the media collection only. */
async function resolve(env: Record<string, string | undefined>) {
  let config = { collections: [buildMedia(env)] } as unknown as Config;
  for (const plugin of mediaStoragePlugins(env)) config = await plugin(config);
  return config.collections?.find((collection) => collection.slug === "media");
}

describe("media collection follows the CMS_S3_* variables (#407)", () => {
  const fieldNames = (media: { fields: unknown[] } | undefined) => (media?.fields ?? []).flatMap((field) => ((field as { name?: string }).name ? [(field as { name: string }).name] : []));

  test("none set: plugin inactive, the local directory stays", async () => {
    const media = await resolve({ CMS_MEDIA_DIR: "/tmp/cms-media-local" });
    expect(media?.upload).toMatchObject({ staticDir: "/tmp/cms-media-local" });
    expect((media?.upload as { disableLocalStorage?: boolean }).disableLocalStorage).toBeUndefined();
    expect(media?.hooks?.afterChange ?? []).toHaveLength(0);
  });

  test("the fields of the collection are the same with and without S3 (one schema, migrations only)", async () => {
    const local = fieldNames((await resolve({})) as never);
    expect(local).toEqual(expect.arrayContaining(["alt", "url", "prefix", "_objectKey"]));
    expect(fieldNames((await resolve(s3)) as never)).toEqual(local);
  });

  test("all set: S3 plugin active, local storage off, no staticDir needed, collection still private", async () => {
    expect((buildMedia(s3).upload as { staticDir?: string }).staticDir).toBeUndefined();
    const media = await resolve(s3);
    expect((media?.upload as { disableLocalStorage?: boolean }).disableLocalStorage).toBe(true);
    // The plugin does not touch access: the functions of the collection stay in place.
    expect(media?.access).toEqual(buildMedia(s3).access);
    expect(media?.hooks?.afterChange?.length).toBeGreaterThan(0);
    // No public delivery: files are served by Payload (access control), not by a public URL.
    expect(JSON.stringify(media?.upload)).not.toContain("disablePayloadAccessControl");
  });

  test("partial: plugin inactive (the start fails in runtimeConfigErrors), local directory", async () => {
    const { CMS_S3_SECRET_KEY: _omitted, ...partial } = s3;
    expect((await resolve(partial))?.hooks?.afterChange ?? []).toHaveLength(0);
    expect((buildMedia(partial).upload as { staticDir?: string }).staticDir).toBeTruthy();
  });
});
