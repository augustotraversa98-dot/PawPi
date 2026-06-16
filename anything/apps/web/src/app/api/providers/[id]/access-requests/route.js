import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/access-requests — provider staff request SCOPED access
// to a pet, tied (optionally) to a booking. Ticket 7 (docs/provider-design.md §2
// Consent + §4 item 7). This is the ONLY way a care_access_grants row is created
// from the provider side; the owner then approves it (PATCH /api/care-access/
// grants/[grantId]) which flips it to 'active' — the state assertCareAccess honors.
//
// AUTH: any ACTIVE staff of :id may request (ALL_PROVIDER_ROLES) — requesting is
// operational, like reading the booking inbox. Authorization is provider_staff
// MEMBERSHIP, never user_profiles.role.
//
// LIFECYCLE NOTE: the grant's lifecycle lives on the row itself (status +
// granted_at/revoked_at). care_access_audit is append-only and ONLY for
// data-ACCESS events (action read|write) written by assertCareAccess — a
// 'request' is NOT a data access, so this route writes NO audit row.
//
// SCOPES are strictly enumerated; any element outside the set is a 400.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`.

// The only valid scope values (docs/provider-design.md §2).
const VALID_SCOPES = [
  "medical_read",
  "medical_write",
  "vaccinations_write",
  "appointments",
  "health_logs_read",
  "health_logs_write",
  "messaging",
];

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Requesting access is operational — any active staff member may do it.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json()) ?? {};
    const { petId, scopes, bookingId } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    // scopes must be a non-empty array, every element in the enumerated set.
    if (
      !Array.isArray(scopes) ||
      scopes.length === 0 ||
      !scopes.every((s) => VALID_SCOPES.includes(s))
    ) {
      return Response.json(
        {
          error:
            "scopes must be a non-empty array of valid scope values",
        },
        { status: 400 },
      );
    }

    // Derive the granting authority (owner) from the pet. Unknown pet → 404.
    const petRows = await sql`
      SELECT owner_user_id FROM pets WHERE id = ${petId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;

    // If a booking is named it must be a vet_appointments row for THIS provider
    // AND this pet — the care relationship justifying the grant.
    if (bookingId !== undefined && bookingId !== null) {
      const bookingRows = await sql`
        SELECT id FROM vet_appointments
        WHERE id = ${bookingId}
          AND provider_id = ${providerId}
          AND pet_id = ${petId}
      `;
      if (bookingRows.length === 0) {
        return Response.json(
          { error: "Invalid booking for this provider and pet" },
          { status: 400 },
        );
      }
    }

    // Dedup: a live grant (pending OR active) for this (pet, provider) already
    // exists — re-request is only allowed after it is revoked/expired.
    const existing = await sql`
      SELECT id FROM care_access_grants
      WHERE pet_id = ${petId}
        AND provider_id = ${providerId}
        AND status IN ('pending', 'active')
      LIMIT 1
    `;
    if (existing.length > 0) {
      return Response.json(
        { error: "An active or pending access request already exists" },
        { status: 409 },
      );
    }

    // Insert the pending grant. requested_by='provider'; status defaults to
    // 'pending' but is set explicitly for clarity. NO audit row (see header).
    const created = await sql`
      INSERT INTO care_access_grants (
        pet_id,
        owner_user_id,
        provider_id,
        scopes,
        status,
        requested_by,
        booking_id
      ) VALUES (
        ${petId},
        ${ownerUserId},
        ${providerId},
        ${scopes},
        ${"pending"},
        ${"provider"},
        ${bookingId ?? null}
      )
      RETURNING *
    `;

    return Response.json({ grant: created[0] }, { status: 201 });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[POST /api/providers/[id]/access-requests] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to create access request" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
