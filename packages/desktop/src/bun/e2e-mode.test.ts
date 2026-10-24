import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { parseDesktopArgs } from "./e2e-mode";

describe("parseDesktopArgs", () => {
  it("keeps the first non-flag argument as CLI target", () => {
    const parsed = parseDesktopArgs(["--foo", ".", "--bar"], {}, "/workspace");

    expect(parsed.cliTargetArg).toBe(".");
    expect(parsed.e2e.enabled).toBe(false);
  });

  it("does not treat E2E option values as CLI targets", () => {
    const parsed = parseDesktopArgs(
      ["--e2e", "--e2e-state", ".qa/state.json", "--e2e-log=.qa/events.jsonl", "notes/plan.md"],
      {},
      "/workspace",
    );

    expect(parsed.cliTargetArg).toBe("notes/plan.md");
    expect(parsed.e2e.enabled).toBe(true);
    expect(parsed.e2e.statePath).toBe(resolve("/workspace", ".qa/state.json"));
    expect(parsed.e2e.logPath).toBe(resolve("/workspace", ".qa/events.jsonl"));
  });

  it("enables E2E mode from BLOOMMD_E2E_DIR", () => {
    const parsed = parseDesktopArgs([], { BLOOMMD_E2E_DIR: "fixtures/smoke" }, "/workspace");

    expect(parsed.cliTargetArg).toBeUndefined();
    expect(parsed.e2e.enabled).toBe(true);
    expect(parsed.e2e.localDir).toBe(resolve("/workspace", "fixtures/smoke"));
  });

  it("keeps an E2E launch target from the environment when the native launcher cannot forward argv", () => {
    const parsed = parseDesktopArgs([], { BLOOMMD_E2E_TARGET: "/workspace/notes/plan.md" }, "/workspace");

    expect(parsed.cliTargetArg).toBe("/workspace/notes/plan.md");
    expect(parsed.e2e.enabled).toBe(false);
  });

  it("opens the note Obsidian passes in BLOOMMD_OPEN_TARGET, including its node", () => {
    const link = "bloommd://open?path=%2FVault%2FPhysik.md&node=abc123";
    const parsed = parseDesktopArgs([], { BLOOMMD_OPEN_TARGET: link, BLOOMMD_E2E_TARGET: "/other.md" }, "/workspace");

    expect(parsed.cliTargetArg).toBe(link);
    expect(parsed.e2e.enabled).toBe(false);
  });
});
