import { describe, expect, test } from "bun:test";
import { buildSyncTicketWebSocketUrl } from "./sync-ticket-url";

describe("buildSyncTicketWebSocketUrl", () => {
  test("keeps configured wss sync origins secure", () => {
    expect(buildSyncTicketWebSocketUrl("wss://sync.bloommd.app", "doc-1", "ticket-1")).toBe(
      "wss://sync.bloommd.app/ws/doc-1?ticket=ticket-1",
    );
  });

  test("converts https service origins to wss websocket URLs", () => {
    expect(buildSyncTicketWebSocketUrl("https://sync.bloommd.app/base/", "doc/1", "ticket value")).toBe(
      "wss://sync.bloommd.app/base/ws/doc%2F1?ticket=ticket+value",
    );
  });

  test("keeps local ws origins on ws", () => {
    expect(buildSyncTicketWebSocketUrl("ws://localhost:4100", "doc-1", "ticket-1")).toBe(
      "ws://localhost:4100/ws/doc-1?ticket=ticket-1",
    );
  });
});
