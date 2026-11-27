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

export const recordLinkUrl = (origin, token) => `${origin}/shared-record#${token}`;

export const NO_STORE = { "Cache-Control": "no-store" };

/** A JSON answer that no cache keeps. */
export const answer = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** One answer for every unusable link: unknown, malformed, expired or revoked. */
export const linkNotValid = () =>
  answer({ error: "This link is not available", code: "link_not_valid" }, 403);

// The table, a column or a function of 0153 is not there yet.
const MISSING_SCHEMA = new Set(["42P01", "42703", "42883"]);
export const isMissingSchema = (error) => MISSING_SCHEMA.has(error?.code);

/** Counts a public request against the sender's address, signed in or not. */
export const limitPublicRequest = (bucket, request) =>
  enforceRateLimit(bucket, request, { subject: anonymousSender(request) });

/**
 * A vet note as the owner, the family and a provider read it. A note added through a link keeps the label the database
 * wrote in vet_name and repeats it in the fields app versions released before links show, so none of them reads it as
 * the owner's own. Any other note is returned as it is.
 */
export function presentVetNote(note) {
  if (!note?.via_record_link) return note;
  const { record_link_id: _link, created_by_user_id: _author, ...rest } = note;
  return { ...rest, created_by_name: note.vet_name, created_by_role: "editor" };
}
