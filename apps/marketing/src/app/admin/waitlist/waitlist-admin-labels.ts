import type { BetaInviteStatus } from "../../../lib/beta-invite-client";
import type { MarketingLocale } from "../../../lib/locale";
import type { WaitlistAdminEntry } from "../../../lib/waitlist-db";

export function waitlistAdminActionLabel(input: { waitlistStatus: WaitlistAdminEntry["status"]; betaInviteStatus: BetaInviteStatus; inviteConfigured: boolean; locale?: MarketingLocale }) {
  const en = input.locale === "en";
  if (input.waitlistStatus === "pending") return en ? "Resend confirmation" : "Bestätigung erneut senden";
  if (input.waitlistStatus === "unsubscribed") return en ? "Delete" : "Löschen";
  if (!input.inviteConfigured) return en ? "Invite API missing" : "Invite API fehlt";
  if (input.betaInviteStatus === "none" || input.betaInviteStatus === "expired" || input.betaInviteStatus === "revoked") return en ? "Invite" : "Einladen";
  if (input.betaInviteStatus === "invited") return en ? "Resend email" : "E-Mail erneut senden";
  return null;
}

export function inviteMessage(error: string | undefined, locale: MarketingLocale = "de") {
  const en = locale === "en";
  switch (error) {
    case "invite-api-not-configured": return en ? "The internal app invitation is not configured yet." : "Die interne App-Einladung ist noch nicht konfiguriert.";
    case "not-confirmed": return en ? "Only confirmed waitlist entries can be invited." : "Nur bestätigte Waitlist-Einträge können eingeladen werden.";
    case "invite-server-error":
    case "invite-failed": return en ? "The invitation could not be created because of a server error. The table is unchanged." : "Die Einladung konnte wegen eines Serverfehlers nicht erstellt werden. Die Tabelle bleibt unverändert.";
    case "waitlist-not-configured": return en ? "The waitlist database is not configured." : "Die Waitlist-Datenbank ist nicht konfiguriert.";
    case "missing-email": return en ? "The invitation is missing an email address." : "Für die Einladung fehlt die E-Mail-Adresse.";
    case "invalid-email": return en ? "The email address is invalid. Check it and try again." : "Die E-Mail-Adresse ist ungültig. Prüfe die Adresse und versuche es erneut.";
    case "invalid-mode": return en ? "The invitation action is invalid. Reload the admin page and try again." : "Die Einladungsaktion ist ungültig. Lade die Admin-Seite neu und versuche es erneut.";
    case "invalid-origin": return en ? "The invitation was rejected for security reasons. Open the admin page again." : "Die Einladung wurde aus Sicherheitsgründen abgelehnt. Bitte öffne die Admin-Seite neu.";
    case "admin-session": return en ? "Your admin session expired or is invalid. Authenticate again and reload the page." : "Deine Admin-Sitzung ist abgelaufen oder nicht gültig. Authentifiziere dich neu und lade die Seite erneut.";
    case "request-blocked": return en ? "The browser could not complete the action. Reload the admin page and try again." : "Der Browser konnte die Aktion nicht abschließen. Bitte lade die Admin-Seite neu und versuche es erneut.";
    default: return null;
  }
}

export function actionMessage(kind: "resend" | "delete", error: string | undefined, locale: MarketingLocale = "de") {
  const en = locale === "en";
  const fallback = en ? `The ${kind === "resend" ? "resend" : "delete"} action could not be completed.` : `Die ${kind === "resend" ? "Resend" : "Lösch"}-Aktion konnte nicht ausgeführt werden.`;
  switch (error) {
    case "invalid-origin": return en ? "The action was rejected for security reasons. Open the admin page again." : "Die Aktion wurde aus Sicherheitsgründen abgelehnt. Bitte öffne die Admin-Seite neu.";
    case "request-blocked": return en ? "The action was blocked by the browser or network. Reload the admin page and try again." : "Die Aktion wurde vom Browser oder Netzwerk blockiert. Bitte lade die Admin-Seite neu und versuche es erneut.";
    case "waitlist-not-configured": return en ? "The waitlist database is not configured." : "Die Waitlist-Datenbank ist nicht konfiguriert.";
    case "missing-email": return en ? "The action is missing an email address." : "Für die Aktion fehlt die E-Mail-Adresse.";
    case "invalid-email": return en ? "The email address is invalid. Check it and try again." : "Die E-Mail-Adresse ist ungültig. Prüfe die Adresse und versuche es erneut.";
    case "admin-session": return en ? "Your admin session expired or is invalid. Authenticate again and reload the page." : "Deine Admin-Sitzung ist abgelaufen oder nicht gültig. Authentifiziere dich neu und lade die Seite erneut.";
    case "not-pending": return en ? "Only pending waitlist entries can receive another confirmation email." : "Nur offene Waitlist-Einträge können erneut bestätigt werden.";
    case "not-found": return en ? "The waitlist entry was not found. It may already have been deleted." : "Der Waitlist-Eintrag wurde nicht gefunden. Er wurde möglicherweise bereits gelöscht.";
    case "missing-confirmation": return en ? "Deletion confirmation is missing." : "Die Löschbestätigung fehlt.";
    case "resend-failed": return en ? "The confirmation link could not be sent again." : "Der Bestätigungslink konnte nicht erneut gesendet werden.";
    case "email-send-failed": return en ? "The new confirmation link was saved, but the email could not be sent." : "Der neue Bestätigungslink wurde gespeichert, aber die E-Mail konnte nicht versendet werden.";
    case "server-error": return en ? "The action could not be completed because of a server error. Try again." : "Die Aktion konnte wegen eines Serverfehlers nicht abgeschlossen werden. Bitte versuche es erneut.";
    case "delete-failed": return en ? "The entry could not be deleted." : "Der Eintrag konnte nicht gelöscht werden.";
    default: return error ? fallback : null;
  }
}

export function rowSuccessMessage(input: { entryEmail: string; invited?: string; inviteMail?: string; resent?: string; locale?: MarketingLocale }) {
  const en = input.locale === "en";
  const email = input.entryEmail.toLowerCase();
  if (input.invited?.toLowerCase() === email) {
    const mailMessage = input.inviteMail === "sent" ? (en ? "The beta invitation was sent by email." : "Die Beta-Einladung wurde per E-Mail gesendet.") : input.inviteMail === "already-invited" ? (en ? "Beta access was already active." : "Der Beta-Zugang war bereits aktiv.") : input.inviteMail === "not-configured" || input.inviteMail === "provider-error" ? (en ? "Beta access is active. Use the signup link if no email arrived." : "Der Beta-Zugang ist aktiv. Nutze den Signup-Link als Fallback, falls keine Mail angekommen ist.") : (en ? "Beta access is active." : "Der Beta-Zugang ist aktiv.");
    return `${mailMessage} ${en ? "The user creates an account and password afterwards." : "Der Nutzer erstellt danach Account und Passwort."}`;
  }
  if (input.resent?.toLowerCase() === email) return en ? "The confirmation email was sent again." : "Die Bestätigungs-E-Mail wurde erneut gesendet.";
  return null;
}

export function rowErrorMessage(input: { entryEmail: string; actionEmail?: string; inviteError?: string; adminError?: string; resendError?: string; deleteError?: string; locale?: MarketingLocale }) {
  if (input.actionEmail?.toLowerCase() !== input.entryEmail.toLowerCase()) return null;
  return inviteMessage(input.inviteError, input.locale) ?? inviteMessage(input.adminError, input.locale) ?? actionMessage("resend", input.resendError, input.locale) ?? actionMessage("delete", input.deleteError, input.locale);
}
