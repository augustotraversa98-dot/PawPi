import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { invalidSlotMinutes } from "@/app/api/utils/providerValidation";
import { withRequestContext } from "@/app/api/utils/requestContext";

// One availability WINDOW — edit and hard delete (owner|admin). The extranet editor's
// per-window mutations, mirroring locations/[locationId].
//
// CROSS-PROVIDER ISOLATION: every write is scoped by BOTH the path provider :id AND the child
// :availabilityId (WHERE id = ${availabilityId} AND provider_id = ${providerId}). A window that
// belongs to another provider matches no row -> 404, so an owner of provider A can never edit
// provider B's window by passing A as :id.
//
// PATCH validates the RESULTING row (existing values merged with the provided fields) so a
// partial edit — e.g. only end_time — can't produce end_time <= start_time and surface as a raw
// DB CHECK 500 (it returns a clean 400 instead). MVP edits provider-wide fields only:
// weekday / start_time / end_time / slot_minutes / active. staff_user_id / capability /
// location_id are out of scope for v1 and left untouched.

// Update a window — owner|admin only. Partial: omitted fields keep their stored value.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const availabilityId = params.availabilityId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const { weekday, start_time, end_time, slot_minutes, active } = body;

    // Load the current row (scoped by id AND provider_id) so we can validate the merged result
    // and 404 a cross-provider / unknown window before any write.
    const existing = await sql`
      SELECT weekday, start_time, end_time, slot_minutes, active
      FROM provider_availability
      WHERE id = ${availabilityId} AND provider_id = ${providerId}
    `;
    if (existing.length === 0) {
      return Response.json({ error: "Availability window not found" }, { status: 404 });
    }

    // Merge provided fields over the stored row, then validate the result.
    const next = {
      weekday: weekday ?? existing[0].weekday,
      start_time: start_time ?? existing[0].start_time,
      end_time: end_time ?? existing[0].end_time,
      slot_minutes: slot_minutes ?? existing[0].slot_minutes,
      active: active ?? existing[0].active,
    };

    if (
      weekday !== undefined &&
      (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    ) {
      return Response.json(
        { error: "weekday must be an integer 0 (Mon) – 6 (Sun)" },
        { status: 400 },
      );
    }
    if (active !== undefined && typeof active !== "boolean") {
      return Response.json({ error: "active must be a boolean" }, { status: 400 });
    }
    const slotError = invalidSlotMinutes(slot_minutes);
    if (slotError) {
      return Response.json({ error: slotError }, { status: 400 });
    }
    // start_time < end_time on the merged result (HH:MM[:SS] strings compare lexically).
    if (!(String(next.start_time) < String(next.end_time))) {
      return Response.json(
        { error: "end_time must be after start_time" },
        { status: 400 },
      );
    }

    const updated = await sql`
      UPDATE provider_availability SET
        weekday = ${next.weekday},
        start_time = ${next.start_time},
        end_time = ${next.end_time},
        slot_minutes = ${next.slot_minutes},
        active = ${next.active},
        updated_at = NOW()
      WHERE id = ${availabilityId} AND provider_id = ${providerId}
      RETURNING *
    `;

    return Response.json({ availability: updated[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/availability/[availabilityId]] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to update availability window" },
      { status: 500 },
    );
  }
}

// Hard delete a window — owner|admin only. Scoped by id AND provider_id; a window belonging to
// another provider matches no row -> 404. Mirrors the locations hard delete (the row is removed;
// toggling a window off without deleting it is a PATCH active=false).
async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const availabilityId = params.availabilityId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const deleted = await sql`
      DELETE FROM provider_availability
      WHERE id = ${availabilityId} AND provider_id = ${providerId}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return Response.json({ error: "Availability window not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[DELETE /api/providers/[id]/availability/[availabilityId]] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to delete availability window" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPATCH as PATCH, wrappedDELETE as DELETE };
