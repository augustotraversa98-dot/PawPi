import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { ALLOWED_CAPABILITIES } from "@/app/api/utils/providerAuth";
import { getCalendarSync } from "@/app/api/utils/calendarSync";
import {
  generateSlotsForDate,
  isSlotBookable,
  composeIso,
  timeToMinutes,
  DEFAULT_TIME_ZONE,
} from "@/app/api/utils/availability";

/** Add `n` days to a 'YYYY-MM-DD' string, returning a 'YYYY-MM-DD' string. */
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// POST /api/providers/[id]/book — the pet's OWNER books this provider.
// Ticket 6a (vet) GENERALIZED by ticket 2.4 (docs/phase2-tickets/2.4-generalized-
// booking.md): the same route now books ANY published provider+capability, not just
// vet. The booking is a vet_appointments row (the generalized booking table — see
// 0030's PATH-(a) decision) carrying provider context (provider_id/location/service),
// a capability (default 'vet'), an optional slot (start_at/end_at) + recurrence rule,
// an optional deposit link (order_id from 2.3), source='owner', booking_status=
// 'requested'. An optional meet_and_greet flag (2.9) tags a booking as the lightweight
// pre-engagement INTRO step (owner + sitter align over chat before the real booking);
// it defaults false so every non-sitter booking is unchanged.
//
// This is an OWNER-context route, NOT a provider one: authorization is pet
// ownership (WHERE owner_user_id = me), not provider_staff membership — so it uses
// resolveUserId but NOT requireProviderRole. The created row is a normal
// vet_appointments row with the same reminder fields (reminder_enabled left at the
// table default), so the existing reminder engine keeps working unchanged — a vet
// booking (capability 'vet', no slot) is byte-for-byte the pre-2.4 behaviour.
//
// DOUBLE-BOOK: when a slot (start_at/end_at) + staff are given, the route checks the
// staff member is free before inserting (clean 409); the 0030 partial-unique index is
// the last-line race guard. A calendar-sync hook (stub) is invoked post-insert.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`.
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

    const body = (await request.json()) ?? {};
    const {
      petId,
      appointment_date,
      appointment_time,
      service_id,
      provider_location_id,
      staff_user_id,
      reason_for_visit,
      notes,
      title,
      capability,
      start_at,
      end_at,
      recurrence_rule,
      order_id,
      meet_and_greet,
      calendar_event_id,
    } = body;

    if (!petId || !appointment_date || !appointment_time) {
      return Response.json(
        {
          error:
            "petId, appointment_date, and appointment_time are required",
        },
        { status: 400 },
      );
    }

    // capability defaults to 'vet' (the pre-2.4 behaviour). When given it must be a
    // known capability AND the provider must actually HOLD it (you can only book a
    // service a provider offers). A bad value is a clean 400, not a 500/constraint error.
    const resolvedCapability = capability ?? "vet";
    if (!ALLOWED_CAPABILITIES.includes(resolvedCapability)) {
      return Response.json(
        { error: "Invalid capability" },
        { status: 400 },
      );
    }

    // I must OWN the pet — cannot book for a pet I don't own.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "You do not own this pet" },
        { status: 403 },
      );
    }

    // Provider must exist AND be published — cannot book a draft/unknown provider.
    // time_zone (0076) is read here for the PR-3 slot-enforcement composition below.
    const providerRows = await sql`
      SELECT id, name, status, time_zone FROM providers WHERE id = ${providerId}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }
    const provider = providerRows[0];

    // CAPABILITY GATE (2.4). The provider must HOLD the requested capability. Only
    // checked for a NON-vet booking: a plain vet booking (the pre-2.4 default) is
    // unchanged — no extra query, no behaviour change for the vet path. From 2.1 on a
    // service module gates on a CAPABILITY, never provider_type.
    if (resolvedCapability !== "vet") {
      const capRows = await sql`
        SELECT 1 FROM provider_capabilities
        WHERE provider_id = ${providerId} AND capability = ${resolvedCapability}
      `;
      if (capRows.length === 0) {
        return Response.json(
          { error: "Provider does not offer this capability" },
          { status: 400 },
        );
      }
    }

    // If a service is named it must belong to THIS provider and be active.
    let service = null;
    if (service_id !== undefined && service_id !== null) {
      const serviceRows = await sql`
        SELECT id, name, active FROM provider_services
        WHERE id = ${service_id} AND provider_id = ${providerId}
      `;
      if (serviceRows.length === 0 || serviceRows[0].active !== true) {
        return Response.json(
          { error: "Invalid service for this provider" },
          { status: 400 },
        );
      }
      service = serviceRows[0];
    }

    // If a location is named it must belong to THIS provider.
    if (provider_location_id !== undefined && provider_location_id !== null) {
      const locationRows = await sql`
        SELECT id FROM provider_locations
        WHERE id = ${provider_location_id} AND provider_id = ${providerId}
      `;
      if (locationRows.length === 0) {
        return Response.json(
          { error: "Invalid location for this provider" },
          { status: 400 },
        );
      }
    }

    // If an owner pre-selects a staff member (e.g. "book with this walker") it must be
    // ACTIVE staff of THIS provider. Only checked when given — the vet path passes none.
    if (staff_user_id !== undefined && staff_user_id !== null) {
      const staffRows = await sql`
        SELECT id FROM provider_staff
        WHERE provider_id = ${providerId}
          AND user_profile_id = ${staff_user_id}
          AND status = 'active'
      `;
      if (staffRows.length === 0) {
        return Response.json(
          { error: "Selected staff member is not active for this provider" },
          { status: 400 },
        );
      }
    }

    // SLOT ENFORCEMENT (PR-3 — the 15:03 fix). If the provider has availability windows for
    // the resolved capability, the requested time MUST land on an OPEN generated slot — the
    // SAME slots GET /availability produces (generateSlotsForDate / subtractTaken, via
    // isSlotBookable). Providers/capabilities with NO windows (daycare/sitter/walker, or any
    // unconfigured provider) skip this entirely and behave exactly as before.
    const timeZone = provider.time_zone || DEFAULT_TIME_ZONE;

    // Windows for the resolved capability (capability-specific OR provider-wide NULL), and
    // for the named staff member (theirs OR provider-wide NULL) when a staff booking. The
    // two tagged-template variants mirror GET /availability and keep us off the
    // sql(string,array) gotcha.
    const windows =
      staff_user_id !== undefined && staff_user_id !== null
        ? await sql`
            SELECT weekday, start_time, end_time, slot_minutes
            FROM provider_availability
            WHERE provider_id = ${providerId}
              AND active = true
              AND (staff_user_id = ${staff_user_id} OR staff_user_id IS NULL)
              AND (capability = ${resolvedCapability} OR capability IS NULL)
          `
        : await sql`
            SELECT weekday, start_time, end_time, slot_minutes
            FROM provider_availability
            WHERE provider_id = ${providerId}
              AND active = true
              AND (capability = ${resolvedCapability} OR capability IS NULL)
          `;

    if (windows.length > 0) {
      // The requested slot start as an absolute UTC instant: the client's start_at (mobile
      // sends it), else composed from appointment_date + appointment_time in the provider
      // zone — composed IDENTICALLY to the generated slots so an aligned time matches exactly.
      const requestedStart = start_at
        ? new Date(start_at).toISOString()
        : composeIso(
            appointment_date,
            timeToMinutes(appointment_time),
            timeZone,
          );

      // The already-taken set — identical to GET /availability: live (requested|confirmed)
      // bookings for the day (+ staff filter when a staff booking) plus imported external-
      // calendar busy windows (via the DEFINER app_provider_busy_windows).
      const rangeEnd = addDays(appointment_date, 1);
      const bookingRows =
        staff_user_id !== undefined && staff_user_id !== null
          ? await sql`
              SELECT start_at AS start, end_at AS end
              FROM vet_appointments
              WHERE provider_id = ${providerId}
                AND staff_user_id = ${staff_user_id}
                AND deleted_at IS NULL
                AND booking_status = ANY (ARRAY['requested','confirmed'])
                AND start_at IS NOT NULL
                AND start_at >= ${appointment_date}
                AND start_at < ${rangeEnd}
            `
          : await sql`
              SELECT start_at AS start, end_at AS end
              FROM vet_appointments
              WHERE provider_id = ${providerId}
                AND deleted_at IS NULL
                AND booking_status = ANY (ARRAY['requested','confirmed'])
                AND start_at IS NOT NULL
                AND start_at >= ${appointment_date}
                AND start_at < ${rangeEnd}
            `;
      const taken = bookingRows.map((t) => ({
        start: new Date(t.start).toISOString(),
        end: t.end
          ? new Date(t.end).toISOString()
          : new Date(t.start).toISOString(),
      }));
      try {
        const busyRows = await sql`
          SELECT starts_at AS start, ends_at AS end
          FROM app_provider_busy_windows(${providerId}, ${appointment_date}, ${rangeEnd})
        `;
        for (const r of busyRows) {
          taken.push({
            start: new Date(r.start).toISOString(),
            end: new Date(r.end).toISOString(),
          });
        }
      } catch (busyErr) {
        console.error(
          "[POST /api/providers/[id]/book] imported busy (non-fatal):",
          busyErr.message,
        );
      }

      // Alignment is EXACT slot-start (not isSlotBookable's containment, which would admit a
      // sub-slot time like 15:03 — the very bug this fixes). If the requested instant is not
      // a generated slot start → 422 (misaligned / outside working hours). If it aligns but
      // that exact slot is taken (isSlotBookable subtracts the taken set) → 409.
      const slot = generateSlotsForDate(appointment_date, windows, timeZone).find(
        (o) => o.start === requestedStart,
      );
      if (!slot) {
        return Response.json(
          { error: "selected_slot_unavailable" },
          { status: 422 },
        );
      }
      if (!isSlotBookable(slot, windows, taken, timeZone)) {
        return Response.json(
          { error: "selected_slot_unavailable" },
          { status: 409 },
        );
      }
    }

    // DOUBLE-BOOK PREVENTION (2.4). When a concrete slot (start_at/end_at) is given for
    // a specific staff member, reject if that staff member already has a live
    // (requested|confirmed) booking overlapping the slot — a clean 409 instead of the
    // raw 0030 partial-unique constraint error. Only runs when BOTH a slot and a staff
    // member are supplied (the general walk/daycare/grooming path); the vet path, which
    // sends neither, is untouched.
    if (
      start_at !== undefined && start_at !== null &&
      end_at !== undefined && end_at !== null &&
      staff_user_id !== undefined && staff_user_id !== null
    ) {
      if (!(start_at < end_at)) {
        return Response.json(
          { error: "end_at must be after start_at" },
          { status: 400 },
        );
      }
      const clash = await sql`
        SELECT id FROM vet_appointments
        WHERE provider_id = ${providerId}
          AND staff_user_id = ${staff_user_id}
          AND deleted_at IS NULL
          AND booking_status = ANY (ARRAY['requested','confirmed'])
          AND start_at IS NOT NULL
          AND start_at < ${end_at}
          AND end_at > ${start_at}
        LIMIT 1
      `;
      if (clash.length > 0) {
        return Response.json(
          { error: "That time slot is no longer available" },
          { status: 409 },
        );
      }
    }

    // IMPORTED CALENDAR busy (ticket 2.84). When a concrete slot is given, reject if it overlaps a
    // block synced from the provider's external calendar (Google/Outlook/Apple). Provider-wide
    // (no staff filter) — the busy rows are owner/staff RLS-scoped, so the booking owner reads them
    // via the DEFINER app_provider_busy_windows. Runs whenever start_at/end_at are supplied.
    if (
      start_at !== undefined && start_at !== null &&
      end_at !== undefined && end_at !== null &&
      start_at < end_at
    ) {
      const busy = await sql`
        SELECT 1 FROM app_provider_busy_windows(${providerId}, ${start_at}, ${end_at}) LIMIT 1
      `;
      if (busy.length > 0) {
        return Response.json(
          { error: "That time is blocked on the provider's calendar" },
          { status: 409 },
        );
      }
    }

    // If a deposit order is linked it must be the owner's OWN order for THIS provider
    // (a booking deposit from 2.3). Only checked when given.
    if (order_id !== undefined && order_id !== null) {
      const orderRows = await sql`
        SELECT id FROM orders
        WHERE id = ${order_id}
          AND owner_user_id = ${userId}
          AND provider_id = ${providerId}
      `;
      if (orderRows.length === 0) {
        return Response.json(
          { error: "Invalid deposit order for this booking" },
          { status: 400 },
        );
      }
    }

    // title is NOT NULL — derive it: explicit title, else the service name, else a
    // generic label naming the provider. Never leave it null.
    const resolvedTitle =
      title || service?.name || `Appointment with ${provider.name}`;

    // Insert the booking. reminder_enabled is intentionally omitted so it keeps the
    // table default (do NOT change reminder behavior). booking_status='requested',
    // source='owner', status='scheduled' (the existing lifecycle column). The 2.4
    // generalized columns (capability/slot/recurrence/order) are bound here; a vet
    // booking sends capability 'vet' + nulls for the rest, reproducing the pre-2.4 row.
    const created = await sql`
      INSERT INTO vet_appointments (
        pet_id,
        owner_user_id,
        title,
        appointment_date,
        appointment_time,
        reason_for_visit,
        notes,
        provider_id,
        provider_location_id,
        service_id,
        staff_user_id,
        capability,
        start_at,
        end_at,
        recurrence_rule,
        order_id,
        meet_and_greet,
        calendar_event_id,
        source,
        booking_status,
        status
      ) VALUES (
        ${petId},
        ${userId},
        ${resolvedTitle},
        ${appointment_date},
        ${appointment_time},
        ${reason_for_visit ?? null},
        ${notes ?? null},
        ${providerId},
        ${provider_location_id ?? null},
        ${service_id ?? null},
        ${staff_user_id ?? null},
        ${resolvedCapability},
        ${start_at ?? null},
        ${end_at ?? null},
        ${recurrence_rule ?? null},
        ${order_id ?? null},
        ${meet_and_greet === true},
        ${calendar_event_id ?? null},
        ${"owner"},
        ${"requested"},
        ${"scheduled"}
      )
      RETURNING *
    `;

    // Calendar-sync hook (stub behind an interface — 2.4). A real Google/Apple adapter
    // would mirror the new booking onto the provider's external calendar; the no-op
    // adapter records intent and never fails, so it is safe to await inline. Failure to
    // sync must NOT fail the booking, so it is best-effort.
    try {
      await getCalendarSync().pushBooking(created[0]);
    } catch (syncErr) {
      console.error(
        "[POST /api/providers/[id]/book] calendar sync (non-fatal):",
        syncErr.message,
      );
    }

    // TELEHEALTH SESSION AT BOOKING (Phase 1, solo providers). For a telehealth booking, if
    // the provider has EXACTLY ONE eligible active staffer (owner|vet), pre-create the
    // video-consult session (0040) ASSIGNED to that vet + linked to this booking, so the
    // owner's consult is immediately VISIBLE (time-gated until the appointment window; the
    // Daily room is still created lazily on first in-window join). Zero/multiple eligible staff
    // → create nothing and keep today's vet-first flow (app_provider_solo_telehealth_staff,
    // 0078, returns NULL). The insert is owner-context — RLS telehealth_sessions_owner_all's
    // WITH CHECK only constrains owner_user_id, so setting staff_user_id to the vet is allowed.
    // Wrapped in a SAVEPOINT + try/catch so a session-insert failure rolls back ONLY the
    // savepoint and NEVER fails the booking (an un-savepointed failure would abort the whole
    // request transaction and 500 it — see withSavepoint in utils/requestContext).
    if (resolvedCapability === "telehealth") {
      try {
        await withSavepoint(async () => {
          const soloRows = await sql`
            SELECT app_provider_solo_telehealth_staff(${providerId}) AS staff_user_id
          `;
          const soloStaffUserId = soloRows[0]?.staff_user_id ?? null;
          if (soloStaffUserId != null) {
            await sql`
              INSERT INTO telehealth_sessions (
                booking_id, pet_id, owner_user_id, provider_id, staff_user_id, status
              ) VALUES (
                ${created[0].id}, ${petId}, ${userId}, ${providerId}, ${soloStaffUserId}, 'scheduled'
              )
            `;
          }
        });
      } catch (sessErr) {
        console.error(
          "[POST /api/providers/[id]/book] telehealth session (non-fatal):",
          sessErr.message,
        );
      }
    }

    return Response.json({ appointment: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/providers/[id]/book] Error:", error.message);
    return Response.json(
      { error: "Failed to create booking" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
