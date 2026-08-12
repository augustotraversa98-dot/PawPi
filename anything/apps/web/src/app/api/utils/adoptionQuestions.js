// Adoption applications v2 — shared helpers for the PER-LISTING application_questions
// (migration 0086, adoptable_listings.application_questions jsonb). Kept tiny + dependency-free
// so every listing route reuses the same sanitize + pre-migration degrade contract.

// Pre-migration degrade (0086): application_questions is hand-applied to Supabase AFTER this
// code deploys. Any query that references the column must catch Postgres undefined_column
// (42703) and fall back — reads to an empty [] (no questions), writes to omitting the column —
// so adoption keeps working until the migration lands. Mirrors the 0084 pet_id comment degrade.
export const UNDEFINED_COLUMN = "42703";
export const isMissingColumn = (e) => e?.code === UNDEFINED_COLUMN;

const MAX_QUESTIONS = 20;
const MAX_QUESTION_LEN = 300;

// Normalize a client-supplied application_questions payload into an ordered array of clean,
// non-empty question strings (trimmed, de-duped of blanks, capped). Anything not an array of
// usable strings → []. Returns null when the field was absent (so callers can leave it
// unchanged on PATCH), or an array (possibly empty) when present.
export function sanitizeQuestions(input) {
  if (input === undefined) return null; // not provided → don't touch it
  if (!Array.isArray(input)) return []; // present but malformed → clear to none
  const out = [];
  for (const q of input) {
    if (typeof q !== "string") continue;
    const trimmed = q.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, MAX_QUESTION_LEN));
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}
