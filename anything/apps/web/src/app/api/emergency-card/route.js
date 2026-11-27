import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import {
  CHANNEL_FLAGS,
  CHANNEL_VALUES,
  emergencyContactChannels,
} from "@/app/api/utils/emergencyContactChannels";
import { estimateColumnsOf, presentPublicPet } from "@/app/api/utils/petAge";

// /api/emergency-card — the OWNER's Emergency Card (ticket 2.51). Owner-scoped (RLS R2c-style:
// pet_emergency_cards is owner FOR ALL). The PUBLIC reads are elsewhere (/api/public/emergency/*
// via SECURITY DEFINER fns); this route is the authenticated owner surface only.
//
// GET ?petId= : lazily create the card on first open (a permanent tag_token) and return the card
//   settings + the assembled medical preview (from the LIVE owner-scoped sources — no duplication)
//   + active vet links + the current lost status.
// PATCH      : update the owner-controlled settings (show_medical_on_tag,
//   show_emergency_contact_on_tag, the finder contact, blood_type, extra_notes, active).
//
// Finder contact, two request shapes (never both in one request):
//   • contact_phone_enabled, contact_email_enabled, contact_message_enabled, contact_phone, contact_email (0152):
//     the phone and email switches. The database rewrites contact_mode / contact_value to match.
//   • contact_mode / contact_value: the single choice older app builds send. It replaces the whole choice (the
//     database clears the 0152 fields), so these columns are named in an UPDATE only when the request has them.
// On a database without 0152 the five new fields come back null and trying to change them answers 503.
//
// show_emergency_contact_on_tag (0146, default off) is read through to_jsonb, so the route also works on a
// database without the column: the value is then null, which is how the app knows to hide the switch, and
// trying to change it answers 503.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").

const CONTACT_MODES = ["relay", "phone", "email", "none"];

