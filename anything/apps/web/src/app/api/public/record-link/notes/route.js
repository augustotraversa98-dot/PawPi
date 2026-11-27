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
};

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

    // A signed-in visitor gets their identity on this request even before their first use of the app, so the note
    // carries their name. A signed-out one has none.
    const session = await auth();
    if (session?.user?.id) {
      const user = { ...session.user, name: withoutNul(session.user.name) };
      await resolveOrCreateUserId({ ...session, user });
    }

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
    const refusal = REFUSALS[result?.outcome];
    if (!refusal) return linkNotValid();
    const [status, code, error] = refusal;
    return answer({ error, code }, status);
  } catch (error) {
    console.error("[POST /api/public/record-link/notes] Error:", error.message);
    return answer({ error: "Failed to add the note" }, 500);
  }
}

const inTransaction = withRequestContext(addNote);

// The body is read, and capped, before a database transaction or a counter lock is held.
async function receive(request) {
  const body = await readSmallJson(request, RECORD_LINK_NOTE_BODY_BYTES);
  if (body === null) return tooLarge();
  return inTransaction(request, { body });
}
export { receive as POST };
