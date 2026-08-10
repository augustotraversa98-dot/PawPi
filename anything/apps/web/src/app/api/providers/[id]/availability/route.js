import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALLOWED_CAPABILITIES,
} from "@/app/api/utils/providerAuth";
import { invalidSlotMinutes } from "@/app/api/utils/providerValidation";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import {
  generateSlotsForDate,
  subtractTaken,
  DEFAULT_TIME_ZONE,
} from "@/app/api/utils/availability";
import { getCalendarSync } from "@/app/api/utils/calendarSync";

// Provider availability — generalized booking (ticket 2.4).
//   GET  — OWNER-facing read of OPEN bookable slots for a PUBLISHED provider over a
//          date range. Authorization is "any authed user" (the public booking surface,
//          like /discover): we resolve identity but do NOT require provider membership.
//          Slots = the provider_availability windows MINUS already-booked slots MINUS
//          external-calendar busy windows (the 2-way sync pull, stubbed). Empty windows
//          → empty slots (no fake data — empty state on the client).
//   POST — owner|admin sets an availability WINDOW (a weekly bookable template), mirroring
//          the locations/services config write shape (requireProviderRole default gate).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`.

// Cap a date-range read so a caller can't ask for thousands of days at once.
const MAX_RANGE_DAYS = 31;

