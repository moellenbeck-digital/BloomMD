const roadmapOwner = "moellenbeck-digital";
const roadmapRepo = "BloomMD";
const roadmapProjectTitle = "BloomMD Roadmap";
const publicRoadmapLabel = "public-roadmap";
export const roadmapRevalidateSeconds = 30;

export type RoadmapStatus = "Feedback" | "Ready" | "In progress" | "In review";

export type RoadmapTag =
  | "Mac"
  | "Windows"
  | "Linux"
  | "Web"
  | "Obsidian"
  | "Sync"
  | "Dokumentation"
  | "Feedback"
  | "Editor"
  | "Dateien"
  | "Ressourcen"
  | "Workspace"
  | "Beta"
  | "Local-first"
  | "Collaboration"
  | "Post-M1";

export type RoadmapIssue = {
  number: number;
  title: string;
  url: string;
  description: string;
  status: RoadmapStatus;
  tags: RoadmapTag[];
};

export type RoadmapSource = "github" | "fallback";

export type RoadmapData = {
  issues: RoadmapIssue[];
  source: RoadmapSource;
  fetchedAt: string;
};

type GraphQLResponse = {
  data?: {
    repository?: {
      issues?: {
        nodes?: GitHubIssueNode[];
      };
    };
  };
  errors?: { message?: string }[];
};

type GitHubIssueNode = {
  number?: unknown;
  title?: unknown;
  url?: unknown;
  body?: unknown;
  labels?: {
    nodes?: { name?: unknown }[];
  };
  projectItems?: {
    nodes?: {
      project?: { title?: unknown };
      fieldValues?: {
        nodes?: {
          name?: unknown;
          field?: { name?: unknown };
        }[];
      };
    }[];
  };
};

const publicStatuses: RoadmapStatus[] = ["Feedback", "Ready", "In progress", "In review"];

const fallbackRoadmapIssues: RoadmapIssue[] = [];

const tagLabelMap: Record<string, RoadmapTag[]> = {
  desktop: ["Mac"],
  macos: ["Mac"],
  windows: ["Windows"],
  linux: ["Linux"],
  web: ["Web"],
  sync: ["Sync"],
  documentation: ["Dokumentation"],
  docs: ["Dokumentation"],
  "beta-feedback": ["Feedback", "Beta"],
  feedback: ["Feedback"],
  editor: ["Editor"],
  file: ["Dateien"],
  files: ["Dateien"],
  resource: ["Ressourcen"],
  resources: ["Ressourcen"],
  workspace: ["Workspace"],
  beta: ["Beta"],
  collaboration: ["Collaboration"],
  obsidian: ["Obsidian"],
  plugin: ["Obsidian", "Post-M1"],
};

export const roadmapFilters: RoadmapTag[] = [
  "Mac",
  "Windows",
  "Linux",
  "Web",
  "Sync",
  "Obsidian",
  "Dokumentation",
  "Feedback",
  "Post-M1",
];

export const roadmapStatuses = publicStatuses;

