import { describe, expect, test } from "bun:test";
import { getPlausibleConfig, isPlausibleConfigured, isPlausibleHostAllowed } from "./plausible";

describe("Plausible configuration", () => {
  test("requires all public values", () => {
    expect(isPlausibleConfigured({})).toBe(false);
    expect(isPlausibleConfigured({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "/_plausible/js/script.js",
    })).toBe(false);
  });

  test("returns the configured first-party endpoints", () => {
    expect(getPlausibleConfig({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "/_plausible/js/script.js",
      NEXT_PUBLIC_PLAUSIBLE_API_HOST: "/_plausible",
    })).toEqual({
      domain: "bloommd.io",
      src: "/_plausible/js/script.js",
      apiHost: "/_plausible",
    });
  });

  test("rejects foreign hosts, the former host and other paths", () => {
    const valid = {
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "/_plausible/js/script.js",
      NEXT_PUBLIC_PLAUSIBLE_API_HOST: "/_plausible",
    };
    expect(getPlausibleConfig(valid)).not.toBeNull();
    for (const src of [
      "https://plausible.example/js/script.js",
      "https://plausible.moellenbeck-digital.io/js/script.js",
      "https://plausible.ops.moellenbeck-digital.io/js/script.js",
      "//plausible.example/_plausible/js/script.js",
      "/_plausible/admin/js/script.js",
      "/js/script.js",
    ]) expect(getPlausibleConfig({ ...valid, NEXT_PUBLIC_PLAUSIBLE_SRC: src })).toBeNull();
    for (const apiHost of [
      "https://plausible.example",
      "https://plausible.moellenbeck-digital.io",
      "https://plausible.ops.moellenbeck-digital.io",
      "//plausible.example",
      "/_plausible/api",
      "/other",
    ]) expect(getPlausibleConfig({ ...valid, NEXT_PUBLIC_PLAUSIBLE_API_HOST: apiHost })).toBeNull();
  });
});

describe("Plausible host gate", () => {
  test("loads only on the configured domain and its www host", () => {
    expect(isPlausibleHostAllowed("bloommd.io", "bloommd.io")).toBe(true);
    expect(isPlausibleHostAllowed("bloommd.io", "www.bloommd.io")).toBe(true);
    expect(isPlausibleHostAllowed("bloommd.io", "WWW.BloomMD.io")).toBe(true);
  });

  test("keeps the test system and look-alike hosts out of the production statistics", () => {
    for (const hostname of ["test.bloommd.io", "staging.bloommd.io", "bloommd.io.evil.example", "evilbloommd.io", "localhost", "127.0.0.1", ""]) {
      expect(isPlausibleHostAllowed("bloommd.io", hostname)).toBe(false);
    }
    expect(isPlausibleHostAllowed("", "bloommd.io")).toBe(false);
  });
});
