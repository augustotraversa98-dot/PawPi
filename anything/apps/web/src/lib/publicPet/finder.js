// What a finder leaves on the public tag page (name, phone, email, message), and the safe tel: / mailto: links.
// Shared by the page (before sending) and the API route (on receipt), so both accept exactly the same values.
// Leaf module: no React, no router, no DB.

export const FINDER_LIMITS = { name: 80, phone: 40, email: 254, message: 500 };

// Digits, spaces and the usual separators, with an optional leading +. 6 to 20 digits.
const PHONE_CHARS = /^\+?[0-9 ().-]+$/;
// Deliberately narrow: no spaces and none of ? & # % , ; : which could add recipients or headers to a mailto: link.
const EMAIL = /^[^\s@?&#%,;:<>()[\]\\"\/]+@[^\s@?&#%,;:<>()[\]\\"\/]+\.[^\s@?&#%,;:<>()[\]\\"\/]{2,}$/;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_BUT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g;

const text = (v) => (typeof v === "string" ? v : "");
const oneLine = (v) => text(v).replace(CONTROL, " ").replace(/\s+/g, " ").trim();

export function isValidPhone(value) {
  const v = oneLine(value);
  if (v.length > FINDER_LIMITS.phone || !PHONE_CHARS.test(v)) return false;
  const digits = v.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 20;
}

export function isValidEmail(value) {
  const v = oneLine(value);
  return v.length <= FINDER_LIMITS.email && EMAIL.test(v);
}

/** tel: link for a stored phone number, or null when there are not enough digits to dial. */
export function telHref(value) {
  const v = oneLine(value);
  const digits = v.replace(/\D/g, "");
  if (digits.length < 3) return null;
  return `tel:${v.startsWith("+") ? "+" : ""}${digits}`;
}

/** mailto: link for a stored address, or null when it is not a plain address. */
export function mailtoHref(value) {
  const v = oneLine(value);
  return isValidEmail(v) ? `mailto:${v}` : null;
}

/** Cleaned and length-bounded fields. Phone / email are NOT cut: an over-long one is invalid. */
export function cleanFinderFields(input) {
  return {
    name: oneLine(input?.name).slice(0, FINDER_LIMITS.name).trim(),
    phone: oneLine(input?.phone),
    email: oneLine(input?.email),
    message: text(input?.message)
      .replace(/\r\n?/g, "\n")
      .replace(CONTROL_BUT_NEWLINE, " ")
      .slice(0, FINDER_LIMITS.message)
      .trim(),
  };
}

/** First problem with the contact details, or null. At least one of phone / email is required. */
export function finderContactError({ phone, email }) {
  if (!phone && !email) return "contact_required";
  if (phone && !isValidPhone(phone)) return "invalid_phone";
  if (email && !isValidEmail(email)) return "invalid_email";
  return null;
}

/**
 * The request body of POST .../contact. A body with no finder* key comes from an older page, which only sends
 * `message`: it is accepted as before. A body with any of them must carry a valid phone or email.
 * @returns {{ fields: object, error: string|null }}
 */
export function parseFinderSubmission(body) {
  const fields = cleanFinderFields({
    name: body?.finderName,
    phone: body?.finderPhone,
    email: body?.finderEmail,
    message: body?.message,
  });
  const current = ["finderName", "finderPhone", "finderEmail"].some(
    (k) => body != null && typeof body === "object" && k in body,
  );
  return { fields, error: current ? finderContactError(fields) : null };
}

/** Plain-text version, contact first: the push banner, and the old database function (500 characters of text). */
export function composeFinderText({ name, phone, email, message }) {
  return [name, phone && `Tel: ${phone}`, email && `Email: ${email}`, message].filter(Boolean).join("\n");
}
