import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { safeNotify } from "@/app/api/utils/notify";

// walk-requests — the shared "request a walk" model (ticket C1; C2 reuses it for broadcast).
//   POST /api/walk-requests            — an OWNER creates a request for a SPECIFIC walker
//                                        (target_provider_id required in C1). Notifies that
//                                        provider's active staff (walk_request_targeted).
//   GET  /api/walk-requests[?mine=1]   — the caller's OWN requests + live status.
//
// Degrade clean: if walk_requests is missing (unmigrated prod) create returns a friendly 503 and
// list returns []; never a 500. Expiry is evaluated at READ time (a request is live iff
// status='open' AND expires_at > now()). DB is porsager's tagged-template `sql`.

// A compact JSON body the mobile bell renders in the recipient's language.
function walkRequestNotifyBody({ when_type, note }) {
  return JSON.stringify({ when_type: when_type ?? "now", note: note ?? null });
}

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

    const body = (await request.json()) ?? {};
    const {
      pet_id,
      target_provider_id,
      pickup_lat,
      pickup_lng,
      note,
      when_type,
      scheduled_at,
    } = body;

    const petId = Number(pet_id);
    if (!Number.isInteger(petId)) {
      return Response.json({ error: "pet_id is required" }, { status: 400 });
    }
    // C1 is a DIRECT request — a specific walker is required. C2 relaxes this for broadcast.
    const targetProviderId = Number(target_provider_id);
    if (!Number.isInteger(targetProviderId)) {
      return Response.json(
        { error: "target_provider_id is required" },
        { status: 400 },
      );
    }
    const resolvedWhen = when_type === "scheduled" ? "scheduled" : "now";
    if (resolvedWhen === "scheduled" && !scheduled_at) {
      return Response.json(
        { error: "scheduled_at is required for a scheduled request" },
        { status: 400 },
      );
    }

    // I must OWN the pet.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json({ error: "You do not own this pet" }, { status: 403 });
    }

    // The target must exist, be published, and actually be a WALKER.
    const provRows = await sql`
      SELECT id FROM providers WHERE id = ${targetProviderId} AND status = 'published'
    `;
    if (provRows.length === 0) {
      return Response.json({ error: "Walker not found" }, { status: 404 });
    }
    const capRows = await sql`
      SELECT provider_has_capability(${targetProviderId}, 'walker') AS has
    `;
    if (!capRows?.[0]?.has) {
      return Response.json(
        { error: "This provider is not a walker" },
        { status: 400 },
      );
    }

    let created;
    try {
      created = await sql`
        INSERT INTO walk_requests (
          owner_user_id, pet_id, target_provider_id,
          pickup_lat, pickup_lng, note, when_type, scheduled_at, status
        ) VALUES (
          ${userId}, ${petId}, ${targetProviderId},
          ${pickup_lat ?? null}, ${pickup_lng ?? null}, ${note ?? null},
          ${resolvedWhen}, ${resolvedWhen === "scheduled" ? scheduled_at : null}, 'open'
        )
        RETURNING *
      `;
    } catch (e) {
      // Unmigrated prod (no table) → the feature isn't available yet.
      if (e?.code === "42P01") {
        return Response.json(
          { error: "Walk requests are not available yet" },
          { status: 503 },
        );
      }
      throw e;
    }

    // Notify the target provider's active staff so the walker sees the incoming request.
    // Fire-and-forget (safeNotify never throws); a solo walker has exactly one staffer.
    try {
      const staff = await sql`
        SELECT user_profile_id
        FROM provider_staff
        WHERE provider_id = ${targetProviderId} AND status = 'active'
      `;
      for (const s of staff) {
        await safeNotify({
          recipient: s.user_profile_id,
          actor: userId,
          type: "walk_request_targeted",
          subjectRef: String(created[0].id),
          body: walkRequestNotifyBody({ when_type: resolvedWhen, note }),
        });
      }
    } catch (notifyErr) {
      console.error("[POST /api/walk-requests] notify (non-fatal):", notifyErr?.message);
    }

    return Response.json({ request: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/walk-requests] Error:", error?.message);
    return Response.json({ error: "Failed to create walk request" }, { status: 500 });
  }
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

    let requests = [];
    try {
      requests = await sql`
        SELECT
          wr.*,
          (wr.status = 'open' AND wr.expires_at > now()) AS is_live,
          tp.name AS target_provider_name,
          ap.name AS accepted_provider_name,
          pet.name AS pet_name
        FROM walk_requests wr
        LEFT JOIN providers tp ON tp.id = wr.target_provider_id
        LEFT JOIN providers ap ON ap.id = wr.accepted_provider_id
        LEFT JOIN pets pet ON pet.id = wr.pet_id
        WHERE wr.owner_user_id = ${userId}
        ORDER BY wr.created_at DESC
      `;
    } catch (e) {
      if (e?.code === "42P01") return Response.json({ requests: [] });
      throw e;
    }

    return Response.json({ requests });
  } catch (error) {
    console.error("[GET /api/walk-requests] Error:", error?.message);
    return Response.json({ error: "Failed to load walk requests" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
