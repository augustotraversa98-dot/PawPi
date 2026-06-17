import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/pets/[id]/daycare-stays — the OWNER books a daycare/boarding stay and reads
// their pet's stays (with the daily REPORT CARDS + the VACCINE-REQUIREMENT status).
// Phase 2 ticket 2.8 (docs/phase2-tickets/2.8-daycare-boarding.md).
//
// This is an OWNER-context route: authorization is pet OWNERSHIP (WHERE owner_user_id =
// me), NOT provider_staff membership — so it uses resolveUserId, never
// requireProviderCapability / assertCareAccess. daycare_stays RLS (0034) also enforces
// the owner FOR ALL policy as the last line.
//
// CAPACITY / OVERBOOK PREVENTION (POST): a stay holds a DATE RANGE. Before creating it,
// the route counts the LIVE stays (booked|checked_in) at the same location whose range
// OVERLAPS the requested range, and refuses (clean 409) if that count is already at the
// location's capacity. capacity NULL = not capacity-managed (no limit). This extends the
// 2.4 availability/double-book mechanism from a per-staff slot to per-location occupancy.
//
// VACCINE STATUS (GET): for each stay the route reports pass/fail + missing vaccines
// against the facility's daycare_requirements, computed from the OWNER's OWN
// pet_vaccinations (the owner reads their own pet's vaccines directly — no consent needed
// on the owner side; the FACILITY's read is the consent-gated path, see the provider
// vaccine-check route). This is "the OWNER's side surfacing their vax to the facility"
// branch the ticket allows, alongside the provider's assertCareAccess branch.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`.

// Compute pass/fail + missing vaccines for one (pet, provider, location) against the
// facility's ACTIVE requirements, using the pet's CURRENT (non-deleted, unexpired)
// vaccinations. Case-insensitive name match. Returns { required, passed, missing }.
async function computeVaccineStatus(petId, providerId, locationId) {
  // ACTIVE requirements that apply to this stay: provider-wide (location_id NULL) OR
  // this specific location.
  const reqs = await sql`
    SELECT DISTINCT lower(vaccine_name) AS name
    FROM daycare_requirements
    WHERE provider_id = ${providerId}
      AND active = true
      AND (location_id IS NULL OR location_id = ${locationId ?? null})
  `;
  const required = reqs.map((r) => r.name);
  if (required.length === 0) {
    return { required: [], passed: true, missing: [] };
  }

  // The pet's CURRENT vaccinations (not soft-deleted; not expired). The owner reads their
  // own pet's vaccines.
  const vax = await sql`
    SELECT DISTINCT lower(name) AS name
    FROM pet_vaccinations
    WHERE pet_id = ${petId}
      AND deleted_at IS NULL
      AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
  `;
  const have = new Set(vax.map((v) => v.name));
  const missing = required.filter((r) => !have.has(r));
  return { required, passed: missing.length === 0, missing };
}

