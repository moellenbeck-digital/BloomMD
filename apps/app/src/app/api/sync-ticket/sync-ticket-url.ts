export function buildSyncTicketWebSocketUrl(syncUrl: string, documentId: string, ticket: string) {
  const url = new URL(syncUrl);
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws/${encodeURIComponent(documentId)}`;
  url.search = "";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}
