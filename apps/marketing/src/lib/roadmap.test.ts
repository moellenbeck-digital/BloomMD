import { afterEach, expect, test } from "bun:test";
import { getPublicRoadmap } from "./roadmap";

const originalFetch = globalThis.fetch;
const originalToken = process.env.BLOOMMD_ROADMAP_GITHUB_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.BLOOMMD_ROADMAP_GITHUB_TOKEN;
  else process.env.BLOOMMD_ROADMAP_GITHUB_TOKEN = originalToken;
});

function roadmapNode(number: number, boardStatus?: string, projectTitle = "BloomMD Roadmap") {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/moellenbeck-digital/BloomMD/issues/${number}`,
    body: "A public summary of the issue.",
    labels: { nodes: [{ name: "public-roadmap" }] },
    projectItems: {
      nodes: boardStatus
        ? [{ project: { title: projectTitle }, fieldValues: { nodes: [{ name: boardStatus, field: { name: "Status" } }] } }]
        : [],
    },
  };
}

test("maps the current GitHub board statuses without inventing feedback status", async () => {
  process.env.BLOOMMD_ROADMAP_GITHUB_TOKEN = "test-token";
  const nodes = [
    roadmapNode(1, "Neue Aufgabe"),
    roadmapNode(2, "Todo"),
    roadmapNode(3, "In Arbeit"),
    roadmapNode(4, "Zu reviewen"),
    roadmapNode(5, "Nacharbeiten"),
    roadmapNode(6, "Fertig"),
    roadmapNode(7, "Unknown"),
    roadmapNode(8),
    roadmapNode(9, "Todo", "Other Project"),
  ];
  globalThis.fetch = Object.assign(
    async () => Response.json({ data: { repository: { issues: { nodes } } } }),
    { preconnect: originalFetch.preconnect },
  );

  const result = await getPublicRoadmap();

  expect(result.source).toBe("github");
  expect(result.issues.map(({ number, status }) => [number, status])).toEqual([
    [1, "Feedback"],
    [2, "Planned"],
    [3, "In progress"],
    [4, "In review"],
    [5, "In progress"],
  ]);
});
