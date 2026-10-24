import { expect, test } from "bun:test";
import { assertReleaseSignature } from "./verify-macos-release";

const valid = "Authority=Developer ID Application: Example (TEAM123456)\nTeamIdentifier=TEAM123456\nTimestamp=Oct 4, 2026\nCodeDirectory v=20500 size=123 flags=0x10000(runtime) hashes=1\n";

test("release gate rejects ad-hoc, wrong-team, untimestamped and unhardened code", () => {
  expect(() => assertReleaseSignature(valid, "TEAM123456", true)).not.toThrow();
  expect(() => assertReleaseSignature(valid, "WRONGTEAM", true)).toThrow();
  expect(() => assertReleaseSignature(valid.replace(/^Authority=.*\n/m, "Signature=adhoc\n"), "TEAM123456", true)).toThrow();
  expect(() => assertReleaseSignature(valid.replace(/^Timestamp=.*\n/m, ""), "TEAM123456", true)).toThrow();
  expect(() => assertReleaseSignature(valid.replace("0x10000(runtime)", "0x0(none)"), "TEAM123456", true)).toThrow();
  expect(() => assertReleaseSignature(valid.replace("0x10000(runtime)", "0x0(none)"), "TEAM123456", false)).not.toThrow();
});
