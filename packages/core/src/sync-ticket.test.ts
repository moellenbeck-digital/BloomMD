import { describe, expect, test } from "bun:test";
import { signSyncTicket, verifySyncTicket, type SyncTicketClaims } from "./sync-ticket";

const secret = "test-sync-secret-with-at-least-32-characters";
const claims: SyncTicketClaims = {
  userId: "user-a",
  workspaceId: "workspace-a",
  documentId: "document-a",
  filename: "project.md",
  permission: "write",
  exp: Math.floor(Date.now() / 1000) + 300,
};

describe("sync tickets", () => {
  test("roundtrips valid document-scoped claims", () => {
    expect(verifySyncTicket(signSyncTicket(claims, secret), secret)).toEqual(claims);
  });

  test("carries the access token a ticket was made for, and refuses an empty or non-string one", () => {
    const withToken = { ...claims, tokenId: "11111111-1111-4111-8111-111111111111" };
    expect(verifySyncTicket(signSyncTicket(withToken, secret), secret)).toEqual(withToken);
    expect(verifySyncTicket(signSyncTicket({ ...claims, tokenId: "" }, secret), secret)).toBeNull();
    expect(verifySyncTicket(signSyncTicket({ ...claims, tokenId: 7 as unknown as string }, secret), secret)).toBeNull();
  });

  test("rejects tampered, expired, and weakly signed tickets", () => {
    const token = signSyncTicket(claims, secret);
    expect(verifySyncTicket(`${token}x`, secret)).toBeNull();
    expect(verifySyncTicket(token, secret, (claims.exp + 1) * 1000)).toBeNull();
    expect(() => signSyncTicket(claims, "short")).toThrow();
  });
});
