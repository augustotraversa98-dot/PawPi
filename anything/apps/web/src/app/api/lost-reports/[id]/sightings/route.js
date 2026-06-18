import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Report a sighting on a lost pet (ticket 2.48). Any authed user can submit; RLS pins the
// reporter to the caller and requires the report to be active. On success, best-effort notify
// the report owner.

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const reportId = parseInt(params.id);
    const body = await request.json();
    const note = (body.note || "").trim() || null;
    const lat = body.lat == null || body.lat === "" ? null : Number(body.lat);
    const lng = body.lng == null || body.lng === "" ? null : Number(body.lng);
    const photoUrl = body.photoUrl || null;

    if (!note && lat == null && !photoUrl) {
      return Response.json({ error: "Add a note, location, or photo" }, { status: 400 });
    }

    let created;
    try {
      created = await sql`
        INSERT INTO lost_sightings (lost_report_id, reporter_user_id, lat, lng, note, photo_url)
        VALUES (${reportId}, ${userId}, ${lat}, ${lng}, ${note}, ${photoUrl})
        RETURNING *
      `;
    } catch (e) {
      // RLS WITH CHECK fails (e.g. report not active) → friendly 404.
      if (String(e.message).match(/row-level security/i)) {
        return Response.json({ error: "This report is not accepting sightings" }, { status: 404 });
      }
      throw e;
    }

    // Best-effort: notify the report owner. Never blocks the sighting.
    try {
      const owner = await sql`SELECT owner_user_id FROM lost_reports WHERE id = ${reportId}`;
      if (owner.length > 0 && owner[0].owner_user_id !== userId) {
        await sql`
          SELECT app_notify(${owner[0].owner_user_id}, ${userId}, 'lost_alert', ${String(reportId)},
            'New sighting reported for your lost pet')
        `;
      }
    } catch (notifyErr) {
      console.error("[lost-sightings] owner notify failed (non-blocking):", notifyErr.message);
    }

    return Response.json({ sighting: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/lost-reports/[id]/sightings] Error:", error.message);
    return Response.json({ error: "Failed to report sighting" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
