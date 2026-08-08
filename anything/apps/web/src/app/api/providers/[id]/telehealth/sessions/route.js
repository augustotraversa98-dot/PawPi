import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/telehealth/sessions — the assigned vet CREATES/ENSURES the video
// session for a confirmed telehealth booking. Phase 2 ticket 2.18.
//
// Gates (in order):
//   1. requireProviderCapability(providerId, 'telehealth') — the MODULE gate (2.1). A provider
//      that does not HOLD the telehealth capability 403s here. Capability ≠ data access.
//   2. The booking must be THIS provider's telehealth booking — we read pet_id from it.
//   3. RLS on telehealth_sessions (0040) is the last line: provider INSERT requires
//      staff_user_id = the caller AND active staff of the provider (participant-scoped).
//
// Creating the session does NOT touch the pet's medical record, so it needs no care grant —
// the CONSULT NOTE is written later through the existing notes route (medical_write). The
// session is the live/operational video record only.
//
// CLAIM-OR-ENSURE (0081, multi-vet). A telehealth booking may already carry an UNASSIGNED
// session pre-created at booking time for a MULTI-VET provider (staff_user_id NULL). Under RLS
// (0040) the vet can neither see nor update that unassigned row, so the assignment runs through
// the SECURITY DEFINER app_claim_telehealth_session: it claims the unassigned session for the
// caller (atomic compare-and-swap), returns it if already the caller's (solo / re-join), returns
// another vet's row when they claimed first, or NULL when no session exists yet / the caller
// isn't an eligible claimer. NULL falls back to today's self-assigned insert (legacy bookings).

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // GATE 1 — the provider must HOLD 'telehealth'.
    await requireProviderCapability(providerId, "telehealth");

    const body = (await request.json()) ?? {};
    const { booking_id } = body;
    if (!booking_id) {
      return Response.json({ error: "booking_id is required" }, { status: 400 });
    }

    // The booking must be THIS provider's telehealth booking — read pet_id from it.
    const bookingRows = await sql`
      SELECT id, pet_id FROM vet_appointments
      WHERE id = ${booking_id}
        AND provider_id = ${providerId}
        AND capability = 'telehealth'
    `;
    if (bookingRows.length === 0) {
      return Response.json(
        { error: "Invalid telehealth booking for this provider" },
        { status: 400 },
      );
    }
    const petId = bookingRows[0].pet_id;

    // Derive the owner from the pet — the session belongs to the pet owner's record.
    const petRows = await sql`SELECT owner_user_id FROM pets WHERE id = ${petId}`;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;

    // CLAIM the booking's session for this caller (or ensure my existing one). See the header.
    const claimRows = await sql`
      SELECT * FROM app_claim_telehealth_session(${booking_id})
    `;
    const claimed = claimRows[0];
    if (claimed?.id != null) {
      // A session exists. Mine (just claimed, or already assigned to me) → return it (idempotent).
      if (claimed.staff_user_id === staffUserId) {
        return Response.json({ session: claimed }, { status: 200 });
      }
      // Another eligible vet holds this consult — I lost the claim.
      return Response.json(
        { error: "another vet has taken this consult" },
        { status: 409 },
      );
    }

    // No session exists yet (legacy booking, or zero eligible staff at booking time) — fall back
    // to the self-assigned insert. RLS telehealth_sessions_staff_insert gates it (active staff).
    const created = await sql`
      INSERT INTO telehealth_sessions (
        booking_id, pet_id, owner_user_id, provider_id, staff_user_id, status
      ) VALUES (
        ${booking_id}, ${petId}, ${ownerUserId}, ${providerId}, ${staffUserId}, 'scheduled'
      )
      RETURNING *
    `;
    return Response.json({ session: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/telehealth/sessions] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to create telehealth session" },
      { status: 500 },
    );
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
