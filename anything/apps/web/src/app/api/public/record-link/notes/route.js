import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveOrCreateUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import {
  RECORD_LINK_NOTE_BODY_BYTES,
  RECORD_LINK_NOTE_MAX,
  answer,
  hashLinkToken,
  isLinkToken,
  isMissingSchema,
  limitPublicRequest,
  linkNotValid,
  readSmallJson,
  tooLarge,
} from "@/app/api/utils/recordLink";

const REFUSALS = {
  not_allowed: [403, "notes_not_allowed", "This link does not allow adding notes"],
  bad_note: [400, "bad_note", "The note is empty or too long"],
  limit: [429, "note_limit", "This link reached its notes for today"],
  not_found: [404, "note_not_found", "That note was not added through this link"],
  not_author: [403, "not_author", "Only the person who wrote this note can change it"],
};
const refuse = (outcome) => {
  const refusal = REFUSALS[outcome];
  if (!refusal) return linkNotValid();
  const [status, code, error] = refusal;
  return answer({ error, code }, status);
};

// A signed-in visitor gets their identity on this request even before their first use of the app, so a note carries
// their name and stays theirs to edit. A signed-out one has none.
async function identifyVisitor() {
  const session = await auth();
  if (session?.user?.id) {
    const user = { ...session.user, name: withoutNul(session.user.name) };
    await resolveOrCreateUserId({ ...session, user });
  }
}

// The database's text cannot hold the NUL character, so it is left out of what is stored.
const withoutNul = (text) => (typeof text === "string" ? text.replaceAll("\u0000", "") : text);

// POST /api/public/record-link/notes { token, note } → 201 { note: { note_date, created_at, author_name } }: adds one
// vet note through a link that allows it (migration 0153). No account needed. Only the note is read from the body: the
// author is whoever the session says is signed in (the database reads the request's identity), otherwise nobody
// (`author_name` null). Nothing else of the record can be changed through a link.
//   403 'link_not_valid' | 'notes_not_allowed' · 400 'bad_note' · 413 · 429 'note_limit' | 'rate_limited'
async function addNote(request, { body }) {
  try {
    const limited = await limitPublicRequest("record_link_note", request);
    if (limited) return limited;

    if (!isLinkToken(body.token)) return linkNotValid();
    const note = typeof body.note === "string" ? withoutNul(body.note).trim() : "";
    if (!note || note.length > RECORD_LINK_NOTE_MAX) {
      return answer({ error: REFUSALS.bad_note[2], code: "bad_note" }, 400);
    }

    await identifyVisitor();

    let rows;
    try {
      rows = await withSavepoint(async () => {
        return await sql`
          SELECT outcome, added_on::text AS added_on, added_at, author
          FROM app_record_link_add_note(${hashLinkToken(body.token)}, ${note})
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return linkNotValid();
    }

    const result = rows?.[0];
    if (result?.outcome === "added") {
      return answer(
        {
          note: {
            note_date: result.added_on,
            created_at: result.added_at,
            author_name: result.author,
          },
        },
        201,
      );
    }
    return refuse(result?.outcome);
  } catch (error) {
    console.error("[POST /api/public/record-link/notes] Error:", error.message);
    return answer({ error: "Failed to add the note" }, 500);
  }
}

// PATCH /api/public/record-link/notes { token, noteId, note } → 200 { note: { id, edited_at } }: changes the text of
// one note added through this link (migration 0157), while the link allows notes. A note written signed in is changed
// only by that person; an anonymous one by whoever holds the link.
//   403 'link_not_valid' | 'notes_not_allowed' | 'not_author' · 404 'note_not_found' · 400 'bad_note' · 413
//   409 'note_edit_unavailable' (database without 0157) · 429 'rate_limited'
async function editNote(request, { body }) {
  try {
    const limited = await limitPublicRequest("record_link_note_edit", request);
    if (limited) return limited;

    if (!isLinkToken(body.token)) return linkNotValid();
    const noteId = body.noteId;
    if (!Number.isInteger(noteId) || noteId <= 0 || noteId > 2147483647) {
      return refuse("not_found");
    }
    const note = typeof body.note === "string" ? withoutNul(body.note).trim() : "";
    if (!note || note.length > RECORD_LINK_NOTE_MAX) return refuse("bad_note");

    await identifyVisitor();

    let rows;
    try {
      rows = await withSavepoint(async () => {
        return await sql`
          SELECT outcome, edited_at
          FROM app_record_link_update_note(${hashLinkToken(body.token)}, ${noteId}::int, ${note})
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return answer({ error: "Notes cannot be edited yet", code: "note_edit_unavailable" }, 409);
    }

    const result = rows?.[0];
    if (result?.outcome === "updated" || result?.outcome === "unchanged") {
      return answer({ note: { id: noteId, edited_at: result.edited_at } });
    }
    return refuse(result?.outcome);
  } catch (error) {
    console.error("[PATCH /api/public/record-link/notes] Error:", error.message);
    return answer({ error: "Failed to change the note" }, 500);
  }
}

// The body is read, and capped, before a database transaction or a counter lock is held.
const receiveWith = (handler) => {
  const inTransaction = withRequestContext(handler);
  return async function receive(request) {
    const body = await readSmallJson(request, RECORD_LINK_NOTE_BODY_BYTES);
    if (body === null) return tooLarge();
    return inTransaction(request, { body });
  };
};
const POST = receiveWith(addNote);
const PATCH = receiveWith(editNote);
export { POST, PATCH };
