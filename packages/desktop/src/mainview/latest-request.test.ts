import { expect, test } from "bun:test";
import { LatestRequest } from "./latest-request";

test("late file and workspace responses cannot replace a newer navigation", async () => {
  const requests = new LatestRequest();
  let resolveOld!: (value: string) => void;
  const old = new Promise<string>((resolve) => { resolveOld = resolve; });
  let current = "initial";
  const load = async (read: Promise<string>) => {
    const isCurrent = requests.begin();
    const result = await read;
    if (isCurrent()) current = result;
  };
  const pending = load(old);
  await load(Promise.resolve("new workspace"));
  resolveOld("old file");
  await pending;
  expect(current).toBe("new workspace");
  const isCurrent = requests.begin();
  requests.invalidate();
  expect(isCurrent()).toBe(false);
});
