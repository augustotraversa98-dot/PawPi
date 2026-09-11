import sql from "@/app/api/utils/sql";

// AUDIT A-22 — explicit participant predicates for the messaging read/mark-read
// routes. RLS already returns zero rows to a non-participant, so these are
// defense-in-depth: they turn a silent empty result into an explicit 403, and
// they encode the same predicate the RLS policy uses at the app layer.
//
// DB is porsager's tagged-template `sql`.

// dm_threads (owner↔owner DMs): a participant is user_a_id or user_b_id.
export async function isDmThreadParticipant(userId, threadId) {
  const rows = await sql`
    SELECT 1
    FROM dm_threads
    WHERE id = ${threadId}
      AND (user_a_id = ${userId} OR user_b_id = ${userId})
    LIMIT 1
  `;
  return rows.length > 0;
}

// message_threads (owner↔provider): a participant is the thread owner OR active
// staff of the thread's provider — the exact scope the 0031 RLS policy encodes.
export async function isMessageThreadParticipant(userId, threadId) {
  const rows = await sql`
    SELECT 1
    FROM message_threads t
    WHERE t.id = ${threadId}
      AND (
        t.owner_user_id = ${userId}
        OR EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = t.provider_id
            AND ps.user_profile_id = ${userId}
            AND ps.status = 'active'
        )
      )
    LIMIT 1
  `;
  return rows.length > 0;
}
