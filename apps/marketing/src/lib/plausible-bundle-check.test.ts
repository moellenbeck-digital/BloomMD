import { describe, expect, test } from "bun:test";
import { checkPlausibleBundle, describePlausibleBundleReport, inlinedValues } from "./plausible-bundle-check";

const config = (domain: string, src = "/_plausible/js/script.js", apiHost = "/_plausible") =>
  `function c(){return{NEXT_PUBLIC_PLAUSIBLE_DOMAIN:"${domain}",NEXT_PUBLIC_PLAUSIBLE_SRC:"${src}",NEXT_PUBLIC_PLAUSIBLE_API_HOST:"${apiHost}"}}var e=a+"/api/event";`;
// "bloommd.io" appears in every bundle as text and links; it must not count as the baked-in domain.
const texts = { path: ".next/static/chunks/texts.js", text: 'x="Mail an hello@bloommd.io";y="https://bloommd.io/datenschutz"' };

function run(clientFiles: { path: string; text: string }[], expectedDomain = "bloommd.io", extra: { path: string; text: string }[] = []) {
  return checkPlausibleBundle({ clientFiles, allFiles: [...clientFiles, ...extra], expectedDomain });
}

describe("inlinedValues", () => {
  test("reads the literal value of a key, with any quote style", () => {
    expect(inlinedValues('a={NEXT_PUBLIC_PLAUSIBLE_DOMAIN:"bloommd.io"}', "NEXT_PUBLIC_PLAUSIBLE_DOMAIN")).toEqual(["bloommd.io"]);
    expect(inlinedValues("a={NEXT_PUBLIC_PLAUSIBLE_DOMAIN:'localhost'}", "NEXT_PUBLIC_PLAUSIBLE_DOMAIN")).toEqual(["localhost"]);
    expect(inlinedValues('a={NEXT_PUBLIC_PLAUSIBLE_DOMAIN:""}', "NEXT_PUBLIC_PLAUSIBLE_DOMAIN")).toEqual([""]);
    expect(inlinedValues("a={NEXT_PUBLIC_PLAUSIBLE_DOMAIN:void 0}", "NEXT_PUBLIC_PLAUSIBLE_DOMAIN")).toEqual([]);
  });
});

describe("checkPlausibleBundle", () => {
  test("passes with domain, script path and API host in the same chunk", () => {
    const report = run([texts, { path: ".next/static/chunks/app.js", text: config("bloommd.io") }]);
    expect(report.errors).toEqual([]);
    expect(report.domainFiles).toEqual([".next/static/chunks/app.js"]);
    expect(report.scriptFiles).toEqual([".next/static/chunks/app.js"]);
    expect(report.apiHostFiles).toEqual([".next/static/chunks/app.js"]);
    expect(report.eventPathFiles).toEqual([".next/static/chunks/app.js"]);
  });

  test("passes with a configured domain such as localhost when it is the expected one", () => {
    expect(run([{ path: "a.js", text: config("localhost") }], "localhost").errors).toEqual([]);
  });

  test("fails for an empty domain even though bloommd.io is in the bundle as text", () => {
    const report = run([texts, { path: ".next/static/chunks/app.js", text: config("") }]);
    expect(report.errors.some((error) => error.includes("baked in empty"))).toBe(true);
    expect(report.errors.some((error) => error.includes("ships no tracking"))).toBe(true);
  });

  test("fails when the domain is not baked in at all (variable unset at build time)", () => {
    const report = run([texts, { path: "a.js", text: 'x={NEXT_PUBLIC_PLAUSIBLE_DOMAIN:void 0,NEXT_PUBLIC_PLAUSIBLE_SRC:"/_plausible/js/script.js"};a+"/api/event"' }]);
    expect(report.errors.some((error) => error.includes("ships no tracking"))).toBe(true);
  });

  test("fails when the baked-in domain differs from the expected one", () => {
    const report = run([{ path: "a.js", text: config("localhost") }]);
    expect(report.errors.some((error) => error.includes('is "localhost", expected "bloommd.io"'))).toBe(true);
  });

  test("fails for the legacy host, in the client bundle or anywhere else in the build", () => {
    const inConfig = run([{ path: "a.js", text: config("bloommd.io", "https://plausible.moellenbeck-digital.io/js/script.js") }]);
    expect(inConfig.errors.some((error) => error.includes("legacy Plausible host"))).toBe(true);
    expect(inConfig.errors.some((error) => error.includes("NEXT_PUBLIC_PLAUSIBLE_SRC"))).toBe(true);

    const elsewhere = run([{ path: "a.js", text: config("bloommd.io") }], "bloommd.io", [{ path: ".next/server/page.html", text: "https://plausible.moellenbeck-digital.io" }]);
    expect(elsewhere.errors.some((error) => error.includes(".next/server/page.html"))).toBe(true);
  });

  test("fails when the script path is missing in the chunk with the domain", () => {
    const report = run([{ path: "a.js", text: config("bloommd.io", "") }, { path: "b.js", text: 'k="/_plausible/js/script.js"' }]);
    expect(report.errors.some((error) => error.includes("NEXT_PUBLIC_PLAUSIBLE_SRC"))).toBe(true);
  });

  test("fails when the expected domain is empty", () => {
    expect(run([{ path: "a.js", text: config("") }], "").errors[0]).toContain("expected Plausible domain is empty");
  });
});

describe("describePlausibleBundleReport", () => {
  test("lists file names and counts, not contents", () => {
    const report = run([{ path: ".next/static/chunks/app.js", text: config("bloommd.io") }]);
    const lines = describePlausibleBundleReport(report, "bloommd.io", 7).join("\n");
    expect(lines).toContain(".next/static/chunks/app.js");
    expect(lines).toContain("not found in any of 7 text files");
    expect(lines).not.toContain("function c()");
  });
});
