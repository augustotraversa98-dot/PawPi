import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/emergency-card — the OWNER's Emergency Card (ticket 2.51). Owner-scoped (RLS R2c-style:
// pet_emergency_cards is owner FOR ALL). The PUBLIC reads are elsewhere (/api/public/emergency/*
// via SECURITY DEFINER fns); this route is the authenticated owner surface only.
//
// GET ?petId= : lazily create the card on first open (a permanent tag_token) and return the card
//   settings + the assembled medical preview (from the LIVE owner-scoped sources — no duplication)
//   + active vet links + the current lost status.
// PATCH      : update the owner-controlled settings (show_medical_on_tag, contact_mode/value,
//   blood_type, extra_notes, active).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").

const CONTACT_MODES = ["relay", "phone", "email", "none"];

async function resolveOwner(session) {
  const rows = await sql`
    SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
  `;
  return rows.length ? rows[0].id : null;
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    const ownerUserId = await resolveOwner(session);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Ownership check (RLS would also scope, but a clean 404 is friendlier).
    const pet = await sql`
      SELECT id, name, species, breed, age_years, age_months, gender, avatar_url
      FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;
    if (pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // Lazily create the card (one per pet) with a permanent tag token. ON CONFLICT keeps the
    // existing row + its stable tag_token (a printed tag must never break).
    const tagToken = crypto.randomUUID().replace(/-/g, "");
    const cardRows = await sql`
      INSERT INTO pet_emergency_cards (pet_id, owner_user_id, tag_token)
      VALUES (${petId}, ${ownerUserId}, ${tagToken})
      ON CONFLICT (pet_id) DO UPDATE SET updated_at = now()
      RETURNING id, pet_id, tag_token, show_medical_on_tag, contact_mode, contact_value,
                blood_type, extra_notes, active
    `;
    const card = cardRows[0];

    // Assemble the medical preview from the LIVE owner-scoped sources (owner can read them).
    const mp = await sql`
      SELECT microchip_id, spayed_neutered_status, primary_vet_name, primary_clinic_name,
             vet_phone, emergency_contact_name, emergency_contact_phone, medical_notes
      FROM pet_medical_profiles
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId} AND deleted_at IS NULL
    `;
    const allergies = await sql`
      SELECT allergen, severity, reaction FROM pet_allergies
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId} ORDER BY id
    `;
    const conditions = await sql`
      SELECT condition, status FROM pet_conditions
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId} ORDER BY id
    `;
    const lost = await sql`
      SELECT id, reward, last_seen_area FROM lost_reports
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId} AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `;
    const links = await sql`
      SELECT id, token, scope, expires_at, created_at FROM pet_emergency_share_links
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId} AND revoked_at IS NULL
      ORDER BY created_at DESC
    `;

    return Response.json({
      card,
      pet: pet[0],
      medical: mp[0] ?? null,
      allergies,
      conditions,
      lost: lost[0] ?? null,
      links,
    });
  } catch (e) {
    console.error("[GET /api/emergency-card] Error:", e?.message);
    return Response.json({ error: "Failed to load emergency card" }, { status: 500 });
  }
}

async function PATCH(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) ?? {};
    const petId = body.petId;
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    if (body.contact_mode !== undefined && !CONTACT_MODES.includes(body.contact_mode)) {
      return Response.json({ error: "Invalid contact_mode" }, { status: 400 });
    }
    const ownerUserId = await resolveOwner(session);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // COALESCE keeps unspecified fields. The owner_user_id WHERE + RLS scope the row; a
    // non-owner updates ZERO rows → 404.
    const updated = await sql`
      UPDATE pet_emergency_cards
      SET
        show_medical_on_tag = COALESCE(${
          body.show_medical_on_tag === undefined ? null : body.show_medical_on_tag
        }, show_medical_on_tag),
        contact_mode = COALESCE(${body.contact_mode ?? null}, contact_mode),
        contact_value = COALESCE(${body.contact_value ?? null}, contact_value),
        blood_type = COALESCE(${body.blood_type ?? null}, blood_type),
        extra_notes = COALESCE(${body.extra_notes ?? null}, extra_notes),
        active = COALESCE(${body.active === undefined ? null : body.active}, active),
        updated_at = now()
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      RETURNING id, pet_id, tag_token, show_medical_on_tag, contact_mode, contact_value,
                blood_type, extra_notes, active
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }
    return Response.json({ card: updated[0] });
  } catch (e) {
    console.error("[PATCH /api/emergency-card] Error:", e?.message);
    return Response.json({ error: "Failed to update emergency card" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedGET as GET, wrappedPATCH as PATCH };