/** Add `n` days to a 'YYYY-MM-DD' string, returning a 'YYYY-MM-DD' string. */
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Public read: the provider must exist AND be published (same gate as /book). time_zone
    // (0076) is the zone the window wall-clock times are local to — threaded into slot
    // generation so "09:00" means 09:00 for the provider.
    const providerRows = await sql`
      SELECT id, status, time_zone FROM providers WHERE id = ${providerId}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    const timeZone = providerRows[0].time_zone || DEFAULT_TIME_ZONE;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to") ?? from;
    const staffParam = searchParams.get("staff_user_id");
    const capability = searchParams.get("capability");
    const serviceParam = searchParams.get("service_id");
    const durationParam = searchParams.get("duration");
    const staffUserId = staffParam != null ? parseInt(staffParam, 10) : null;

    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return Response.json(
        { error: "from (and optional to) must be YYYY-MM-DD dates" },
        { status: 400 },
      );
    }
    if (to < from) {
      return Response.json({ error: "to must be on or after from" }, { status: 400 });
    }

    // Load the active windows for this provider. Filter to the requested staff member
    // (or provider-wide windows, staff_user_id NULL) and capability (or all-capability
    // windows, capability NULL) — the two tagged-template variants keep us off the
    // sql(string,array) gotcha.
    const windows =
      staffUserId != null
        ? await sql`
            SELECT weekday, start_time, end_time, slot_minutes, staff_user_id, capability
            FROM provider_availability
            WHERE provider_id = ${providerId}
              AND active = true
              AND (staff_user_id = ${staffUserId} OR staff_user_id IS NULL)
              AND (${capability}::text IS NULL OR capability = ${capability} OR capability IS NULL)
          `
        : await sql`
            SELECT weekday, start_time, end_time, slot_minutes, staff_user_id, capability
            FROM provider_availability
            WHERE provider_id = ${providerId}
              AND active = true
              AND (${capability}::text IS NULL OR capability = ${capability} OR capability IS NULL)
          `;

    // SERVICE-DURATION SLOTS. When a service_id (preferred) or a raw `duration` is given, slots
    // are generated at the SERVICE's own duration (COALESCE(duration_min, 30)) instead of each
    // window's slot_minutes — a 30-min service shows 30-min slots, a 1-hour service 1-hour slots.
    // Neither given → stepMinutes stays null and generation keeps the per-window slot_minutes
    // behavior (backward-compatible before the mobile picker/enforcement pass it).
    let stepMinutes = null;
    if (serviceParam != null) {
      const serviceId = parseInt(serviceParam, 10);
      if (Number.isFinite(serviceId)) {
        const svc = await sql`
          SELECT duration_min FROM provider_services
          WHERE id = ${serviceId} AND provider_id = ${providerId}
        `;
        if (svc.length > 0) {
          stepMinutes = Number(svc[0].duration_min) > 0 ? Number(svc[0].duration_min) : 30;
        }
      }
    }
    if (stepMinutes == null && durationParam != null) {
      const d = parseInt(durationParam, 10);
      if (Number.isFinite(d) && d > 0) stepMinutes = d;
    }
    const slotOptions = stepMinutes != null ? { stepMinutes } : {};

    // Load the already-taken slots in the range (live, slot-based bookings). A booking
    // with a staff filter only conflicts for that staff member.
    const rangeEnd = addDays(to, 1); // exclusive upper bound (whole `to` day)
    const taken =
      staffUserId != null
        ? await sql`
            SELECT start_at AS start, end_at AS end
            FROM vet_appointments
            WHERE provider_id = ${providerId}
              AND staff_user_id = ${staffUserId}
              AND deleted_at IS NULL
              AND booking_status = ANY (ARRAY['requested','confirmed'])
              AND start_at IS NOT NULL
              AND start_at >= ${from}
              AND start_at < ${rangeEnd}
          `
        : await sql`
            SELECT start_at AS start, end_at AS end
            FROM vet_appointments
            WHERE provider_id = ${providerId}
              AND deleted_at IS NULL
              AND booking_status = ANY (ARRAY['requested','confirmed'])
              AND start_at IS NOT NULL
              AND start_at >= ${from}
              AND start_at < ${rangeEnd}
          `;
    const takenSlots = taken.map((t) => ({
      start: new Date(t.start).toISOString(),
      end: t.end ? new Date(t.end).toISOString() : new Date(t.start).toISOString(),
    }));

    // 2-way sync (inbound, live API) — external busy windows to also subtract. Stub returns [].
    let externalBusy = [];
    try {
      externalBusy = await getCalendarSync().pullBusy({
        providerId,
        staffUserId,
        from,
        to,
      });
    } catch (syncErr) {
      console.error(
        "[GET /api/providers/[id]/availability] calendar pull (non-fatal):",
        syncErr.message,
      );
    }

    // IMPORTED ICS busy blocks (ticket 2.84) — the provider's synced Google/Outlook/Apple feeds.
    // Busy rows are owner/staff RLS-scoped, so the PUBLIC availability read goes through the DEFINER
    // app_provider_busy_windows (exposes only free/busy ranges for the viewed provider). Non-fatal.
    let importedBusy = [];
    try {
      const busyRows = await sql`
        SELECT starts_at AS start, ends_at AS end
        FROM app_provider_busy_windows(${providerId}, ${from}, ${rangeEnd})
      `;
      importedBusy = busyRows.map((r) => ({
        start: new Date(r.start).toISOString(),
        end: new Date(r.end).toISOString(),
      }));
    } catch (busyErr) {
      console.error(
        "[GET /api/providers/[id]/availability] imported busy (non-fatal):",
        busyErr.message,
      );
    }

    // Walk each date in the (capped) range, generate slots, subtract taken + busy.
    const days = [];
    let cursor = from;
    let guard = 0;
    while (cursor <= to && guard < MAX_RANGE_DAYS) {
      const open = subtractTaken(
        generateSlotsForDate(cursor, windows, timeZone, slotOptions),
        [...takenSlots, ...externalBusy, ...importedBusy],
      );
      days.push({ date: cursor, slots: open });
      cursor = addDays(cursor, 1);
      guard += 1;
    }

    // Return absolute-UTC slots plus the provider's zone so the client renders local time
    // consistently (each `date` is the provider-local calendar day; `slots[].start/end` are
    // UTC instants). PR-2's picker keys off `time_zone` for its day/slot labels.
    return Response.json({ time_zone: timeZone, availability: days });
  } catch (error) {
    console.error(
      "[GET /api/providers/[id]/availability] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to fetch availability" },
      { status: 500 },
    );
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Config write — owner|admin only (default requireProviderRole gate).
    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const {
      staff_user_id,
      capability,
      weekday,
      start_time,
      end_time,
      slot_minutes,
    } = body;

    if (
      weekday === undefined ||
      weekday === null ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6
    ) {
      return Response.json(
        { error: "weekday must be an integer 0 (Mon) – 6 (Sun)" },
        { status: 400 },
      );
    }
    if (!start_time || !end_time) {
      return Response.json(
        { error: "start_time and end_time are required (HH:MM)" },
        { status: 400 },
      );
    }
    if (!(start_time < end_time)) {
      return Response.json(
        { error: "end_time must be after start_time" },
        { status: 400 },
      );
    }
    if (
      capability !== undefined &&
      capability !== null &&
      !ALLOWED_CAPABILITIES.includes(capability)
    ) {
      return Response.json({ error: "Invalid capability" }, { status: 400 });
    }
    const slotError = invalidSlotMinutes(slot_minutes);
    if (slotError) {
      return Response.json({ error: slotError }, { status: 400 });
    }

    // If a staff member is named it must be ACTIVE staff of THIS provider.
    if (staff_user_id !== undefined && staff_user_id !== null) {
      const staffRows = await sql`
        SELECT id FROM provider_staff
        WHERE provider_id = ${providerId}
          AND user_profile_id = ${staff_user_id}
          AND status = 'active'
      `;
      if (staffRows.length === 0) {
        return Response.json(
          { error: "Staff member is not active for this provider" },
          { status: 400 },
        );
      }
    }

    const created = await sql`
      INSERT INTO provider_availability
        (provider_id, staff_user_id, capability, weekday, start_time, end_time, slot_minutes)
      VALUES (
        ${providerId},
        ${staff_user_id ?? null},
        ${capability ?? null},
        ${weekday},
        ${start_time},
        ${end_time},
        ${slot_minutes ?? 30}
      )
      RETURNING *
    `;

    return Response.json({ availability: created[0] }, { status: 201 });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[POST /api/providers/[id]/availability] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to create availability" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
