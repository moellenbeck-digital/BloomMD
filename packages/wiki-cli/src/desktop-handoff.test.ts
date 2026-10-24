import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { desktopHandoffPath, forwardToRunningDesktop } from "./desktop-handoff";

let server: Server | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
  if (process.platform !== "win32") await rm(desktopHandoffPath(), { force: true });
  delete process.env.BLOOMMD_DESKTOP_HANDOFF_PATH;
});

describe("desktop handoff", () => {
  test("forwards an open target to a running desktop process", async () => {
    const received: string[] = [];
    const directory = await mkdtemp(join(tmpdir(), "bloommd-handoff-"));
    process.env.BLOOMMD_DESKTOP_HANDOFF_PATH = join(directory, "desktop.sock");
    const path = desktopHandoffPath();
    if (process.platform !== "win32") await mkdir(dirname(path), { recursive: true });
    server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        const message = JSON.parse(chunk.trim()) as { type: string; target: string };
        if (message.type === "open") received.push(message.target);
        socket.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      const activeServer = server;
      if (!activeServer) {
        reject(new Error("Desktop handoff test server was not created."));
        return;
      }
      const cleanup = () => {
        activeServer.off("error", onError);
        activeServer.off("listening", onListening);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onListening = () => {
        cleanup();
        resolve();
      };
      activeServer.once("error", onError);
      activeServer.once("listening", onListening);
      activeServer.listen(path);
    });

    expect(await forwardToRunningDesktop("/tmp/notes.md")).toBe(true);
    await Bun.sleep(25);
    expect(received).toEqual(["/tmp/notes.md"]);
  });
});
