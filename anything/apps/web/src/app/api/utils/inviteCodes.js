// Pet invite codes (docs/pr6-invite-code-design.md). The code is 12 characters from an alphabet with no look-alikes
// (no 0/O, 1/I/L, U): about 59 bits. Only its sha256 is ever stored, and it must never be logged.

import { createHash, randomInt } from "node:crypto";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 12;
export const CODE_TTL_HOURS = 72;
export const MAX_LIVE_CODES_PER_PET = 5;

/** A new random code, grouped for reading: ABCD-EFGH-JKMN. */
export function generateInviteCode() {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return raw.replace(/(.{4})(?=.)/g, "$1-");
}

/** What a person typed or pasted -> the canonical 12 characters, or null when it cannot be a code. */
export function normalizeInviteCode(input) {
  if (typeof input !== "string" || input.length > 64) return null;
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "");
  if (cleaned.length !== CODE_LENGTH) return null;
  return [...cleaned].every((c) => CODE_ALPHABET.includes(c)) ? cleaned : null;
}

export function hashInviteCode(canonical) {
  return createHash("sha256").update(canonical).digest("hex");
}
