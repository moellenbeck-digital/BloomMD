import { expect, test } from "bun:test";
import { FileChangeQueue } from "./file-change-queue";

test("bursts coalesce and changes during refresh receive a subsequent refresh", async () => {
  const calls: string[][] = [];
  let finishFirst!: () => void;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  let finishSecond!: () => void;
  const second = new Promise<void>((resolve) => { finishSecond = resolve; });
  const queue = new FileChangeQueue(async (files) => {
    calls.push([...files]);
    if (calls.length === 1) await first;
    else finishSecond();
  }, (error) => { throw error; });
  queue.add("a.md"); queue.add("a.md"); queue.add("b.md");
  await Promise.resolve();
  expect(calls).toEqual([["a.md", "b.md"]]);
  queue.add("a.md"); queue.add("c.md");
  finishFirst();
  await second;
  expect(calls).toEqual([["a.md", "b.md"], ["a.md", "c.md"]]);
});

test("folder switch discards pending old-context changes without swallowing failures", async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  let failed!: () => void;
  const failure = new Promise<void>((resolve) => { failed = resolve; });
  const calls: string[][] = [];
  const queue = new FileChangeQueue(async (files) => {
    calls.push([...files]);
    await gate;
    throw new Error("read failed");
  }, () => failed());
  queue.add("first.md");
  await Promise.resolve();
  queue.add("old-context.md");
  queue.clear();
  finish();
  await failure;
  expect(calls).toEqual([["first.md"]]);
});
