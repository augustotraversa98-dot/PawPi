import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { refund } from "@/app/api/utils/payments";

// PATCH /api/providers/[id]/bookings/[appointmentId] — act on ONE booking.
// Ticket 6b (docs/provider-design.md §4 item 6, provider half). The provider's
// front desk confirms / declines / cancels / assigns a vet_appointments row an
// owner booked (6a).
//
// AUTH: booking management is OPERATIONAL — any ACTIVE staff may act (not just
// owner|admin), so this authorizes with ALL_PROVIDER_ROLES.
//
// CROSS-PROVIDER ISOLATION: every read/write is scoped WHERE id = ${appointmentId}
// AND provider_id = ${providerId}. An appointment id belonging to ANOTHER provider
// matches no row → 404 (the cross-provider footgun, same as 4b/4c child routes).
//
// REMINDER DECISION (locked, docs/provider-design.md + 6b ticket): reminders fire
// on a 'requested' booking (no change to reminder code). DECLINE and provider
// CANCEL set reminder_enabled=false AND status='cancelled' so the existing engine
// stops reminding about a dead appointment. CONFIRM does NOT touch reminder_enabled
// or the lifecycle status column.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`.

const VALID_ACTIONS = ["confirm", "decline", "cancel", "assign", "complete"];

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const appointmentId = params.appointmentId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // OPERATIONAL write — any active staff member may act on a booking.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json()) ?? {};
    const { action, staffUserId } = body;

    if (!VALID_ACTIONS.includes(action)) {
      return Response.json(
        {
          error:
            "action must be one of confirm, decline, cancel, assign, complete",
        },
        { status: 400 },
      );
    }

    // Cross-provider isolation: load the target scoped to BOTH ids. Another
    // provider's appointment id (or a soft-deleted one) matches no row → 404.
    const rows = await sql`
      SELECT id, booking_status, status, order_id FROM vet_appointments
      WHERE id = ${appointmentId}
        AND provider_id = ${providerId}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Booking not found" }, { status: 404 });
    }
    const currentStatus = rows[0].booking_status;

    // Validate the assignee is ACTIVE provider_staff of THIS provider. Returns a
    // {error,status} object on failure, or null when ok (or no assignee given and
    // none required — the caller decides if it's required).
    const assertActiveStaff = async (assignee) => {
      if (assignee === undefined || assignee === null) {
        return { error: "staffUserId is required to assign", status: 400 };
      }
      const staffRows = await sql`
        SELECT id FROM provider_staff
        WHERE provider_id = ${providerId}
          AND user_profile_id = ${assignee}
          AND status = 'active'
        LIMIT 1
      `;
      if (staffRows.length === 0) {
        return {
          error: "Assignee is not active staff of this provider",
          status: 400,
        };
      }
      return null;
    };

    if (action === "confirm") {
      // Only a 'requested' booking can be confirmed.
      if (currentStatus !== "requested") {
        return Response.json(
          { error: "Only a requested booking can be confirmed" },
          { status: 409 },
        );
      }
      // Optionally assign-while-confirming. Do NOT touch reminder_enabled/status.
      if (staffUserId !== undefined && staffUserId !== null) {
        const err = await assertActiveStaff(staffUserId);
        if (err) {
          return Response.json({ error: err.error }, { status: err.status });
        }
        const updated = await sql`
          UPDATE vet_appointments
          SET booking_status = ${"confirmed"},
              staff_user_id = ${staffUserId},
              updated_at = NOW()
          WHERE id = ${appointmentId} AND provider_id = ${providerId}
          RETURNING *
        `;
        return Response.json({ booking: updated[0] });
      }
      const updated = await sql`
        UPDATE vet_appointments
        SET booking_status = ${"confirmed"}, updated_at = NOW()
        WHERE id = ${appointmentId} AND provider_id = ${providerId}
        RETURNING *
      `;
      return Response.json({ booking: updated[0] });
    }

    if (action === "decline") {
      // Only a 'requested' booking can be declined. Stop the reminder engine:
      // status='cancelled' + reminder_enabled=false alongside booking_status.
      if (currentStatus !== "requested") {
        return Response.json(
          { error: "Only a requested booking can be declined" },
          { status: 409 },
        );
      }
      const updated = await sql`
        UPDATE vet_appointments
        SET booking_status = ${"declined"},
            status = ${"cancelled"},
            reminder_enabled = ${false},
            updated_at = NOW()
        WHERE id = ${appointmentId} AND provider_id = ${providerId}
        RETURNING *
      `;

      // Pay-at-request model: if the customer already paid for this booking, declining it
      // must refund them. Best-effort — the decline NEVER fails on a refund error (an
      // admin can retry via POST /api/payments/[id]/refund). Only an APPROVED payment on
      // the linked order is refundable; unpaid / pay-in-person bookings skip this entirely.
      let refundResult = null;
      const orderId = rows[0].order_id;
      if (orderId != null) {
        try {
          const payRows = await sql`
            SELECT * FROM payments
            WHERE order_id = ${orderId} AND status = ${"approved"}
            ORDER BY id DESC
            LIMIT 1
          `;
          if (payRows.length > 0) {
            await refund(payRows[0]);
            refundResult = { refunded: true, payment_id: payRows[0].id };
          }
        } catch (refundError) {
          console.error(
            "[PATCH bookings decline] refund failed (booking still declined):",
            refundError.message,
          );
          refundResult = { refunded: false, refund_error: refundError.message };
        }
      }

      return Response.json({ booking: updated[0], refund: refundResult });
    }

    if (action === "cancel") {
      // Provider cancels a live booking (requested OR confirmed). Same
      // reminder-killing writes as decline.
      if (currentStatus !== "requested" && currentStatus !== "confirmed") {
        return Response.json(
          { error: "Only a requested or confirmed booking can be cancelled" },
          { status: 409 },
        );
      }
      const updated = await sql`
        UPDATE vet_appointments
        SET booking_status = ${"cancelled"},
            status = ${"cancelled"},
            reminder_enabled = ${false},
            updated_at = NOW()
        WHERE id = ${appointmentId} AND provider_id = ${providerId}
        RETURNING *
      `;
      return Response.json({ booking: updated[0] });
    }

    if (action === "complete") {
      // Provider marks a CONFIRMED booking as done (2.4). This sets the LIFECYCLE
      // status='completed' — the EXACT column + value the reviews gate (2.2) reads, so
      // completing a booking is what unlocks the owner's "leave a review". booking_status
      // is mirrored to 'completed' for the booking workflow. reminder_enabled is set
      // false so the engine stops reminding about a finished appointment (a completed
      // appointment is in the past; this matches decline/cancel's reminder-killing).
      if (currentStatus !== "confirmed") {
        return Response.json(
          { error: "Only a confirmed booking can be completed" },
          { status: 409 },
        );
      }
      const updated = await sql`
        UPDATE vet_appointments
        SET booking_status = ${"completed"},
            status = ${"completed"},
            reminder_enabled = ${false},
            updated_at = NOW()
        WHERE id = ${appointmentId} AND provider_id = ${providerId}
        RETURNING *
      `;
      return Response.json({ booking: updated[0] });
    }

    // action === "assign" — stand-alone assign on a requested/confirmed booking.
    if (currentStatus !== "requested" && currentStatus !== "confirmed") {
      return Response.json(
        { error: "Only a requested or confirmed booking can be assigned" },
        { status: 409 },
      );
    }
    const err = await assertActiveStaff(staffUserId);
    if (err) {
      return Response.json({ error: err.error }, { status: err.status });
    }
    const updated = await sql`
      UPDATE vet_appointments
      SET staff_user_id = ${staffUserId}, updated_at = NOW()
      WHERE id = ${appointmentId} AND provider_id = ${providerId}
      RETURNING *
    `;
    return Response.json({ booking: updated[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/bookings/[appointmentId]] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to update booking" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
