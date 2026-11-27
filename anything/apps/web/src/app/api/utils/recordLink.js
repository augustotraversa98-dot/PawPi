// Sharing parts of the vet record by link, with no account (migration 0153, docs/vet-sharing-design.md "Record links").
//
// The token is shown once, inside the link, to the owner who created it. Only its sha256 is stored. It sits after the
// '#' of the link, which a browser never sends to a server or in a Referer; the shared record page posts it in a request
// body. Never log it.
//
// A link holder reaches the database only through the three app_record_link_* functions, each of which checks the link
// on every call.

import { anonymousSender } from "@/app/api/utils/senderAddress";
import { enforceRateLimit } from "@/app/api/utils/rateLimit";
import {
  hashInviteToken as hashLinkToken,
  isInviteToken as isLinkToken,
  newInviteToken as newLinkToken,
} from "@/app/api/utils/vetInvite";

export { hashLinkToken, isLinkToken, newLinkToken };

// A link that needs no sign-in always ends: there is no "until revoked".
export const RECORD_LINK_EXPIRIES = { "7d": "7 days", "30d": "30 days", "1y": "1 year" };
export const RECORD_LINK_OPEN_LIMIT = 10;
export const RECORD_LINK_NOTE_MAX = 2000;
export const RECORD_LINK_FILE_SECONDS = 60;
// The most a public route reads: a token and a few fields, or a token and a note of RECORD_LINK_NOTE_MAX characters
// however its JSON escapes them.
export const RECORD_LINK_BODY_BYTES = 1024;
export const RECORD_LINK_NOTE_BODY_BYTES = 16 * 1024;

export const recordLinkUrl = (origin, token) => `${origin}/shared-record#${token}`;

export const NO_STORE = { "Cache-Control": "no-store" };

/** A JSON answer that no cache keeps. */
export const answer = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** One answer for every unusable link: unknown, malformed, expired or revoked. */
export const linkNotValid = () =>
  answer({ error: "This link is not available", code: "link_not_valid" }, 403);

export const tooLarge = () => answer({ error: "Request too large", code: "too_large" }, 413);

/**
 * The JSON object of a request body of at most `maxBytes`, for the public routes to read before any database work. A
 * body that is absent or not an object reads as {}; a longer one as null, without reading the rest of it.
 */
export async function readSmallJson(request, maxBytes) {
  if (Number(request.headers.get("content-length")) > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// The table, a column or a function of 0153 is not there yet.
const MISSING_SCHEMA = new Set(["42P01", "42703", "42883"]);
export const isMissingSchema = (error) => MISSING_SCHEMA.has(error?.code);

/** Counts a public request against the sender's address, signed in or not. */
export const limitPublicRequest = (bucket, request) =>
  enforceRateLimit(bucket, request, { subject: anonymousSender(request) });

/**
 * A vet note as the owner, the family and a provider read it. A note added through a link keeps the label the database
 * wrote in vet_name, which says it came from a shared link, and repeats it in the fields app versions released before
 * links show. Versions that know links show external_author_name and their own mark. Any other note is returned as it
 * is.
 */
export function presentVetNote(note) {
  if (!note?.via_record_link) return note;
  const { record_link_id: _link, created_by_user_id: _author, ...rest } = note;
  return { ...rest, created_by_name: note.vet_name, created_by_role: "editor" };
}
