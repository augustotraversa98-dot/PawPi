import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { safeNotify, bookingNotifyBody } from "@/app/api/utils/notify";

// POST /api/providers/[id]/walk-requests/[requestId]/accept — a walker's active staff ACCEPTS an
// incoming request (ticket C1). The single claim path: app_accept_walk_request (0092) atomically
// verifies open/not-expired/eligible, flips it to accepted, and creates the confirmed walker
// booking (credit-funded if the owner has a pack). First-to-accept wins; a second accept (or an
// expired request) → NULL → 409 "already taken". On success we ALSO open the owner↔walker chat
// thread (staff-insert allowed by message_threads RLS) and notify the owner. Non-integer ids → 404
// before SQL. Degrade clean: missing helper/table → friendly 503.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = Number(params.id);
    const requestId = Number(params.requestId);
    if (!Number.isInteger(providerId) || !Number.isInteger(requestId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    // The atomic claim + booking creation. NULL result = already taken / expired / not eligible.
    let result;
    try {
      const rows = await sql`
        SELECT app_accept_walk_request(${requestId}, ${providerId}) AS result
      `;
      result = rows?.[0]?.result ?? null;
    } catch (e) {
      // Unmigrated prod (no helper/table) → not available yet.
      if (e?.code === "42883" || e?.code === "42P01") {
        return Response.json(
          { error: "Walk requests are not available yet" },
          { status: 503 },
        );
      }
      throw e;
    }

    if (!result || result.request == null) {
      return Response.json(
        { error: "This request is no longer available", code: "already_taken" },
        { status: 409 },
      );
    }

    const req = result.request;
    const bookingId = result.booking_id ?? null;

    // Open (or reuse) the general owner↔walker thread so both sides can coordinate. Idempotent via
    // idx_message_threads_unique_general; the active-staff INSERT is allowed by
    // message_threads_participant_all (0031). Non-fatal: a thread failure must not undo the accept.
    let threadId = null;
    try {
      const existing = await sql`
        SELECT id FROM message_threads
        WHERE owner_user_id = ${req.owner_user_id}
          AND provider_id = ${providerId}
          AND booking_id IS NULL
      `;
      if (existing.length > 0) {
        threadId = existing[0].id;
      } else {
        const createdThread = await sql`
          INSERT INTO message_threads (owner_user_id, provider_id, booking_id)
          VALUES (${req.owner_user_id}, ${providerId}, NULL)
          RETURNING id
        `;
        threadId = createdThread[0].id;
      }
    } catch (threadErr) {
      console.error(
        "[POST /api/providers/[id]/walk-requests/[requestId]/accept] thread (non-fatal):",
        threadErr?.message,
      );
    }

    // Notify the owner their walk was accepted, deep-linking to the created booking.
    const provRows = await sql`SELECT name FROM providers WHERE id = ${providerId}`;
    await safeNotify({
      recipient: req.owner_user_id,
      actor: userId,
      type: "walk_request_accepted",
      subjectRef: bookingId != null ? String(bookingId) : String(req.id),
      body: bookingNotifyBody({
        service: "Walk",
        provider: provRows?.[0]?.name ?? null,
        date: req.scheduled_at ? String(req.scheduled_at).slice(0, 10) : null,
        time: req.scheduled_at ? String(req.scheduled_at).slice(11, 16) : null,
      }),
    });

    return Response.json({ request: req, thread_id: threadId, booking_id: bookingId });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/walk-requests/[requestId]/accept] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to accept walk request" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
