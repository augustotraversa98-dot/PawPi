// Server-side text content filter (Guideline 1.2, ticket T7) — Apple's "method to filter
// objectionable content." A shared word-list/profanity check applied at every UGC write
// chokepoint BEFORE insert. On a match the route rejects with 422 (no image moderation in v1).
//
// Design: normalize the text (lowercase, strip diacritics, fold common leetspeak), then test
// each banned term with a regex that tolerates letter-repetition and 0–2 separators between
// letters (so "f u c k", "f.u.c.k", "fuuuck" are caught) AND requires letter boundaries on both
// ends (so the term isn't part of a larger clean word — e.g. "Scunthorpe" / "assignment" pass).
// This is intentionally a minimal list, not an exhaustive one; it's the launch bar, extensible.

const LEET_MAP = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

function normalize(input) {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[013457@$]/g, (c) => LEET_MAP[c] ?? c);
}

// Minimal launch word-list: unambiguous profanity + slurs. Kept terse on purpose.
const BANNED_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dickhead",
  "cunt",
  "whore",
  "slut",
  "nigger",
  "faggot",
  "retard",
  "rape",
  "kike",
  "spic",
  "chink",
  "tranny",
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// term → /(?<![a-z])f+[^a-z]{0,2}u+[^a-z]{0,2}c+[^a-z]{0,2}k+(?![a-z])/
function termToRegex(term) {
  const body = term
    .split("")
    .map((ch) => `${escapeRe(ch)}+`)
    .join("[^a-z]{0,2}");
  return new RegExp(`(?<![a-z])${body}(?![a-z])`);
}

const PATTERNS = BANNED_TERMS.map((term) => ({ term, re: termToRegex(term) }));

/**
 * Scan one or more text fields for objectionable language.
 * Returns { clean: true, term: null } or { clean: false, term: "<matched>" }.
 * Non-string / null args are ignored, so callers can pass optional fields directly.
 */
export function moderateText(...texts) {
  const joined = texts.filter((t) => typeof t === "string").join("  ");
  if (!joined) return { clean: true, term: null };
  const norm = normalize(joined);
  for (const { term, re } of PATTERNS) {
    if (re.test(norm)) return { clean: false, term };
  }
  return { clean: true, term: null };
}

// The standard 422 the routes return on a filter hit — one shared message + shape.
export const MODERATION_REJECTION = {
  error: "Your text contains language that isn't allowed. Please edit it and try again.",
  code: "text_moderation_blocked",
};

/**
 * Convenience for routes: returns a 422 Response when any field is flagged, else null.
 *   const blocked = moderationResponse(title, body); if (blocked) return blocked;
 */
export function moderationResponse(...texts) {
  const { clean } = moderateText(...texts);
  if (clean) return null;
  return Response.json(MODERATION_REJECTION, { status: 422 });
}