export async function getPublicRoadmap(): Promise<RoadmapData> {
  const fetchedAt = new Date().toISOString();
  const token = process.env.BLOOMMD_ROADMAP_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;

  if (!token) {
    return { issues: fallbackRoadmapIssues, source: "fallback", fetchedAt };
  }

  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "BloomMD Marketing Roadmap",
      },
      body: JSON.stringify({
        query: `
          query PublicRoadmapIssues($owner: String!, $repo: String!, $label: String!, $first: Int!) {
            repository(owner: $owner, name: $repo) {
              issues(first: $first, labels: [$label], states: [OPEN], orderBy: { field: UPDATED_AT, direction: DESC }) {
                nodes {
                  number
                  title
                  url
                  body
                  labels(first: 30) {
                    nodes {
                      name
                    }
                  }
                  projectItems(first: 10) {
                    nodes {
                      project {
                        title
                      }
                      fieldValues(first: 20) {
                        nodes {
                          ... on ProjectV2ItemFieldSingleSelectValue {
                            name
                            field {
                              ... on ProjectV2FieldCommon {
                                name
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          owner: roadmapOwner,
          repo: roadmapRepo,
          label: publicRoadmapLabel,
          first: 40,
        },
      }),
      next: { revalidate: roadmapRevalidateSeconds },
    });

    if (!response.ok) {
      return { issues: fallbackRoadmapIssues, source: "fallback", fetchedAt };
    }

    const json = (await response.json()) as GraphQLResponse;
    if (json.errors?.length) {
      return { issues: fallbackRoadmapIssues, source: "fallback", fetchedAt };
    }

    const nodes = json.data?.repository?.issues?.nodes ?? [];
    const issues = nodes.map(toRoadmapIssue).filter((issue): issue is RoadmapIssue => issue !== null);
    return { issues, source: "github", fetchedAt };
  } catch (error) {
    console.error("Failed to load public roadmap from GitHub", error);
    return { issues: fallbackRoadmapIssues, source: "fallback", fetchedAt };
  }
}

function toRoadmapIssue(node: GitHubIssueNode): RoadmapIssue | null {
  if (typeof node.number !== "number" || typeof node.title !== "string" || typeof node.url !== "string") {
    return null;
  }

  const labels = (node.labels?.nodes ?? [])
    .map((label) => label.name)
    .filter((name): name is string => typeof name === "string");

  if (!labels.includes(publicRoadmapLabel)) {
    return null;
  }

  const status = readProjectStatus(node) ?? "Feedback";
  const body = typeof node.body === "string" ? node.body : "";
  const description = readPublicSummary(body) ?? summarizeBody(body);

  return {
    number: node.number,
    title: node.title,
    url: node.url,
    description,
    status,
    tags: publicTagsFromLabels(labels, node.title).slice(0, 3),
  };
}

function readProjectStatus(node: GitHubIssueNode): RoadmapStatus | null {
  for (const item of node.projectItems?.nodes ?? []) {
    if (item.project?.title !== roadmapProjectTitle) {
      continue;
    }

    for (const value of item.fieldValues?.nodes ?? []) {
      if (value.field?.name === "Status" && typeof value.name === "string" && isRoadmapStatus(value.name)) {
        return value.name;
      }
    }
  }

  return null;
}

function isRoadmapStatus(value: string): value is RoadmapStatus {
  return publicStatuses.includes(value as RoadmapStatus);
}

function publicTagsFromLabels(labels: string[], title: string): RoadmapTag[] {
  const normalizedTitle = title.toLowerCase();
  const tagSet = new Set<RoadmapTag>();

  for (const label of labels) {
    for (const tag of tagLabelMap[label.toLowerCase()] ?? []) {
      tagSet.add(tag);
    }
  }

  if (normalizedTitle.includes("windows")) tagSet.add("Windows");
  if (normalizedTitle.includes("linux")) tagSet.add("Linux");
  if (normalizedTitle.includes("obsidian")) tagSet.add("Obsidian");
  if (normalizedTitle.includes("sync")) tagSet.add("Sync");
  if (normalizedTitle.includes("roadmap")) tagSet.add("Feedback");

  return Array.from(tagSet).filter((tag) => roadmapFilters.includes(tag) || tag === "Beta" || tag === "Collaboration");
}

function readPublicSummary(body: string): string | null {
  const commentMatch = body.match(/<!--\s*public-roadmap-summary:\s*([\s\S]*?)\s*-->/i);
  const lineMatch = body.match(/^Public roadmap summary:\s*(.+)$/im);
  const summary = sanitizePublicDescription(commentMatch?.[1] ?? lineMatch?.[1] ?? "");

  return summary.length > 0 ? summary : null;
}

function summarizeBody(body: string): string {
  const paragraph = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith("#") && !part.startsWith("- ["));

  if (!paragraph) {
    return "Öffentlich freigegebenes BloomMD-Ticket.";
  }

  const plain = sanitizePublicDescription(paragraph);

  return plain.length > 180 ? `${plain.slice(0, 177).trimEnd()}...` : plain;
}

function sanitizePublicDescription(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\/Users\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
