import type { FeedbackArea, FeedbackType } from "./feedback";
import type { StoredFeedbackAttachment } from "./feedback-storage";
import type { BloomMDBuildInfo } from "./build-info";

interface FeedbackGitHubConfig {
  token: string;
  repo: string;
  projectId: string | null;
  statusFieldId: string | null;
  feedbackOptionId: string | null;
}

export interface FeedbackGitHubInput {
  feedbackId: string;
  type: FeedbackType;
  area: FeedbackArea;
  message: string;
  userEmail: string;
  userId: string | null;
  route: string | null;
  diagnostics: string | null;
  contactEmail: string | null;
  userAgent: string | null;
  appVersion: string | null;
  buildInfo: BloomMDBuildInfo | null;
  submittedAt: string;
  attachments: StoredFeedbackAttachment[];
}

export interface FeedbackGitHubIssue {
  number: number;
  url: string;
  projectItemId: string | null;
}

type Fetcher = typeof fetch;

function feedbackGitHubConfig(env: NodeJS.ProcessEnv = process.env): FeedbackGitHubConfig | null {
  const token = env.BLOOMMD_FEEDBACK_GITHUB_TOKEN;
  const repo = env.BLOOMMD_FEEDBACK_GITHUB_REPO;
  if (!token || !repo) return null;
  return {
    token,
    repo,
    projectId: env.BLOOMMD_FEEDBACK_GITHUB_PROJECT_ID || null,
    statusFieldId: env.BLOOMMD_FEEDBACK_GITHUB_STATUS_FIELD_ID || null,
    feedbackOptionId: env.BLOOMMD_FEEDBACK_GITHUB_FEEDBACK_OPTION_ID || null,
  };
}

export function isFeedbackGitHubConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(feedbackGitHubConfig(env));
}

function titleForFeedback(input: FeedbackGitHubInput) {
  const short = input.message.replace(/\s+/g, " ").trim().slice(0, 80);
  return `[Beta Feedback] ${input.type}/${input.area}: ${short}`;
}

function bodyForFeedback(input: FeedbackGitHubInput) {
  const attachmentLines = input.attachments.length === 0
    ? ["Keine Anhänge gespeichert."]
    : input.attachments.map((attachment) => [
        `- ${attachment.kind}: \`${attachment.filename}\``,
        `  - MIME: \`${attachment.mimeType}\``,
        `  - Size: ${attachment.sizeBytes} bytes`,
        `  - SHA-256: \`${attachment.sha256}\``,
        `  - Object key: \`${attachment.objectKey}\``,
        attachment.signedUrl ? `  - Signed URL: ${attachment.signedUrl}` : null,
      ].filter(Boolean).join("\n"));

  return [
    "## Feedback",
    input.message,
    "",
    "## Kontext",
    `- Feedback ID: \`${input.feedbackId}\``,
    `- Typ: \`${input.type}\``,
    `- Bereich: \`${input.area}\``,
    `- Nutzer: \`${input.userEmail}\``,
    `- User ID: \`${input.userId ?? "anonymous"}\``,
    `- Kontakt-E-Mail: \`${input.contactEmail ?? "nicht angegeben"}\``,
    `- Route: \`${input.route ?? "unbekannt"}\``,
    `- Version/Commit: \`${input.appVersion ?? "unbekannt"}\``,
    `- Deployment: \`${input.buildInfo?.deployment ?? "unbekannt"}\``,
    `- Git-SHA: \`${input.buildInfo?.gitSha ?? "unbekannt"}\``,
    `- Git-Tag: \`${input.buildInfo?.gitTag ?? "unbekannt"}\``,
    `- Build-Zeitpunkt: \`${input.buildInfo?.buildTime ?? "unbekannt"}\``,
    `- Gemeldet: \`${input.submittedAt}\``,
    `- User-Agent: \`${input.userAgent ?? "unbekannt"}\``,
    "",
    "## Diagnose",
    input.diagnostics ?? "Keine Diagnosedaten übermittelt.",
    "",
    "## Anhänge",
    ...attachmentLines,
    "",
    "Die Links sind kurzlebig signiert. Falls ein Link abgelaufen ist, den Object-Key im privaten Feedback-Storage prüfen.",
  ].join("\n");
}

async function githubJson<T>(input: { fetcher: Fetcher; url: string; token: string; body: unknown }): Promise<T> {
  const response = await input.fetcher(input.url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(input.body),
  });
  if (!response.ok) throw new Error(`GitHub request failed with status ${response.status}.`);
  return response.json() as Promise<T>;
}

async function addIssueToProject(input: {
  config: FeedbackGitHubConfig;
  fetcher: Fetcher;
  issueNodeId: string;
}) {
  if (!input.config.projectId) return null;
  const added = await githubJson<{ data?: { addProjectV2ItemById?: { item?: { id?: string } } } }>({
    fetcher: input.fetcher,
    url: "https://api.github.com/graphql",
    token: input.config.token,
    body: {
      query: `mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }`,
      variables: { projectId: input.config.projectId, contentId: input.issueNodeId },
    },
  });
  const itemId = added.data?.addProjectV2ItemById?.item?.id ?? null;
  if (itemId && input.config.statusFieldId && input.config.feedbackOptionId) {
    await githubJson({
      fetcher: input.fetcher,
      url: "https://api.github.com/graphql",
      token: input.config.token,
      body: {
        query: `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId,
            itemId: $itemId,
            fieldId: $fieldId,
            value: { singleSelectOptionId: $optionId }
          }) {
            projectV2Item { id }
          }
        }`,
        variables: {
          projectId: input.config.projectId,
          itemId,
          fieldId: input.config.statusFieldId,
          optionId: input.config.feedbackOptionId,
        },
      },
    });
  }
  return itemId;
}

export async function createFeedbackGitHubIssue(input: FeedbackGitHubInput, fetcher: Fetcher = fetch): Promise<FeedbackGitHubIssue> {
  const config = feedbackGitHubConfig();
  if (!config) throw new Error("Feedback GitHub integration is not configured.");
  const [owner, repo] = config.repo.split("/");
  if (!owner || !repo) throw new Error("BLOOMMD_FEEDBACK_GITHUB_REPO must use owner/repo.");

  const issue = await githubJson<{
    number: number;
    html_url: string;
    node_id: string;
  }>({
    fetcher,
    url: `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    token: config.token,
    body: {
      title: titleForFeedback(input),
      body: bodyForFeedback(input),
      labels: ["user-feedback", "beta-feedback"],
    },
  });
  const projectItemId = await addIssueToProject({ config, fetcher, issueNodeId: issue.node_id });
  return { number: issue.number, url: issue.html_url, projectItemId };
}
