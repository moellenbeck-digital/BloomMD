import { appendFile } from "node:fs/promises";
import { getSiteUrl } from "./billing";
import { isE2ETestModeEnabled } from "./e2e-mode";
import { publicAppUrl } from "./deployment";
import { formatAuthDate, roleLabel, type AuthLocale } from "./auth-copy";
import { serializeAuthParams } from "./invite-intent";
import { WAITLIST_ACTIVATION_TTL_DAYS, WAITLIST_UNACTIVATED_RETENTION_DAYS } from "./waitlist-transfer-constants";

/**
 * Where an account mail should point.
 *
 * Verification and password links belong to the app, not the marketing site — a confirmation link
 * to bloommd.io would land on a host that does not serve `/api/auth`.
 */
function accountLinkBase() {
  return publicAppUrl() || getSiteUrl();
}

interface EmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function emailFrom() {
  return process.env.RESEND_FROM_EMAIL || "BloomMD Accounts <account@bloommd.app>";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

/**
 * E2E only: with the test marker set, mails are appended to this file instead of being sent, so
 * the browser suite can follow confirmation and reset links without a mail provider. Ignored
 * without `BLOOMMD_E2E_TEST_MODE=1` (in a production build also without `BLOOMMD_LOCAL_DEPLOYMENT=1`), and
 * `release:check` rejects these variables in production.
 */
function e2eMailOutboxPath() {
  if (!isE2ETestModeEnabled()) return null;
  return process.env.BLOOMMD_E2E_MAIL_OUTBOX?.trim() || null;
}

export async function sendTransactionalEmail(input: EmailInput) {
  const outbox = e2eMailOutboxPath();
  if (outbox) {
    await appendFile(outbox, `${JSON.stringify({ to: input.to, subject: input.subject, text: input.text })}\n`);
    return { sent: true as const };
  }

  if (!isEmailConfigured()) {
    if (process.env.BLOOMMD_LOG_DEV_EMAILS === "1" && process.env.NODE_ENV !== "production") {
      console.log("[BloomMD] Email not configured. Dev email:", input);
    } else {
      console.warn("[BloomMD] Transactional email skipped because no provider is configured.");
    }
    return { sent: false, reason: "not-configured" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    console.error("[BloomMD] Resend email failed with status:", response.status);
    return { sent: false, reason: "provider-error" as const };
  }

  return { sent: true as const };
}

export async function sendVerificationEmail(email: string, token: string, options?: { invite?: string; lang?: AuthLocale }) {
  const verificationParams = new URLSearchParams({ token });
  if (options?.invite) verificationParams.set("invite", options.invite);
  if (options?.lang) verificationParams.set("lang", options.lang);
  const url = `${accountLinkBase()}/api/auth/verify-email?${serializeAuthParams(verificationParams)}`;
  const locale = options?.lang ?? "de";
  const copy = locale === "en"
    ? {
        subject: "Confirm your BloomMD email",
        intro: "Please confirm your BloomMD email address:",
        link: "Confirm email",
        footer: "If you did not create a BloomMD account, you can ignore this message.",
      }
    : {
        subject: "BloomMD E-Mail bestätigen",
        intro: "Bitte bestätige deine BloomMD E-Mail-Adresse:",
        link: "E-Mail bestätigen",
        footer: "Wenn du keinen BloomMD Account erstellt hast, kannst du diese Nachricht ignorieren.",
      };
  return sendTransactionalEmail({
    to: email,
    subject: copy.subject,
    text: `${copy.intro}\n\n${url}\n\n${copy.footer}`,
    html: `<p>${copy.intro}</p><p><a href="${url}">${copy.link}</a></p><p>${copy.footer}</p>`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string, options?: { invite?: string; lang?: AuthLocale }) {
  const resetParams = new URLSearchParams({ token });
  if (options?.invite) resetParams.set("invite", options.invite);
  if (options?.lang) resetParams.set("lang", options.lang);
  const url = `${accountLinkBase()}/reset-password?${serializeAuthParams(resetParams)}`;
  const copy = options?.lang === "en"
    ? {
        subject: "Reset your BloomMD password",
        intro: "You can reset your BloomMD password with this link:",
        link: "Reset password",
        footer: "The link expires automatically. If you did not request this, you can ignore this message.",
      }
    : {
        subject: "BloomMD Passwort zurücksetzen",
        intro: "Du kannst dein BloomMD Passwort über diesen Link zurücksetzen:",
        link: "Passwort zurücksetzen",
        footer: "Der Link läuft automatisch ab. Wenn du das nicht angefordert hast, kannst du diese Nachricht ignorieren.",
      };
  return sendTransactionalEmail({
    to: email,
    subject: copy.subject,
    text: `${copy.intro}\n\n${url}\n\n${copy.footer}`,
    html: `<p>${copy.intro}</p><p><a href="${url}">${copy.link}</a></p><p>${copy.footer}</p>`,
  });
}

/**
 * One-time mail of the waitlist transfer (#105): the account is prepared but inactive, and this link
 * is the only way to activate it. The page behind it asks for a password and the consent; opening
 * the link changes nothing.
 */
export async function sendWaitlistActivationEmail(email: string, token: string, options?: { lang?: AuthLocale }) {
  const locale = options?.lang ?? "de";
  const urlParams = new URLSearchParams({ token });
  if (locale === "en") urlParams.set("lang", locale);
  const url = `${accountLinkBase()}/activate?${serializeAuthParams(urlParams)}`;
  const ttl = WAITLIST_ACTIVATION_TTL_DAYS;
  const retention = WAITLIST_UNACTIVATED_RETENTION_DAYS;
  const copy = locale === "en"
    ? {
        subject: "BloomMD: your account is ready - activate it now",
        intro: "You joined the BloomMD waitlist. The waitlist has ended, and we have prepared a BloomMD account for this email address. It is not active yet: nobody can sign in to it until you confirm.",
        action: "Activate your account: confirm the address, choose a password and agree to the privacy policy and the terms.",
        link: "Activate account",
        footer: `The link works once and for ${ttl} days. This is the only message we send you about this. If you do not want an account, ignore this message: the prepared account and your waitlist entry are deleted ${retention} days after this email.`,
      }
    : {
        subject: "BloomMD: Dein Account ist vorbereitet - jetzt aktivieren",
        intro: "Du hast dich auf die BloomMD-Warteliste eingetragen. Die Warteliste ist beendet, und wir haben für diese E-Mail-Adresse einen BloomMD-Account vorbereitet. Er ist noch nicht aktiv: Ohne deine Bestätigung kann sich niemand dort anmelden.",
        action: "Account aktivieren: Adresse bestätigen, Passwort wählen und der Datenschutzerklärung und den AGB zustimmen.",
        link: "Account aktivieren",
        footer: `Der Link funktioniert einmal und ${ttl} Tage lang. Das ist die einzige Nachricht, die wir dir dazu schicken. Wenn du keinen Account möchtest, ignoriere diese Nachricht: Der vorbereitete Account und dein Wartelisten-Eintrag werden ${retention} Tage nach dieser E-Mail gelöscht.`,
      };
  return sendTransactionalEmail({
    to: email,
    subject: copy.subject,
    text: `${copy.intro}\n\n${copy.action}\n${url}\n\n${copy.footer}`,
    html: `<p>${copy.intro}</p><p>${copy.action}</p><p><a href="${url}">${copy.link}</a></p><p>${copy.footer}</p>`,
  });
}

/**
 * Reminder that the free trial ends (#274), sent after 15 and after 23 days. `daysLeft` and
 * `endsAt` come from the trial calculation (`trial.ts`); the date is shown in UTC so it does not
 * depend on the server's time zone.
 */
export async function sendTrialReminderEmail(email: string, options: { lang?: AuthLocale; daysLeft: number; endsAt: Date | string }) {
  const locale = options.lang ?? "de";
  const url = accountLinkBase();
  const endDate = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "de-DE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(options.endsAt));
  const days = options.daysLeft;
  const copy = locale === "en"
    ? {
        subject: `Your BloomMD trial ends in ${days} ${days === 1 ? "day" : "days"}`,
        intro: `Your free BloomMD trial account ends on ${endDate} (${days} ${days === 1 ? "day" : "days"} left).`,
        after: "After that, your account is read-only and export remains possible. Nothing is deleted.",
        link: "Open BloomMD",
        footer: "This is a reminder about your account. We send it once per reminder; nothing else follows from it.",
      }
    : {
        subject: `Dein BloomMD-Testzeitraum endet in ${days} ${days === 1 ? "Tag" : "Tagen"}`,
        intro: `Dein kostenloser BloomMD-Testaccount endet am ${endDate} (noch ${days} ${days === 1 ? "Tag" : "Tage"}).`,
        after: "Danach ist dein Konto nur noch lesbar, der Export bleibt möglich. Es wird nichts gelöscht.",
        link: "BloomMD öffnen",
        footer: "Das ist eine Erinnerung zu deinem Konto. Wir senden sie je Hinweis einmal; weitere Folgen hat sie nicht.",
      };
  return sendTransactionalEmail({
    to: email,
    subject: copy.subject,
    text: `${copy.intro}\n\n${copy.after}\n\n${url}\n\n${copy.footer}`,
    html: `<p>${escapeHtml(copy.intro)}</p><p>${escapeHtml(copy.after)}</p><p><a href="${url}">${copy.link}</a></p><p>${escapeHtml(copy.footer)}</p>`,
  });
}

export async function sendBetaInviteEmail(email: string, options?: { lang?: AuthLocale }) {
  const locale = options?.lang ?? "de";
  const urlParams = new URLSearchParams({ email, next: "/app" });
  if (locale === "en") urlParams.set("lang", locale);
  const url = `${accountLinkBase()}/signup?${urlParams.toString()}`;
  const copy = locale === "en"
    ? {
        subject: "Your free BloomMD trial account",
        intro: "Your free BloomMD trial account is enabled for you. It is valid for 30 days from email confirmation.",
        linkIntro: "This link takes you directly to the right page: create your account.",
        htmlLinkIntro: "This link takes you directly to the right page: <strong>create your account</strong>.",
        link: "Create your BloomMD account",
        instructions: "Use this email address there and set your own password. Then confirm your email address. No access code is needed.",
        footer: "If you were not expecting this message, you can ignore it.",
      }
    : {
        subject: "Dein kostenloser BloomMD-Testaccount",
        intro: "Dein kostenloser BloomMD-Testaccount ist für dich freigeschaltet. Er gilt 30 Tage ab E-Mail-Bestätigung.",
        linkIntro: "Dieser Link führt dich direkt zur richtigen Seite: Account erstellen.",
        htmlLinkIntro: "Dieser Link führt dich direkt zur richtigen Seite: <strong>Account erstellen</strong>.",
        link: "BloomMD Account erstellen",
        instructions: "Nutze dort diese E-Mail-Adresse und lege dein eigenes Passwort fest. Danach bestätigst du deine E-Mail-Adresse. Der Link braucht keinen Zugangscode.",
        footer: "Wenn du diese Nachricht nicht erwartet hast, kannst du sie ignorieren.",
      };
  return sendTransactionalEmail({
    to: email,
    subject: copy.subject,
    text: `${copy.intro}\n\n${copy.linkIntro}\n\n${url}\n\n${copy.instructions}\n\n${copy.footer}`,
    html: `<p>${copy.intro}</p><p>${copy.htmlLinkIntro}</p><p><a href="${url}">${copy.link}</a></p><p>${copy.instructions}</p><p>${copy.footer}</p>`,
  });
}

export async function sendWorkspaceInvitationEmail(input: {
  email: string;
  workspaceName: string;
  role: "editor" | "viewer";
  token: string;
  expiresAt?: string;
  inviterName?: string | null;
  inviterEmail?: string;
  locale?: AuthLocale;
}) {
  const locale = input.locale ?? "de";
  const urlParams = new URLSearchParams();
  if (locale === "en") urlParams.set("lang", locale);
  const serializedUrlParams = serializeAuthParams(urlParams);
  const url = `${accountLinkBase()}/invite/${encodeURIComponent(input.token)}${serializedUrlParams ? `?${serializedUrlParams}` : ""}`;
  const roleText = roleLabel(input.role, locale);
  const inviter = input.inviterName?.trim() || input.inviterEmail || "BloomMD";
  const expiration = input.expiresAt ? formatAuthDate(input.expiresAt, locale) : null;
  const safeRoleLabel = escapeHtml(roleText);
  const safeEmail = escapeHtml(input.email);
  const safeExpiration = expiration ? escapeHtml(expiration) : null;
  const copy = locale === "en"
    ? {
        subject: `Invitation to the BloomMD workspace “${input.workspaceName}”`,
        intro: `${inviter} invited you to the BloomMD workspace “${input.workspaceName}”.`,
        role: "Your role",
        invitedEmail: "Invited email",
        expires: "Expires",
        action: "Review invitation",
        footer: "The invitation can only be used once and expires automatically. If you were not expecting it, you can ignore this message.",
      }
    : {
        subject: `Einladung zum BloomMD-Workspace „${input.workspaceName}“`,
        intro: `${inviter} lädt dich zum BloomMD-Workspace „${input.workspaceName}“ ein.`,
        role: "Deine Rolle",
        invitedEmail: "Eingeladene E-Mail",
        expires: "Läuft ab",
        action: "Einladung prüfen",
        footer: "Die Einladung kann nur einmal verwendet werden und läuft automatisch ab. Wenn du sie nicht erwartest, kannst du sie ignorieren.",
      };
  const details = [
    `${copy.role}: ${roleText}`,
    `${copy.invitedEmail}: ${input.email}`,
    expiration ? `${copy.expires}: ${expiration}` : null,
  ].filter((line): line is string => Boolean(line));
  const htmlDetails = [
    `<li><strong>${copy.role}:</strong> ${safeRoleLabel}</li>`,
    `<li><strong>${copy.invitedEmail}:</strong> ${safeEmail}</li>`,
    safeExpiration ? `<li><strong>${copy.expires}:</strong> ${safeExpiration}</li>` : null,
  ].filter((line): line is string => Boolean(line));
  return sendTransactionalEmail({
    to: input.email,
    subject: copy.subject,
    text: `${copy.intro}\n\n${details.join("\n")}\n\n${copy.action}: ${url}\n\n${copy.footer}`,
    html: `<p>${escapeHtml(copy.intro)}</p><ul>${htmlDetails.join("")}</ul><p><a href="${url}">${copy.action}</a></p><p>${copy.footer}</p>`,
  });
}
