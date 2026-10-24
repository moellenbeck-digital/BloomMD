import { describe, expect, test } from "bun:test";
import { createSyncTelemetry } from "./observability";

describe("sync observability", () => {
  test("redacts room identifiers and error messages from structured events", () => {
    const lines: string[] = [];
    const telemetry = createSyncTelemetry({
      contextKey: "test-only-context-key",
      now: () => Date.UTC(2026, 8, 13, 12, 0, 0),
      write: (line) => lines.push(line),
    });

    telemetry.event({
      operation: "persistence",
      outcome: "error",
      roomKey: "/Users/alice/Private Notes/medical-plan.md",
      correlationId: "a-random-correlation-id",
      error: new Error("token=sensitive-token and user=alice@example.com"),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("Private Notes");
    expect(lines[0]).not.toContain("medical-plan");
    expect(lines[0]).not.toContain("sensitive-token");
    expect(lines[0]).not.toContain("alice@example.com");
    expect(JSON.parse(lines[0] ?? "{}")).toEqual({
      timestamp: "2026-09-13T12:00:00.000Z",
      component: "sync",
      operation: "persistence",
      outcome: "error",
      room: expect.stringMatching(/^[a-f0-9]{16}$/),
      correlationId: "a-random-correlation-id",
      errorClass: "Error",
    });
  });

  test("exports global counters, gauges, and duration summaries without labels", () => {
    const telemetry = createSyncTelemetry({ write: () => undefined });
    telemetry.increment("sync_messages_total", 2);
    telemetry.increment("sync_persistence_retries_total");
    telemetry.setGauge("sync_active_rooms", 3);
    telemetry.observe("sync_persistence_duration_ms", 12.5);

    const metrics = telemetry.prometheus();

    expect(metrics).toContain("sync_messages_total 2");
    expect(metrics).toContain("sync_persistence_retries_total 1");
    expect(metrics).toContain("sync_active_rooms 3");
    expect(metrics).toContain("sync_persistence_duration_ms_count 1");
    expect(metrics).toContain("sync_persistence_duration_ms_sum 12.5");
    expect(metrics).not.toContain("room=");
  });

  test("uses a fixed fallback for an untrusted custom error name", () => {
    const lines: string[] = [];
    const telemetry = createSyncTelemetry({ write: (line) => lines.push(line) });
    const error = new Error("safe message");
    error.name = "alice@example.com-token";

    telemetry.event({ operation: "persistence", outcome: "error", error });

    expect(lines[0]).not.toContain("alice@example.com");
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ errorClass: "UnknownError" });
  });
});
