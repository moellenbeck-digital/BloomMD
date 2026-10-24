import { getSiteUrl } from "./billing";
import { publicAppUrl } from "./deployment";
import { formatAuthDate, roleLabel, type AuthLocale } from "./auth-copy";
import { serializeAuthParams } from "./invite-intent";

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

export async function sendTransactionalEmail(input: EmailInput) {
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

export async function sendBetaInviteEmail(email: string, options?: { lang?: AuthLocale }) {
  const locale = options?.lang ?? "de";
  const urlParams = new URLSearchParams({ email, next: "/app" });
  if (locale === "en") urlParams.set("lang", locale);
  const url = `${accountLinkBase()}/signup?${urlParams.toString()}`;
  const copy = locale === "en"
    ? {
        subject: "Your BloomMD beta invitation",
        intro: "You are invited to the closed BloomMD beta.",
        linkIntro: "This link takes you directly to the right page: create your account.",
        htmlLinkIntro: "This link takes you directly to the right page: <strong>create your account</strong>.",
        link: "Create your BloomMD account",
        instructions: "Use this invited email address there and set your own password. Then confirm your email address. No invitation code is needed.",
        footer: "If you were not expecting this invitation, you can ignore this message.",
      }
    : {
        subject: "Dein BloomMD Beta-Zugang",
        intro: "Du bist zur geschlossenen BloomMD Beta eingeladen.",
        linkIntro: "Dieser Link führt dich direkt zur richtigen Seite: Account erstellen.",
        htmlLinkIntro: "Dieser Link führt dich direkt zur richtigen Seite: <strong>Account erstellen</strong>.",
        link: "BloomMD Account erstellen",
        instructions: "Nutze dort diese eingeladene E-Mail-Adresse und lege dein eigenes Passwort fest. Danach bestätigst du deine E-Mail-Adresse. Der Link braucht keinen Einladungscode.",
        footer: "Wenn du diese Einladung nicht erwartet hast, kannst du diese Nachricht ignorieren.",
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