async function GET(request, { params }) {
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

    // I must OWN the pet — cannot read another owner's stays.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    // The stays + the facility/location names for labelling. Newest first.
    const stays = await sql`
      SELECT
        ds.id, ds.booking_id, ds.pet_id, ds.provider_id, ds.location_id,
        ds.start_date, ds.end_date, ds.status,
        ds.feeding_instructions, ds.med_instructions,
        ds.checked_in_at, ds.checked_out_at, ds.created_at,
        p.name AS provider_name,
        l.name AS location_name
      FROM daycare_stays ds
      LEFT JOIN providers p ON p.id = ds.provider_id
      LEFT JOIN provider_locations l ON l.id = ds.location_id
      WHERE ds.pet_id = ${petId}
        AND ds.owner_user_id = ${userId}
      ORDER BY ds.start_date DESC, ds.id DESC
    `;

    // Attach each stay's report cards (owner-visible) + the vaccine status.
    const enriched = [];
    for (const stay of stays) {
      const cards = await sql`
        SELECT id, stay_id, date, mood, meals, activities, notes, photo_urls, created_at
        FROM report_cards
        WHERE stay_id = ${stay.id}
        ORDER BY date DESC, id DESC
      `;
      const vaccineStatus = await computeVaccineStatus(
        petId,
        stay.provider_id,
        stay.location_id,
      );
      enriched.push({ ...stay, report_cards: cards, vaccine_status: vaccineStatus });
    }

    return Response.json({ stays: enriched });
  } catch (error) {
    console.error("[GET /api/pets/[id]/daycare-stays] Error:", error?.message);
    return Response.json(
      { error: "Failed to fetch daycare stays" },
      { status: 500 },
    );
  }
}

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

    // I must OWN the pet — cannot book a stay for a pet I don't own.
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
    const {
      provider_id,
      location_id,
      start_date,
      end_date,
      feeding_instructions,
      med_instructions,
      booking_id,
    } = body;

    if (!provider_id || !start_date || !end_date) {
      return Response.json(
        { error: "provider_id, start_date, and end_date are required" },
        { status: 400 },
      );
    }
    if (!(start_date <= end_date)) {
      return Response.json(
        { error: "end_date must be on or after start_date" },
        { status: 400 },
      );
    }

    // Provider must exist, be published, AND HOLD the 'daycare' capability (you can only
    // book a service a provider offers — the module/capability gate, 2.1).
    const providerRows = await sql`
      SELECT id, status FROM providers WHERE id = ${provider_id}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    const capRows = await sql`
      SELECT 1 FROM provider_capabilities
      WHERE provider_id = ${provider_id} AND capability = 'daycare'
    `;
    if (capRows.length === 0) {
      return Response.json(
        { error: "Provider does not offer daycare & boarding" },
        { status: 400 },
      );
    }

    // If a location is named it must belong to THIS provider; capture its capacity.
    let capacity = null;
    if (location_id !== undefined && location_id !== null) {
      const locRows = await sql`
        SELECT id, capacity FROM provider_locations
        WHERE id = ${location_id} AND provider_id = ${provider_id}
      `;
      if (locRows.length === 0) {
        return Response.json(
          { error: "Invalid location for this provider" },
          { status: 400 },
        );
      }
      capacity = locRows[0].capacity;
    }

    // If a booking is linked it must be THIS provider's booking for THIS pet.
    if (booking_id !== undefined && booking_id !== null) {
      const bookingRows = await sql`
        SELECT id FROM vet_appointments
        WHERE id = ${booking_id}
          AND provider_id = ${provider_id}
          AND pet_id = ${petId}
      `;
      if (bookingRows.length === 0) {
        return Response.json(
          { error: "Invalid booking for this stay" },
          { status: 400 },
        );
      }
    }

    // OVERBOOK PREVENTION (2.8). When the location is capacity-managed (capacity NOT
    // NULL), count the LIVE stays (booked|checked_in) at this location whose date range
    // OVERLAPS the requested range; refuse if already at capacity. Inclusive ranges
    // overlap when start_a <= end_b AND end_a >= start_b. capacity NULL = no limit.
    if (location_id !== undefined && location_id !== null && capacity != null) {
      const occ = await sql`
        SELECT COUNT(*)::int AS n
        FROM daycare_stays
        WHERE location_id = ${location_id}
          AND status = ANY (ARRAY['booked', 'checked_in'])
          AND start_date <= ${end_date}
          AND end_date >= ${start_date}
      `;
      if (occ[0].n >= capacity) {
        return Response.json(
          { error: "The facility is fully booked for those dates" },
          { status: 409 },
        );
      }
    }

    // Create the stay (booked) in OWNER context. Feeding/med instructions are the owner's,
    // provided at booking. owner_user_id = me (the RLS owner key).
    const created = await sql`
      INSERT INTO daycare_stays (
        booking_id, pet_id, owner_user_id, provider_id, location_id,
        start_date, end_date, status, feeding_instructions, med_instructions
      ) VALUES (
        ${booking_id ?? null}, ${petId}, ${userId}, ${provider_id},
        ${location_id ?? null}, ${start_date}, ${end_date}, 'booked',
        ${feeding_instructions ?? null}, ${med_instructions ?? null}
      )
      RETURNING *
    `;

    // Surface the vaccine status with the created stay so the owner immediately sees
    // pass/fail + any missing vaccines.
    const vaccineStatus = await computeVaccineStatus(
      petId,
      provider_id,
      location_id ?? null,
    );

    return Response.json(
      { stay: created[0], vaccine_status: vaccineStatus },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/pets/[id]/daycare-stays] Error:", error?.message);
    return Response.json(
      { error: "Failed to book daycare stay" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
