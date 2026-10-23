import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
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
//   • the zone must look like an IANA name, be known to the JS runtime AND be accepted by Postgres (a zone
//     Postgres rejects would make every `AT TIME ZONE tz` consumer raise) — otherwise 400, nothing stored.
//     PERF: Postgres is asked via `timezone(zone, now())`, not `SELECT ... FROM pg_timezone_names`, which scans the
//     zoneinfo directory on every call (912 ms mean, 1.2 s max on production); accepted zones are remembered
//     in process, so a zone costs the check at most once per server start;
//   • no profile row -> 404 (the client simply re-syncs on its next app entry);
//   • consumers keep resolving COALESCE(timezone, 'America/Buenos_Aires'), so a user who never syncs is
//     unchanged.

// Zones Postgres has already accepted in this process (a handful of distinct values in practice).
const pgAcceptedZones = new Set();

// True when Postgres accepts `tz` in AT TIME ZONE. `timezone()` raises 22023 for an unknown zone; the
// savepoint keeps that expected error from aborting the request transaction. Any other error propagates.
async function postgresAcceptsZone(tz) {
  if (pgAcceptedZones.has(tz)) return true;
  try {
    await withSavepoint(async () => {
      await sql`SELECT timezone(${tz}, now())`;
    });
  } catch (error) {
    if (error?.code === "22023") return false;
    throw error;
  }
  pgAcceptedZones.add(tz);
  return true;
}

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
    if (!(await postgresAcceptsZone(timezone))) {
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
