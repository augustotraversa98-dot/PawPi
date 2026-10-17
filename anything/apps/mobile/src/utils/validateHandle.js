// Pet @handle rules (Ticket 2.35; night run #2 PR B). Pure + dependency-free so onboarding and
// profile edit can gate "Continue"/"Save" on the same logic the input enforces, and so it is
// unit-testable without rendering a heavy screen.
//
// MIRROR of the server rules in `web/src/app/api/utils/petHandle.js`. Both test suites run the same
// HANDLE_PARITY_CASES table; change one, change the other. Uniqueness is NOT decided here — only the
// server knows (see hooks/useHandleAvailability).

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

// Words nobody may claim (staff/product impersonation, routing words). Keep identical to the server.
export const RESERVED_HANDLES = [
  "pawpi",
  "pawpiapp",
  "admin",
  "administrator",
  "moderator",
  "mod",
  "staff",
  "team",
  "support",
  "help",
  "official",
  "security",
  "billing",
  "privacy",
  "terms",
  "legal",
  "about",
  "contact",
  "settings",
  "login",
  "logout",
  "signup",
  "register",
  "search",
  "explore",
  "discover",
  "notifications",
  "messages",
  "feed",
  "home",
  "api",
  "www",
  "root",
  "system",
  "null",
  "undefined",
  "anonymous",
  "deleted",
  "everyone",
  "all",
  "me",
  "you",
  "vet",
  "vets",
];

// Lowercase the input and strip a leading @ / surrounding space. The allowed
// character set is lowercase alphanumerics, underscore and dot.
export function normalizeHandle(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/^@+/, "")
    .trim();
}

// Machine-readable reason a handle is not acceptable, or "" when its FORMAT is fine:
// empty | too_short | too_long | invalid_chars | reserved. The UI maps the code to EN/ES copy
// (onboarding.handleReason.<code>).
export function handleFormatCode(raw) {
  const h = normalizeHandle(raw);
  if (h.length === 0) return "empty";
  if (h.length < HANDLE_MIN_LENGTH) return "too_short";
  if (h.length > HANDLE_MAX_LENGTH) return "too_long";
  // Must start with a letter or number, then letters/numbers/_/.
  if (!/^[a-z0-9][a-z0-9_.]*$/.test(h)) return "invalid_chars";
  if (RESERVED_HANDLES.includes(h)) return "reserved";
  return "";
}

// Back-compat name: "" when the format is valid, else the reason code (truthy).
export function validateHandleFormat(raw) {
  return handleFormatCode(raw);
}

export function isHandleAcceptable(raw) {
  return handleFormatCode(raw) === "";
}

// What the typing field keeps: lowercase letters, numbers, underscore, dot.
export function sanitizeHandleInput(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "");
}
