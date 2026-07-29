// email — the vendor-agnostic TRANSACTIONAL EMAIL seam.
//
// The single function routes call: sendEmail({ to, subject, text, html }) → { sent, reason }.
// It NEVER throws and NEVER rejects. An email failure must not turn a working user action into a
// 500 — the password-reset route in particular has to answer identically whether or not a message
// went out (see its comment on response-uniformity).
//
// Degrade-clean contract (the VIDEO_API_KEY / CRON_SECRET pattern in this repo):
//   • EMAIL_API_KEY unset          → { sent: false, reason: 'not_configured' } and the intended
//                                    send is LOGGED server-side (recipient + subject only, never
//                                    the body, which can contain a reset token).
//   • vendor rejects / network dies → { sent: false, reason: 'send_failed' }, logged, no throw.
//   • sent                          → { sent: true, id }.
//
// Adding a vendor = one more branch below. Routes never learn which vendor is in use.

import { emailConfig } from "./config";

/**
 * Resend adapter: one authenticated JSON POST. https://resend.com/docs/api-reference/emails
 * Returns the vendor message id on success.
 */
async function sendViaResend(cfg, { to, subject, text, html }) {
  const res = await fetch(`${cfg.baseUrl}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [to],
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
    }),
  });

  if (!res.ok) {
    // Read the vendor's error text for the server log; it never reaches the client.
    const detail = await res.text().catch(() => "");
    throw new Error(`resend ${res.status}: ${detail.slice(0, 200)}`);
  }

  const body = await res.json().catch(() => ({}));
  return body?.id ?? null;
}

/**
 * Send one transactional email.
 *
 * @param {{ to: string, subject: string, text?: string, html?: string }} message
 * @returns {Promise<{ sent: boolean, reason?: string, id?: string|null }>} never rejects
 */
export async function sendEmail({ to, subject, text, html }) {
  const cfg = emailConfig();

  if (!cfg) {
    // Not set up yet. Log the INTENT so the flow is still traceable in the server log during
    // pre-go-live testing — subject + recipient only. The body is deliberately omitted because a
    // reset email contains a single-use token, and logs are not a secret store.
    console.log(
      `[email] EMAIL_API_KEY not set — skipping send to ${to} (subject: "${subject}")`,
    );
    return { sent: false, reason: "not_configured" };
  }

  try {
    if (cfg.provider !== "resend") {
      console.error(`[email] unknown EMAIL_PROVIDER "${cfg.provider}" — not sending`);
      return { sent: false, reason: "unknown_provider" };
    }
    const id = await sendViaResend(cfg, { to, subject, text, html });
    return { sent: true, id };
  } catch (error) {
    console.error("[email] send failed:", error?.message);
    return { sent: false, reason: "send_failed" };
  }
}

export { emailConfig } from "./config";
