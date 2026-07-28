import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/threads — owner ↔ provider chat threads (Phase 2 ticket 2.5).
// docs/phase2-tickets/2.5-chat-messaging.md, docs/phase2-superapp-master-plan.md §2.
//
// A thread is a 1:1 conversation between a pet OWNER and a PROVIDER (its active
// staff), optionally tied to a booking. It is PARTICIPANT-SCOPED at the DB layer
// (0031 RLS): visible/writable to the owner OR active staff of the provider, no one
// else. These routes layer the human-readable shape + the start-thread workflow on
// top; the RLS is the real guard.
//
// GET  /api/threads?side=owner|provider[&providerId=]  — list my threads.
//      side=owner    → threads where I am the owner (the mobile inbox).
//      side=provider → threads for a provider I am active staff of (the web dashboard
//                      Chats inbox); providerId is required and the SELECT is RLS-gated
//                      to threads of providers I actually staff.
// POST /api/threads  — start (or reuse) a thread, from a provider profile or a booking.
//      Body: { providerId, booking_id? } (owner context) — the caller is the owner.
//      Idempotent: returns the existing general/booking thread if one already exists
//      (the 0031 partial unique indexes guarantee at most one per pair / per booking).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query
// is a tagged template; params bind via `${}`.

// Shared thread-card SELECT: the thread + the other party's display context + the
// last message preview + the caller's unread count (messages from the OTHER side with
// read_at NULL). The unread subquery uses ${userId} so it is the CALLER's unread.
// RLS scopes WHICH thread rows the caller can see; this only shapes them.
function threadCards(userId, whereClause) {
  return sql`
    SELECT
      t.id,
      t.owner_user_id,
      t.provider_id,
      t.booking_id,
      t.created_at,
      t.last_message_at,
      pr.name AS provider_name,
      pr.logo_url AS provider_logo_url,
      COALESCE(ow.full_name, ow.username) AS owner_name,
      ow.avatar_url AS owner_avatar_url,
      (
        SELECT m.body FROM messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_body,
      (
        SELECT m.attachment_url FROM messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_attachment_url,
      (
        SELECT COUNT(*)::int FROM messages m
        WHERE m.thread_id = t.id
          AND m.sender_user_id <> ${userId}
          AND m.read_at IS NULL
      ) AS unread_count
    FROM message_threads t
    LEFT JOIN providers pr ON pr.id = t.provider_id
    LEFT JOIN user_profiles ow ON ow.id = t.owner_user_id
    WHERE ${whereClause}
    ORDER BY t.last_message_at DESC
  `;
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const side = searchParams.get("side") ?? "owner";

    let threads;
    if (side === "provider") {
      const providerId = searchParams.get("providerId");
      if (!providerId) {
        return Response.json(
          { error: "providerId is required for the provider side" },
          { status: 400 },
        );
      }
      // RLS already restricts to threads of providers the caller staffs; the
      // provider_id filter narrows to the requested provider (the active dashboard one).
      threads = await threadCards(userId, sql`t.provider_id = ${providerId}`);
    } else {
      // Owner side: my threads. RLS allows owner OR staff rows; pin to owner so the
      // owner inbox never shows threads I only see as staff of some provider.
      threads = await threadCards(userId, sql`t.owner_user_id = ${userId}`);
    }

    return Response.json({ threads });
  } catch (error) {
    console.error("[GET /api/threads] Error:", error.message);
    return Response.json({ error: "Failed to fetch threads" }, { status: 500 });
  }
}

// Start (or reuse) a thread. OWNER context: the caller becomes the thread owner.
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    const { providerId, booking_id } = body;
    if (!providerId) {
      return Response.json({ error: "providerId is required" }, { status: 400 });
    }

    // The provider must exist AND be published — you start a chat from a published
    // provider profile (or a booking with it). A draft/unknown provider is a 404.
    const providerRows = await sql`
      SELECT id, status FROM providers WHERE id = ${providerId}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    // If a booking is named it must be the caller's OWN booking with THIS provider.
    if (booking_id !== undefined && booking_id !== null) {
      const bookingRows = await sql`
        SELECT id FROM vet_appointments
        WHERE id = ${booking_id}
          AND owner_user_id = ${userId}
          AND provider_id = ${providerId}
          AND deleted_at IS NULL
      `;
      if (bookingRows.length === 0) {
        return Response.json(
          { error: "Invalid booking for this thread" },
          { status: 400 },
        );
      }
    }

    // Reuse an existing thread (idempotent start): the matching general thread
    // (booking_id NULL) or the booking-tied one. The 0031 partial unique indexes mean
    // there is at most one of each, so this is a clean upsert-by-find.
    const existing =
      booking_id !== undefined && booking_id !== null
        ? await sql`
            SELECT id FROM message_threads
            WHERE owner_user_id = ${userId}
              AND provider_id = ${providerId}
              AND booking_id = ${booking_id}
          `
        : await sql`
            SELECT id FROM message_threads
            WHERE owner_user_id = ${userId}
              AND provider_id = ${providerId}
              AND booking_id IS NULL
          `;
    if (existing.length > 0) {
      return Response.json({ thread: existing[0], reused: true });
    }

    const created = await sql`
      INSERT INTO message_threads (owner_user_id, provider_id, booking_id)
      VALUES (${userId}, ${providerId}, ${booking_id ?? null})
      RETURNING id, owner_user_id, provider_id, booking_id, created_at, last_message_at
    `;
    return Response.json({ thread: created[0], reused: false }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/threads] Error:", error.message);
    return Response.json({ error: "Failed to start thread" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies
// are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
