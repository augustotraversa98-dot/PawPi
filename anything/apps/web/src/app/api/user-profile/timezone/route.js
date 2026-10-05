import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { isNotifV2Enabled } from "@/app/api/utils/notifV2";
import { isValidTimeZone } from "@/app/api/utils/timezone";

// PUT /api/user-profile/timezone — persist the signed-in owner's IANA time zone (notifications v2, PR 3a).
//
// `user_profiles.timezone` (0094) was read by many routes (care ring, streaks, digest, win-back day
// boundaries) but written by none, so every owner behaved as America/Buenos_Aires. The app now reports the
// device zone here on app entry and when it changes.
//
// FLAG: with NOTIF_V2_ENABLED off this is a no-op that issues NO query (writing the column would shift
// every owner's day boundary, i.e. change production behaviour). With it on:
//   • the zone must look like an IANA name, be known to the JS runtime AND exist in pg_timezone_names (a zone
//     Postgres rejects would make every `AT TIME ZONE tz` consumer raise) — otherwise 400, nothing stored;
//   • no profile row -> 404 (the client simply re-syncs on its next app entry);
//   • consumers keep resolving COALESCE(timezone, 'America/Buenos_Aires'), so a user who never syncs is
//     unchanged.

async function PUT(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isNotifV2Enabled()) {
    return Response.json({ ok: true, skipped: "disabled" });
  }

  const body = await request.json().catch(() => ({}));
  const timezone = typeof body?.timezone === "string" ? body.timezone.trim() : "";
  if (!isValidTimeZone(timezone)) {
    return Response.json({ error: "timezone must be an IANA zone name" }, { status: 400 });
  }

  try {
    const known = await sql`SELECT name FROM pg_timezone_names WHERE name = ${timezone} LIMIT 1`;
    if (known.length === 0) {
      return Response.json({ error: "Unknown timezone" }, { status: 400 });
    }
    const rows = await sql`
      UPDATE user_profiles
      SET timezone = ${timezone}, updated_at = NOW()
      WHERE auth_user_id = ${session.user.id}
      RETURNING timezone
    `;
    if (rows.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    return Response.json({ ok: true, timezone: rows[0].timezone });
  } catch (error) {
    // Column absent (cannot happen after 0094, but never turn it into an app error).
    if (error?.code === "42703" || error?.code === "42P01") {
      return Response.json({ ok: true, skipped: "not applied" });
    }
    console.error("[PUT /api/user-profile/timezone] Error:", error?.message);
    return Response.json({ error: "Failed to update timezone" }, { status: 500 });
  }
}

const wrappedPUT = withRequestContext(PUT);
export { wrappedPUT as PUT };
