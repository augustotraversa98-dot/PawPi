import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/pets/[id]/training-classes — the OWNER JOINS a trainer's GROUP CLASS for their
// pet. Phase 2 ticket 2.10 (docs/phase2-tickets/2.10-training.md).
//
// A group class is ONE training_sessions row carrying a CAPACITY; each attendee is ONE
// training_progress (roster) row (pet_id). This route enforces GROUP-CLASS CAPACITY /
// OVERBOOK PREVENTION the same COUNT-BASED way daycare occupancy does (0034): it counts the
// LIVE attendees (booked|completed) of the class and refuses (clean 409) when that count is
// already at the class's capacity. capacity NULL = not capacity-managed (no limit).
//
// OWNER-context route: authorization is pet OWNERSHIP — resolveUserId, not provider auth.
// training_progress RLS (0036) enforces the owner FOR ALL policy as the last line; the
// owner creates the roster row for THEIR pet in their own context.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // I must OWN the pet — cannot join a class for a pet I don't own.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    const body = (await request.json()) ?? {};
    const { session_id, booking_id } = body;
    if (!session_id) {
      return Response.json({ error: "session_id is required" }, { status: 400 });
    }

    // The class must be a real GROUP CLASS of a published provider that HOLDS 'trainer'.
    // (training_sessions RLS makes a published provider's sessions publicly readable.)
    const classRows = await sql`
      SELECT s.id, s.provider_id, s.kind, s.capacity, s.status
      FROM training_sessions s
      JOIN providers p ON p.id = s.provider_id
      JOIN provider_capabilities pc
        ON pc.provider_id = s.provider_id AND pc.capability = 'trainer'
      WHERE s.id = ${session_id}
        AND s.kind = 'group_class'
        AND p.status = 'published'
    `;
    if (classRows.length === 0) {
      return Response.json({ error: "Class not found" }, { status: 404 });
    }
    const cls = classRows[0];
    if (cls.status === "cancelled") {
      return Response.json({ error: "This class is cancelled" }, { status: 400 });
    }
    const providerId = cls.provider_id;

    // The owner cannot double-book the SAME pet into the SAME class.
    const dup = await sql`
      SELECT id FROM training_progress
      WHERE session_id = ${session_id}
        AND pet_id = ${petId}
        AND status = ANY (ARRAY['booked', 'completed'])
    `;
    if (dup.length > 0) {
      return Response.json(
        { error: "This pet is already enrolled in the class" },
        { status: 409 },
      );
    }

    // GROUP-CLASS CAPACITY (2.10, reuses the 2.8 count-based guard). When the class is
    // capacity-managed (capacity NOT NULL), count the LIVE attendees and refuse if already
    // at capacity. capacity NULL = no limit.
    if (cls.capacity != null) {
      const occ = await sql`
        SELECT COUNT(*)::int AS n
        FROM training_progress
        WHERE session_id = ${session_id}
          AND status = ANY (ARRAY['booked', 'completed'])
      `;
      if (occ[0].n >= cls.capacity) {
        return Response.json(
          { error: "This class is full" },
          { status: 409 },
        );
      }
    }

    // If a booking is linked it must be THIS provider's booking for THIS pet.
    if (booking_id !== undefined && booking_id !== null) {
      const bookingRows = await sql`
        SELECT id FROM vet_appointments
        WHERE id = ${booking_id}
          AND provider_id = ${providerId}
          AND pet_id = ${petId}
      `;
      if (bookingRows.length === 0) {
        return Response.json(
          { error: "Invalid booking for this class" },
          { status: 400 },
        );
      }
    }

    // Create the roster row (booked) in OWNER context. owner_user_id = me (the RLS key).
    const created = await sql`
      INSERT INTO training_progress (
        session_id, program_id, pet_id, owner_user_id, provider_id, status
      ) VALUES (
        ${session_id}, ${null}, ${petId}, ${userId}, ${providerId}, 'booked'
      )
      RETURNING *
    `;

    return Response.json({ progress: created[0] }, { status: 201 });
  } catch (error) {
    console.error(
      "[POST /api/pets/[id]/training-classes] Error:",
      error?.message,
    );
    return Response.json(
      { error: "Failed to join class" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md).
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
