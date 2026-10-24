import { describe, expect, test } from "bun:test";
import { getPlausibleConfig, isPlausibleConfigured } from "./plausible";

describe("Plausible configuration", () => {
  test("requires all public values", () => {
    expect(isPlausibleConfigured({})).toBe(false);
    expect(isPlausibleConfigured({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "https://plausible.moellenbeck-digital.io/js/script.js",
    })).toBe(false);
  });

  test("returns the configured direct endpoints", () => {
    expect(getPlausibleConfig({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "https://plausible.moellenbeck-digital.io/js/script.js",
      NEXT_PUBLIC_PLAUSIBLE_API_HOST: "https://plausible.moellenbeck-digital.io",
    })).toEqual({
      domain: "bloommd.io",
      src: "https://plausible.moellenbeck-digital.io/js/script.js",
      apiHost: "https://plausible.moellenbeck-digital.io",
    });
  });

  test("rejects untrusted hosts and paths", () => {
    expect(getPlausibleConfig({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "https://plausible.example/js/script.js",
      NEXT_PUBLIC_PLAUSIBLE_API_HOST: "https://plausible.moellenbeck-digital.io",
    })).toBeNull();
    expect(getPlausibleConfig({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "https://plausible.moellenbeck-digital.io/js/script.js",
      NEXT_PUBLIC_PLAUSIBLE_API_HOST: "https://plausible.example",
    })).toBeNull();
    expect(getPlausibleConfig({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "https://plausible.moellenbeck-digital.io/admin/js/script.js",
      NEXT_PUBLIC_PLAUSIBLE_API_HOST: "https://plausible.moellenbeck-digital.io",
    })).toBeNull();
  });
});
