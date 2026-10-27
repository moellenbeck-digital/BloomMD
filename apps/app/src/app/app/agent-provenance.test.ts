import { describe, expect, test } from "bun:test";
import { provenanceParts } from "./agent-provenance";

const labels = { source: "Quelle", via: "über" };

describe("provenanceParts", () => {
  test("names the source, the reason and the tool of a change", () => {
    expect(provenanceParts({ source: "Teams-Transkript 27.10.", reason: "Aufgabe erledigt", tool: "bloommd_update_node" }, labels)).toEqual([
      "Quelle: Teams-Transkript 27.10.",
      "„Aufgabe erledigt“",
      "über bloommd_update_node",
    ]);
  });

  test("leaves out what the agent did not say", () => {
    expect(provenanceParts({ tool: "api:rename", source: null, reason: " " }, labels)).toEqual(["über api:rename"]);
    expect(provenanceParts({}, labels)).toEqual([]);
  });
});
