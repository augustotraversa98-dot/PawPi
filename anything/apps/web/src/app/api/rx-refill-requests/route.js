import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/rx-refill-requests — the OWNER files a refill request on their OWN active Rx (ticket
// 2.53). RLS (rx_refill_requests_owner_insert via app_owns_active_rx) is the backstop: the request
// is accepted only when the prescription is the caller's, active, and has refills remaining. The
// owner never writes prescription fields — the decrement happens via the vet's decide_rx_refill.
//
// DB is porsager's tagged-template `sql`.
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
    const prescriptionId = body.prescription_id;
    if (!prescriptionId) {
      return Response.json({ error: "prescription_id is required" }, { status: 400 });
    }

    // Resolve the pet from the owner's prescription (RLS scopes the read to the owner).
    const rxRows = await sql`
      SELECT pet_id FROM prescriptions
      WHERE id = ${prescriptionId} AND owner_user_id = ${userId}
    `;
    if (rxRows.length === 0) {
      return Response.json({ error: "Prescription not found" }, { status: 404 });
    }

    // RLS WITH CHECK (app_owns_active_rx) enforces active + refills-remaining; a stale request is
    // rejected by the DB. Surface that as a clean 400.
    const created = await sql`
      INSERT INTO rx_refill_requests (prescription_id, pet_id, owner_user_id, note)
      VALUES (${prescriptionId}, ${rxRows[0].pet_id}, ${userId}, ${body.note ?? null})
      RETURNING *
    `;
    return Response.json({ request: created[0] }, { status: 201 });
  } catch (e) {
    if (/row-level security/i.test(e?.message ?? "")) {
      return Response.json(
        { error: "This prescription has no refills remaining or isn't active" },
        { status: 400 },
      );
    }
    console.error("[POST /api/rx-refill-requests] Error:", e?.message);
    return Response.json({ error: "Failed to request refill" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
