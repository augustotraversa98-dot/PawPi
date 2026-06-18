import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// A single lost report + its sightings (ticket 2.48). The report is visible if active (any
// authed) or owned by the caller; sightings come back RLS-scoped (owner sees all; a reporter
// their own).

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
    const reportId = parseInt(params.id);

    const reports = await sql`
      SELECT r.*, p.name AS pet_name, p.avatar_url AS pet_avatar, p.breed AS pet_breed,
             up.username AS owner_username
      FROM lost_reports r
      JOIN pets p ON p.id = r.pet_id
      JOIN user_profiles up ON up.id = r.owner_user_id
      WHERE r.id = ${reportId}
    `;
    if (reports.length === 0) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    const sightings = await sql`
      SELECT s.id, s.lat, s.lng, s.note, s.photo_url, s.created_at,
             up.username AS reporter_username
      FROM lost_sightings s
      LEFT JOIN user_profiles up ON up.id = s.reporter_user_id
      WHERE s.lost_report_id = ${reportId}
      ORDER BY s.created_at DESC
    `;

    return Response.json({ report: reports[0], sightings });
  } catch (error) {
    console.error("[GET /api/lost-reports/[id]] Error:", error.message);
    return Response.json({ error: "Failed to load report" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
