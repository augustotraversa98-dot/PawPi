import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { buildBookingIcs } from "@/app/api/utils/ics";

// GET /api/calendar/booking/[id].ics — owner-scoped ICS export of a single booking
// (ticket 2.79). Every booking (vet/grooming/walking/daycare/sitting/transport/
// telehealth) is a vet_appointments row, so this is the one cross-platform export: it
// downloads a standard .ics that opens in Apple/Google Calendar, on Android/desktop/email.
//
// SECURITY: server-side only, holds no secret. Returns ONLY the signed-in owner's own
// booking (owner_user_id = the caller's user_profiles.id) — 404 for anyone else's.
//
// The route path is `[id]` so the param may carry a trailing `.ics` (the requested
// filename, e.g. /api/calendar/booking/42.ics) — we strip it. DB is porsager's
// tagged-template `sql`; the date/time are cast to text so they reach the pure builder
// as plain "YYYY-MM-DD" / "HH:MM:SS" strings (no driver Date-zone ambiguity).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const id = String(params.id).replace(/\.ics$/i, "");

    const rows = await sql`
      SELECT
        id,
        title,
        appointment_date::text AS appointment_date,
        appointment_time::text AS appointment_time,
        clinic,
        veterinarian,
        reason_for_visit,
        notes
      FROM vet_appointments
      WHERE id = ${id}
        AND owner_user_id = ${userId}
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const ics = buildBookingIcs(rows[0]);
    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="booking-${rows[0].id}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/calendar/booking/[id].ics] Error:", error.message);
    return Response.json({ error: "Failed to export booking" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
