import crypto from "node:crypto";

// Signed one-click unsubscribe links for PawPi's promotional emails (notifications v2, PR 3a).
//
// WHY SIGNED TOKENS: the link is clicked from an inbox, with no session. The token binds
// {user_profiles.id, category} to an HMAC so the link cannot be forged or edited to unsubscribe someone else.
// It never expires on purpose (an old email's unsubscribe link must keep working).
//
// KEY: NOTIF_UNSUBSCRIBE_SECRET, falling back to AUTH_SECRET (always set in production). With neither set no
// link can be made, and the senders then DO NOT EMAIL: no email without a working unsubscribe link.
//
// The payload holds only the numeric profile id + the category name — no email address, no PII.

const CATEGORIES = new Set(["winback_email"]);

function key() {
  const k = process.env.NOTIF_UNSUBSCRIBE_SECRET || process.env.AUTH_SECRET;
  return typeof k === "string" && k.length >= 8 ? k : null;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function sign(payloadB64, k) {
  return crypto.createHmac("sha256", k).update(`unsub:${payloadB64}`).digest("base64url");
}

/** Token for (userId, category), or null when no signing key is configured / the input is unusable. */
export function makeUnsubscribeToken(userId, category) {
  const k = key();
  if (!k || !Number.isInteger(userId) || userId <= 0 || !CATEGORIES.has(category)) return null;
  const payload = b64url(JSON.stringify({ u: userId, c: category }));
  return `${payload}.${sign(payload, k)}`;
}

/** {userId, category} for a valid token, else null. Constant-time signature compare. */
export function verifyUnsubscribeToken(token) {
  try {
    const k = key();
    if (!k || typeof token !== "string" || token.length > 512) return null;
    const [payload, sig, extra] = token.split(".");
    if (!payload || !sig || extra !== undefined) return null;
    const expected = sign(payload, k);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const { u, c } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isInteger(u) || u <= 0 || !CATEGORIES.has(c)) return null;
    return { userId: u, category: c };
  } catch {
    return null;
  }
}

/** Absolute unsubscribe URL for (userId, category), or null when it cannot be signed. */
export function buildUnsubscribeUrl(userId, category, baseUrl = publicBaseUrl()) {
  const token = makeUnsubscribeToken(userId, category);
  if (!token) return null;
  return `${baseUrl}/api/notification-prefs/email-unsubscribe?t=${encodeURIComponent(token)}`;
}

export function publicBaseUrl() {
  const fromEnv = process.env.PUBLIC_BASE_URL || process.env.AUTH_URL;
  if (typeof fromEnv === "string" && /^https?:\/\//.test(fromEnv)) return fromEnv.replace(/\/+$/, "");
  return "https://www.pawpi.info";
}

const FOOTER = {
  en: (url) => `\n\n—\nYou are receiving this because you chose come-back emails in PawPi. Stop them any time: ${url}`,
  es: (url) => `\n\n—\nRecibís este mail porque activaste los recordatorios por email de PawPi. Podés dejar de recibirlos cuando quieras: ${url}`,
};

/** Plain-text footer with the unsubscribe link, in the recipient's language ('en' | 'es'). */
export function unsubscribeFooter(locale, url) {
  return (locale === "en" ? FOOTER.en : FOOTER.es)(url);
}
