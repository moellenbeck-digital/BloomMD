import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WAITLIST_PURGE_RETENTION_DAYS } from "../../apps/marketing/src/lib/waitlist-retention";

const repoRoot = join(import.meta.dir, "../..");

function read(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("waitlist retention wording", () => {
  test("the app privacy page names the same retention as the purge command", () => {
    const match = read("apps/app/src/app/datenschutz/page.tsx").match(/const WAITLIST_PURGE_RETENTION_DAYS = (\d+);/);
    expect(Number(match?.[1])).toBe(WAITLIST_PURGE_RETENTION_DAYS);
  });

  test("the marketing privacy page reads the retention from the shared constant", () => {
    expect(read("apps/marketing/src/app/datenschutz/page.tsx")).toContain("WAITLIST_PURGE_RETENTION_DAYS");
  });

  test("the store privacy text names the same retention", () => {
    expect(read("packages/mobile/store/PRIVACY-POLICY-APP-SECTION.md")).toContain(
      `${WAITLIST_PURGE_RETENTION_DAYS} Tage nach der\n  Einladungs-E-Mail gelöscht`,
    );
  });

  test("neither privacy page still describes the waitlist as open", () => {
    for (const path of ["apps/app/src/app/datenschutz/page.tsx", "apps/marketing/src/app/datenschutz/page.tsx"]) {
      const source = read(path);
      expect(source).not.toContain("Wer sich in die Warteliste einträgt");
      expect(source).not.toContain("Anyone joining the waitlist");
      expect(source).toContain("Warteliste (beendet)");
    }
  });
});
