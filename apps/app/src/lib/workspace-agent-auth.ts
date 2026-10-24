export function readWorkspaceAgentBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (bloom_agent_[A-Za-z0-9_-]{32,})$/);
  return match?.[1] ?? null;
}
