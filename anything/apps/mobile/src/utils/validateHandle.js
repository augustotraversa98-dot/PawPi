// Pet @handle rules (Ticket 2.35). Pure + dependency-free so onboarding can gate
// "Continue" on the same logic the input enforces, and so it's unit-testable
// without rendering the heavy onboarding screen.

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

// Until a real availability endpoint exists, a small mock list of taken handles
// keeps the uniqueness UX honest. Replace with an API check when one ships.
export const TAKEN_HANDLES = [
  "buddy",
  "max",
  "charlie",
  "cooper",
  "lucy",
  "daisy",
  "duke",
  "molly",
];

// Lowercase the input and strip a leading @ / surrounding space. The allowed
// character set is lowercase alphanumerics, underscore and dot.
export function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/^@+/, "")
    .trim();
}

// Returns "" when the format is valid, else a human-readable reason.
export function validateHandleFormat(raw) {
  const h = normalizeHandle(raw);
  if (h.length === 0) return "Pick a handle";
  if (h.length < HANDLE_MIN_LENGTH)
    return `Handle must be at least ${HANDLE_MIN_LENGTH} characters`;
  if (h.length > HANDLE_MAX_LENGTH)
    return `Handle must be ${HANDLE_MAX_LENGTH} characters or fewer`;
  // Must start with a letter or number, then letters/numbers/_/.
  if (!/^[a-z0-9][a-z0-9_.]*$/.test(h))
    return "Use lowercase letters, numbers, _ or .";
  return "";
}

// Full validation = format then uniqueness. Returns "" when acceptable.
export function handleErrorMessage(raw) {
  const formatError = validateHandleFormat(raw);
  if (formatError) return formatError;
  if (TAKEN_HANDLES.includes(normalizeHandle(raw)))
    return "This handle is already taken";
  return "";
}

export function isHandleAcceptable(raw) {
  return handleErrorMessage(raw) === "";
}
