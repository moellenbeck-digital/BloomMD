import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopInstanceHandoff, ensurePrivateDir, type DesktopInstanceHandoff } from "./instance-handoff";

const handoffs: DesktopInstanceHandoff[] = [];

afterEach(async () => {
  await Promise.all(handoffs.splice(0).map((handoff) => handoff.close()));
});

test("forwards a second app launch to the primary instance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-handoff-"));
  const path = join(directory, "desktop.sock");
  const received: string[] = [];
  const primary = await createDesktopInstanceHandoff(path, (target) => received.push(target));
  handoffs.push(primary);
  const secondary = await createDesktopInstanceHandoff(path, (target) => received.push(target));
  handoffs.push(secondary);

  expect(primary.isPrimary).toBe(true);
  expect(secondary.isPrimary).toBe(false);
  expect(await secondary.forward("/tmp/from-deeplink.md")).toBe(true);
  await Bun.sleep(25);
  expect(received).toEqual(["/tmp/from-deeplink.md"]);
});

test("forwards the node to select together with the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-handoff-"));
  const path = join(directory, "desktop.sock");
  const received: Array<[string, string | null]> = [];
  const primary = await createDesktopInstanceHandoff(path, (target, nodeId) => received.push([target, nodeId]));
  handoffs.push(primary);
  const secondary = await createDesktopInstanceHandoff(path, () => undefined);
  handoffs.push(secondary);

  expect(await secondary.forward("/tmp/note.md", "a1b2c3")).toBe(true);
  expect(await secondary.forward("/tmp/other.md", "bad id <script>")).toBe(true);
  await Bun.sleep(25);
  // A malformed node id never reaches the app; the file still opens.
  expect(received).toEqual([["/tmp/note.md", "a1b2c3"], ["/tmp/other.md", null]]);
});

const unixUser = process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0;

test.skipIf(!unixUser)("a lock left by a process of another user is not a live instance of ours", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-handoff-"));
  const path = join(directory, "desktop.sock");
  // pid 1 belongs to root: signalling it fails with EPERM.
  await writeFile(`${path}.lock`, "1\n");
  const handoff = await createDesktopInstanceHandoff(path, () => undefined);
  handoffs.push(handoff);
  expect(handoff.isPrimary).toBe(true);
});

describe("ensurePrivateDir", () => {
  test.skipIf(!unixUser)("creates the socket directory readable only by this user", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "bloommd-handoff-")), "bloommd-uid");
    await ensurePrivateDir(dir);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  test.skipIf(!unixUser)("closes an existing directory of ours that others could open", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "bloommd-handoff-")), "bloommd-uid");
    await mkdir(dir);
    await chmod(dir, 0o777);
    await ensurePrivateDir(dir);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  test.skipIf(!unixUser)("refuses a path that is not a plain directory", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "bloommd-handoff-")), "bloommd-uid");
    await writeFile(dir, "squatted");
    await expect(ensurePrivateDir(dir)).rejects.toThrow();
  });

  test.skipIf(!unixUser)("the handoff listens inside the private directory", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "bloommd-handoff-")), "bloommd-uid");
    const handoff = await createDesktopInstanceHandoff(join(dir, "desktop.sock"), () => undefined, { privateDir: dir });
    handoffs.push(handoff);
    expect(handoff.isPrimary).toBe(true);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });
});
