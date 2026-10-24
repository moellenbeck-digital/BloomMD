import { describe, expect, test } from "bun:test";
import { ApiFileStore } from "./api-file-store";
import { validateAndActivateConnection } from "./connection-profile-flow";
import type { ConnectionProfile } from "./settings";

const profile: ConnectionProfile = {
  id: "server-one",
  name: "Team",
  url: "https://bloommd.app",
  tokenRef: "connection-profile:server-one",
};

describe("connection profile switching", () => {
  test("switches between two validated servers and keeps the last session on auth failure", async () => {
    const createServer = (workspaceName: string, status = 200) => Bun.serve({
      port: 0,
      fetch(request) {
        if (status !== 200) return new Response("unauthorized", { status });
        const pathname = new URL(request.url).pathname;
        if (pathname === "/api/workspaces") {
          return Response.json({
            workspace: { id: workspaceName, name: workspaceName, slug: workspaceName, kind: "personal", role: "owner" },
            workspaces: [{ id: workspaceName, name: workspaceName, slug: workspaceName, kind: "personal", role: "owner" }],
          });
        }
        if (pathname === "/api/mindmaps") return Response.json({ files: [] });
        if (pathname === "/api/config") return Response.json({ syncUrl: "" });
        return new Response("not found", { status: 404 });
      },
    });
    const firstServer = createServer("server-one");
    const secondServer = createServer("server-two");
    const unavailableServer = createServer("server-unavailable", 401);
    const profiles: ConnectionProfile[] = [
      { id: "one", name: "One", url: `http://127.0.0.1:${firstServer.port}`, tokenRef: "connection-profile:one" },
      { id: "two", name: "Two", url: `http://127.0.0.1:${secondServer.port}`, tokenRef: "connection-profile:two" },
      { id: "unavailable", name: "Unavailable", url: `http://127.0.0.1:${unavailableServer.port}`, tokenRef: "connection-profile:unavailable" },
    ];
    let activeProfileId = "local";

    const connect = async (nextProfile: ConnectionProfile) => validateAndActivateConnection(
      nextProfile,
      async (target) => {
        const store = new ApiFileStore({ baseUrl: target.url, accessToken: "bloom_pat_test" });
        await store.listWorkspaces();
        await store.list();
        await store.fetchSyncUrl();
        return store;
      },
      async (target) => {
        activeProfileId = target.id;
      },
    );

    try {
      await connect(profiles[0]!);
      expect(activeProfileId).toBe("one");
      await connect(profiles[1]!);
      expect(activeProfileId).toBe("two");
      await expect(connect(profiles[2]!)).rejects.toThrow("API workspaces failed: 401");
      expect(activeProfileId).toBe("two");
    } finally {
      firstServer.stop(true);
      secondServer.stop(true);
      unavailableServer.stop(true);
    }
  });

  test("activates only after authentication and network validation succeeds", async () => {
    const events: string[] = [];
    const result = await validateAndActivateConnection(
      profile,
      async () => {
        events.push("validated");
        return { files: 2 };
      },
      async (_profile, value) => {
        events.push(`activated:${value.files}`);
      },
    );

    expect(result).toEqual({ files: 2 });
    expect(events).toEqual(["validated", "activated:2"]);
  });

  test("keeps activation untouched when validation rejects the profile", async () => {
    let activeSession = "server-old";
    await expect(
      validateAndActivateConnection(
        profile,
        async () => {
          throw new Error("API list failed: 401");
        },
        async () => {
          activeSession = profile.id;
        },
      ),
    ).rejects.toThrow("API list failed: 401");

    expect(activeSession).toBe("server-old");
  });
});
