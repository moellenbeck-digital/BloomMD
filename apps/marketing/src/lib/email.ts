import { publicAppUrl, publicMarketingUrl } from "./deployment";
import type { MarketingLocale } from "./locale";
import { WAITLIST_PURGE_RETENTION_DAYS } from "./waitlist-retention";

interface EmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function emailFrom() {
  return process.env.RESEND_FROM_EMAIL || "BloomMD <hello@bloommd.io>";
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

/**
 * The single, final mail to a confirmed waitlist address: the waitlist is over, registration is
 * open. It names when the address is deleted and carries the unsubscribe link, so the recipient can
 * leave without signing up. Sent only by `scripts/waitlist.ts invite --apply`.
 */
export async function sendWaitlistInvitationEmail(email: string, unsubscribeToken: string, locale: MarketingLocale = "de") {
  const signupBase = `${publicAppUrl()}/signup`;
  const unsubscribeBase = `${publicMarketingUrl()}/api/waitlist/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const days = WAITLIST_PURGE_RETENTION_DAYS;
  if (locale === "en") {
    const signupUrl = `${signupBase}?lang=en`;
    const unsubscribeUrl = `${unsubscribeBase}&lang=en`;
    return sendTransactionalEmail({
      to: email,
      subject: "BloomMD: the waitlist has ended - sign up now",
      text: `You joined the BloomMD waitlist. The waitlist has ended: sign-up is open now and you no longer need an invitation.\n\nSign up now:\n${signupUrl}\n\nThis is the only message we send about the waitlist. Your address is deleted ${days} days after this email.\n\nNot interested? Unsubscribe here:\n${unsubscribeUrl}`,
      html: `<p>You joined the BloomMD waitlist. The waitlist has ended: sign-up is open now and you no longer need an invitation.</p><p><a href="${signupUrl}">Sign up now</a></p><p>This is the only message we send about the waitlist. Your address is deleted ${days} days after this email.</p><p style="font-size:12px;color:#666">Not interested? <a href="${unsubscribeUrl}">Unsubscribe here</a>.</p>`,
    });
  }
  return sendTransactionalEmail({
    to: email,
    subject: "BloomMD: Die Warteliste ist beendet - jetzt registrieren",
    text: `Du hast dich auf die BloomMD-Warteliste eingetragen. Die Warteliste ist beendet: Die Registrierung ist jetzt offen, eine Einladung brauchst du nicht mehr.\n\nJetzt registrieren:\n${signupBase}\n\nDas ist die einzige Nachricht, die wir dir zur Warteliste schicken. Deine Adresse wird ${days} Tage nach dieser E-Mail gelöscht.\n\nKein Interesse? Hier abmelden:\n${unsubscribeBase}`,
    html: `<p>Du hast dich auf die BloomMD-Warteliste eingetragen. Die Warteliste ist beendet: Die Registrierung ist jetzt offen, eine Einladung brauchst du nicht mehr.</p><p><a href="${signupBase}">Jetzt registrieren</a></p><p>Das ist die einzige Nachricht, die wir dir zur Warteliste schicken. Deine Adresse wird ${days} Tage nach dieser E-Mail gelöscht.</p><p style="font-size:12px;color:#666">Kein Interesse? <a href="${unsubscribeBase}">Hier abmelden</a>.</p>`,
  });
}
