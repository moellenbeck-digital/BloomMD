import { publicMarketingUrl } from "./deployment";
import type { MarketingLocale } from "./locale";

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
 * Confirmation for a waitlist signup.
 *
 * Carries the unsubscribe link in the same message. Somebody who did not sign up should be able to
 * remove the address without confirming it first — asking them to click "confirm" in order to be
 * left alone would be exactly backwards.
 */
export async function sendWaitlistConfirmationEmail(email: string, token: string, locale: MarketingLocale = "de") {
  const linkBase = publicMarketingUrl();
  const confirmUrl = `${linkBase}/api/waitlist/confirm?token=${encodeURIComponent(token)}`;
  const unsubscribeUrl = `${linkBase}/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`;
  if (locale === "en") {
    return sendTransactionalEmail({
      to: email,
      subject: "Confirm your BloomMD waitlist signup",
      text: `Please confirm that you want to join the BloomMD waitlist:\n\n${confirmUrl}&lang=en\n\nWe will only contact you when a beta seat opens.\n\nDid not request this? Unsubscribe without confirming:\n${unsubscribeUrl}&lang=en`,
      html: `<p>Please confirm that you want to join the BloomMD waitlist:</p><p><a href="${confirmUrl}&lang=en">Confirm waitlist signup</a></p><p>We will only contact you when a beta seat opens.</p><p style="font-size:12px;color:#666">Did not request this? <a href="${unsubscribeUrl}&lang=en">Unsubscribe here</a> without confirming.</p>`,
    });
  }
  return sendTransactionalEmail({
    to: email,
    subject: "BloomMD Warteliste bestätigen",
    text: `Bitte bestätige, dass du auf die BloomMD Warteliste möchtest:\n\n${confirmUrl}\n\nDu bekommst eine Nachricht, sobald ein Platz frei wird — sonst nichts.\n\nNicht angefordert? Dann trage dich hier aus, ohne etwas zu bestätigen:\n${unsubscribeUrl}`,
    html: `<p>Bitte bestätige, dass du auf die BloomMD Warteliste möchtest:</p><p><a href="${confirmUrl}">Warteliste bestätigen</a></p><p>Du bekommst eine Nachricht, sobald ein Platz frei wird — sonst nichts.</p><p style="font-size:12px;color:#666">Nicht angefordert? Dann <a href="${unsubscribeUrl}">hier austragen</a>, ohne etwas zu bestätigen.</p>`,
  });
}
