import { describe, expect, test } from "bun:test";
import { StartupTargets, type StartupTarget } from "./startup-targets";

describe("StartupTargets", () => {
  test("a link arriving during startup waits for the awaited startup path", async () => {
    const targets = new StartupTargets();
    expect(targets.offer({ path: "/v/Early.md", nodeId: "n1" })).toBe(true);
    expect(targets.hasPending).toBe(true);
    const opened: StartupTarget[] = [];
    await targets.drain(async (target) => { opened.push(target); }, { path: "/v/FromCli.md", nodeId: null });
    // The launching link is more specific than the command line it came with.
    expect(opened).toEqual([{ path: "/v/Early.md", nodeId: "n1" }]);
    expect(targets.hasPending).toBe(false);
  });

  test("falls back to the command-line target", async () => {
    const targets = new StartupTargets();
    const opened: string[] = [];
    await targets.drain(async (target) => { opened.push(target.path); }, { path: "/v/FromCli.md", nodeId: null });
    expect(opened).toEqual(["/v/FromCli.md"]);
  });

  test("targets arriving while one opens are opened in turn, not concurrently", async () => {
    const targets = new StartupTargets();
    const opened: string[] = [];
    let running = 0;
    await targets.drain(async (target) => {
      running += 1;
      expect(running).toBe(1);
      opened.push(target.path);
      if (target.path === "/v/A.md") targets.offer({ path: "/v/B.md", nodeId: null });
      await Bun.sleep(1);
      running -= 1;
    }, { path: "/v/A.md", nodeId: null });
    expect(opened).toEqual(["/v/A.md", "/v/B.md"]);
  });

  test("after settling, targets open directly", async () => {
    const targets = new StartupTargets();
    targets.offer({ path: "/v/DuringReconnect.md", nodeId: null });
    const opened: string[] = [];
    await targets.settle(async (target) => { opened.push(target.path); });
    expect(opened).toEqual(["/v/DuringReconnect.md"]);
    expect(targets.isSettled).toBe(true);
    expect(targets.offer({ path: "/v/Later.md", nodeId: null })).toBe(false);
  });
});
