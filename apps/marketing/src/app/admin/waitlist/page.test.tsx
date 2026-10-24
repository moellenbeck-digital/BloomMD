import { describe, expect, test } from "bun:test";
import { rowErrorMessage, rowSuccessMessage, waitlistAdminActionLabel } from "./waitlist-admin-labels";

describe("waitlist admin action labels", () => {
  test("maps every operational waitlist state to one clear row action", () => {
    expect(waitlistAdminActionLabel({ waitlistStatus: "pending", betaInviteStatus: "none", inviteConfigured: true })).toBe("Bestätigung erneut senden");
    expect(waitlistAdminActionLabel({ waitlistStatus: "unsubscribed", betaInviteStatus: "none", inviteConfigured: true })).toBe("Löschen");
    expect(waitlistAdminActionLabel({ waitlistStatus: "confirmed", betaInviteStatus: "none", inviteConfigured: true })).toBe("Einladen");
    expect(waitlistAdminActionLabel({ waitlistStatus: "confirmed", betaInviteStatus: "invited", inviteConfigured: true })).toBe("E-Mail erneut senden");
  });

  test("does not offer another invite after the beta invite is accepted", () => {
    expect(waitlistAdminActionLabel({ waitlistStatus: "confirmed", betaInviteStatus: "accepted", inviteConfigured: true })).toBeNull();
  });

  test("surfaces missing invite API configuration instead of showing a broken invite button", () => {
    expect(waitlistAdminActionLabel({ waitlistStatus: "confirmed", betaInviteStatus: "none", inviteConfigured: false })).toBe("Invite API fehlt");
  });
});

describe("waitlist admin row feedback", () => {
  test("explains the beta invite result on the affected row", () => {
    expect(rowSuccessMessage({
      entryEmail: "tester@example.test",
      invited: "tester@example.test",
      inviteMail: "sent",
    })).toContain("per E-Mail gesendet");
    expect(rowSuccessMessage({
      entryEmail: "tester@example.test",
      invited: "other@example.test",
      inviteMail: "sent",
    })).toBeNull();
  });

  test("maps resend success to the pending row", () => {
    expect(rowSuccessMessage({
      entryEmail: "pending@example.test",
      resent: "pending@example.test",
    })).toBe("Die Bestätigungs-E-Mail wurde erneut gesendet.");
  });

  test("shows row-scoped errors only for the affected address", () => {
    expect(rowErrorMessage({
      entryEmail: "pending@example.test",
      actionEmail: "pending@example.test",
      resendError: "resend-failed",
    })).toBe("Der Bestätigungslink konnte nicht erneut gesendet werden.");
    expect(rowErrorMessage({
      entryEmail: "other@example.test",
      actionEmail: "pending@example.test",
      resendError: "resend-failed",
    })).toBeNull();
  });
});
