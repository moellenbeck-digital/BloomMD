import { describe, expect, test } from "bun:test";
import { agentE2ETimeoutMilliseconds, waitForAgentE2EProcess } from "./wait-for-process";

describe("agent E2E process wait", () => {
  test("rejects unsafe timeout configuration", () => {
    expect(() => agentE2ETimeoutMilliseconds("29")).toThrow("BLOOMMD_AGENT_E2E_TIMEOUT_SECONDS");
    expect(() => agentE2ETimeoutMilliseconds("not-a-number")).toThrow("BLOOMMD_AGENT_E2E_TIMEOUT_SECONDS");
    expect(agentE2ETimeoutMilliseconds("30")).toBe(30_000);
  });

  test("cancels a process and reports a timeout", async () => {
    let cancelled = false;
    const result = await waitForAgentE2EProcess({
      wait: new Promise<number>(() => undefined),
      timeoutMs: 1,
      cancel: () => {
        cancelled = true;
      },
    });

    expect(result).toEqual({ exitCode: null, timedOut: true });
    expect(cancelled).toBe(true);
  });

  test("returns the process result before the timeout", async () => {
    const result = await waitForAgentE2EProcess({
      wait: Promise.resolve(7),
      timeoutMs: 1_000,
      cancel: () => {
        throw new Error("must not cancel a completed process");
      },
    });

    expect(result).toEqual({ exitCode: 7, timedOut: false });
  });
});