// The owner's card: the whole row is read as `_row` so the 0152 fields can be described on any database.
function presentCard({ _row, ...card }) {
  return { ...card, ...emergencyContactChannels(_row) };
}

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

    // Access check (RLS would also scope, but a clean 404 is friendlier): the OWNER, or an active, unexpired grantee
    // (family or caregiver may READ the emergency picture — owner decision 2, 2026-11-23). owner_user_id is selected only to
    // tell the two apart and is stripped from the response so the owner's payload is unchanged.
    const pet = await sql`
      SELECT id, name, species, breed, age_years, age_months, gender, avatar_url, owner_user_id AS _pet_owner,
             to_jsonb(pets) AS _row
      FROM pets WHERE id = ${petId} AND (owner_user_id = ${ownerUserId} OR app_user_has_pet_access(id))
    `;
    if (pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    // `_row` only supplies the birthday and the estimate columns for the computed age; neither is part of the response.
    const { _pet_owner: petOwnerId, _row, ...columns } = pet[0];
    const { birthday: _birthday, ...cardPet } = presentPublicPet({
      ...columns,
      birthday: _row?.birthday ?? null,
      ...estimateColumnsOf(_row),
    });
    const isOwner = petOwnerId === ownerUserId;

    let card;
    if (isOwner) {
      // Lazily create the card (one per pet) with a permanent tag token. ON CONFLICT keeps the
      // existing row + its stable tag_token (a printed tag must never break).
      const tagToken = crypto.randomUUID().replace(/-/g, "");
      const cardRows = await sql`
        INSERT INTO pet_emergency_cards (pet_id, owner_user_id, tag_token)
        VALUES (${petId}, ${ownerUserId}, ${tagToken})
        ON CONFLICT (pet_id) DO UPDATE SET updated_at = now()
        RETURNING id, pet_id, tag_token, show_medical_on_tag, contact_mode, contact_value,
                  blood_type, extra_notes, active,
                  to_jsonb(pet_emergency_cards) -> 'show_emergency_contact_on_tag' AS show_emergency_contact_on_tag,
                  to_jsonb(pet_emergency_cards) AS _row
      `;
      card = presentCard(cardRows[0]);
    } else {
      // A grantee only READS: never create the card (that mints the permanent tag token — an owner act). The tag token and
      // contact settings are the owner's to manage, so a grantee gets the card WITHOUT its token/contact fields.
      const cardRows = await sql`
        SELECT id, pet_id, show_medical_on_tag, blood_type, extra_notes, active
        FROM pet_emergency_cards WHERE pet_id = ${petId}
      `;
      card = cardRows[0] ?? null;
    }

    // Assemble the medical preview from the LIVE owner-scoped sources (owner can read them).
    const mp = await sql`
      SELECT microchip_id, spayed_neutered_status, primary_vet_name, primary_clinic_name,
             vet_phone, emergency_contact_name, emergency_contact_phone, medical_notes
      FROM pet_medical_profiles
      WHERE pet_id = ${petId} AND owner_user_id = ${petOwnerId} AND deleted_at IS NULL
    `;
    const allergies = await sql`
      SELECT allergen, severity, reaction FROM pet_allergies
      WHERE pet_id = ${petId} AND owner_user_id = ${petOwnerId} ORDER BY id
    `;
    const conditions = await sql`
      SELECT condition, status FROM pet_conditions
      WHERE pet_id = ${petId} AND owner_user_id = ${petOwnerId} ORDER BY id
    `;
    const lost = await sql`
      SELECT id, reward, last_seen_area FROM lost_reports
      WHERE pet_id = ${petId} AND owner_user_id = ${petOwnerId} AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `;
    // Vet share links (they carry bearer tokens) are an OWNER-only surface: a grantee never sees them.
    const links = isOwner
      ? await sql`
          SELECT id, token, scope, expires_at, created_at FROM pet_emergency_share_links
          WHERE pet_id = ${petId} AND owner_user_id = ${petOwnerId} AND revoked_at IS NULL
          ORDER BY created_at DESC
        `
      : [];

    return Response.json({
      card,
      pet: cardPet,
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
    const showKin = body.show_emergency_contact_on_tag;
    if (showKin !== undefined && typeof showKin !== "boolean") {
      return Response.json({ error: "show_emergency_contact_on_tag must be a boolean" }, { status: 400 });
    }
    if (CHANNEL_FLAGS.some((f) => body[f] !== undefined && typeof body[f] !== "boolean")) {
      return Response.json({ error: `${CHANNEL_FLAGS.join(", ")} must be booleans` }, { status: 400 });
    }
    if (CHANNEL_VALUES.some((f) => body[f] !== undefined && typeof body[f] !== "string")) {
      return Response.json({ error: `${CHANNEL_VALUES.join(", ")} must be strings` }, { status: 400 });
    }
    const setsChannels = [...CHANNEL_FLAGS, ...CHANNEL_VALUES].some((f) => body[f] !== undefined);
    const setsMode = body.contact_mode !== undefined || body.contact_value !== undefined;
    if (setsChannels && setsMode) {
      return Response.json(
        { error: "Send either contact_mode / contact_value or the channel fields, not both" },
        { status: 400 },
      );
    }
    const ownerUserId = await resolveOwner(session);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Its own statement (0152 columns); same owner scope. COALESCE keeps the unspecified ones.
    if (setsChannels) {
      try {
        await withSavepoint(
          () => sql`
            UPDATE pet_emergency_cards
            SET
              contact_phone_enabled = COALESCE(${body.contact_phone_enabled ?? null}, contact_phone_enabled),
              contact_email_enabled = COALESCE(${body.contact_email_enabled ?? null}, contact_email_enabled),
              contact_message_enabled = COALESCE(${body.contact_message_enabled ?? null}, contact_message_enabled),
              contact_phone = COALESCE(${body.contact_phone ?? null}, contact_phone),
              contact_email = COALESCE(${body.contact_email ?? null}, contact_email),
              updated_at = now()
            WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
          `,
        );
      } catch (e) {
        if (e?.code !== "42703") throw e; // 42703 undefined_column = 0152 not applied yet
        return Response.json(
          { error: "This setting is not available yet", code: "contact_channels_unavailable" },
          { status: 503 },
        );
      }
    }

    // Its own statement (0146 column): a database without it must not break the other settings. Same owner scope.
    if (showKin !== undefined) {
      try {
        await withSavepoint(
          () => sql`
            UPDATE pet_emergency_cards SET show_emergency_contact_on_tag = ${showKin}, updated_at = now()
            WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
          `,
        );
      } catch (e) {
        if (e?.code !== "42703") throw e; // 42703 undefined_column = 0146 not applied yet
        return Response.json(
          { error: "This setting is not available yet", code: "finder_settings_unavailable" },
          { status: 503 },
        );
      }
    }

    // Only when asked: naming these columns replaces the whole finder choice (see the top of the file).
    if (setsMode) {
      await sql`
        UPDATE pet_emergency_cards
        SET
          contact_mode = COALESCE(${body.contact_mode ?? null}, contact_mode),
          contact_value = COALESCE(${body.contact_value ?? null}, contact_value),
          updated_at = now()
        WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      `;
    }

    // COALESCE keeps unspecified fields. The owner_user_id WHERE + RLS scope the row; a
    // non-owner updates ZERO rows → 404.
    const updated = await sql`
      UPDATE pet_emergency_cards
      SET
        show_medical_on_tag = COALESCE(${
          body.show_medical_on_tag === undefined ? null : body.show_medical_on_tag
        }, show_medical_on_tag),
        blood_type = COALESCE(${body.blood_type ?? null}, blood_type),
        extra_notes = COALESCE(${body.extra_notes ?? null}, extra_notes),
        active = COALESCE(${body.active === undefined ? null : body.active}, active),
        updated_at = now()
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      RETURNING id, pet_id, tag_token, show_medical_on_tag, contact_mode, contact_value,
                blood_type, extra_notes, active,
                to_jsonb(pet_emergency_cards) -> 'show_emergency_contact_on_tag' AS show_emergency_contact_on_tag,
                to_jsonb(pet_emergency_cards) AS _row
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }
    return Response.json({ card: presentCard(updated[0]) });
  } catch (e) {
    console.error("[PATCH /api/emergency-card] Error:", e?.message);
    return Response.json({ error: "Failed to update emergency card" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedGET as GET, wrappedPATCH as PATCH };
