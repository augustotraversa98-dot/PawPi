import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// /api/pets/[id]/pack-streaks — shared "pack" streaks between two dog friends (unit E7,
// docs/pet-owner-engagement.md). A pack advances only when BOTH pets close their ring on the same
// owner-tz day; a "boop" is a friendly nudge to a friend whose ring isn't closed yet.
//
// Every cross-owner read/write goes through a SECURITY DEFINER helper (migration 0097) because pets +
// pet_care_days are owner-scoped: the caller can't read a friend's pet, see whether they closed their
// ring, or notify them directly. DEGRADES CLEANLY pre-migration (missing table/fn -> list empty,
// actions return a friendly 503, never a 500).

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isIntId = (v) => Number.isInteger(v) || /^\d+$/.test(String(v ?? ""));

async function requireOwnedPet(session, petIdRaw) {
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  if (!isIntId(petIdRaw)) return { error: "Pet not found", status: 404 };
  const ownerUserId = await resolveUserId(session.user.id);
  if (ownerUserId === null) return { error: "User profile not found", status: 404 };
  const petId = parseInt(petIdRaw, 10);
  const owned = await sql`SELECT 1 FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId} LIMIT 1`;
  if (owned.length === 0) return { error: "Pet not found", status: 404 };
  return { ownerUserId, petId };
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    const gate = await requireOwnedPet(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId, petId } = gate;

    let packs = [];
    try {
      await withSavepoint(async () => {
        packs = await sql`SELECT * FROM app_pack_streaks_for_pet(${petId}, ${ownerUserId})`;
      });
    } catch (e) {
      if (!isMissingSchema(e)) throw e; // pre-migration -> empty
    }
    return Response.json({ pack_streaks: packs });
  } catch (error) {
    console.error("[GET /api/pets/[id]/pack-streaks] ERROR:", error.message);
    return Response.json({ error: "Failed to load pack streaks" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    const gate = await requireOwnedPet(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId, petId } = gate;

    const body = (await request.json().catch(() => ({}))) ?? {};
    const action = body?.action;

    if (action === "request") {
      const handle = String(body.partner_handle ?? "").replace(/^@/, "").trim();
      if (!handle) return Response.json({ error: "A partner @handle is required" }, { status: 400 });
      let packId = null;
      try {
        await withSavepoint(async () => {
          const [row] = await sql`SELECT app_request_pack_streak(${petId}, ${ownerUserId}, ${handle}) AS id`;
          packId = row?.id ?? null;
        });
      } catch (e) {
        if (!isMissingSchema(e)) throw e;
        return Response.json({ error: "Pack streaks aren't available yet", degraded: true }, { status: 503 });
      }
      if (packId == null) {
        return Response.json(
          { error: "Couldn't start that pack — check the @handle, or a pack may already exist" },
          { status: 409 },
        );
      }
      return Response.json({ ok: true, pack_id: packId });
    }

    if (action === "accept" || action === "end" || action === "boop") {
      if (!isIntId(body.pack_id)) return Response.json({ error: "pack_id is required" }, { status: 400 });
      const packId = parseInt(body.pack_id, 10);

      // The pack must involve this pet (participant scope) — the RLS-visible row proves it.
      const [pack] = await sql`
        SELECT id, status FROM pet_pack_streaks
        WHERE id = ${packId} AND (requester_pet_id = ${petId} OR receiver_pet_id = ${petId})
        LIMIT 1
      `.catch((e) => {
        if (isMissingSchema(e)) return [];
        throw e;
      });
      if (!pack) return Response.json({ error: "Pack streak not found" }, { status: 404 });

      if (action === "accept") {
        let ok = false;
        try {
          await withSavepoint(async () => {
            const [row] = await sql`SELECT app_accept_pack_streak(${packId}, ${ownerUserId}) AS ok`;
            ok = row?.ok === true;
          });
        } catch (e) {
          if (!isMissingSchema(e)) throw e;
          return Response.json({ error: "Pack streaks aren't available yet", degraded: true }, { status: 503 });
        }
        if (!ok) return Response.json({ error: "Couldn't accept this pack" }, { status: 409 });
        return Response.json({ ok: true });
      }

      if (action === "end") {
        // Either participant may end the pack. Plain UPDATE under the participant RLS policy.
        await sql`UPDATE pet_pack_streaks SET status = 'ended', updated_at = now() WHERE id = ${packId}`;
        return Response.json({ ok: true });
      }

      if (action === "boop") {
        let result = "not_found";
        try {
          await withSavepoint(async () => {
            const [row] = await sql`SELECT app_pack_boop(${packId}, ${ownerUserId}) AS result`;
            result = row?.result ?? "not_found";
          });
        } catch (e) {
          if (!isMissingSchema(e)) throw e;
          return Response.json({ error: "Pack streaks aren't available yet", degraded: true }, { status: 503 });
        }
        return Response.json({ ok: result === "sent", result });
      }
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/pets/[id]/pack-streaks] ERROR:", error.message);
    return Response.json({ error: "Failed to update pack streak" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
