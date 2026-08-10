import { describe, it, expect } from "vitest";
import { bookingActions } from "./bookingActions";

describe("bookingActions", () => {
  it("requested → Confirm + Decline + Assign, never Cancel", () => {
    const a = bookingActions({ booking_status: "requested", pet_id: 1 });
    expect(a.canConfirm).toBe(true);
    expect(a.canDecline).toBe(true);
    expect(a.canAssign).toBe(true);
    expect(a.canCancel).toBe(false);
    expect(a.canOpenRecord).toBe(true);
  });

  it("confirmed → Cancel + Assign, never Confirm/Decline", () => {
    const a = bookingActions({ booking_status: "confirmed", pet_id: 1 });
    expect(a.canCancel).toBe(true);
    expect(a.canAssign).toBe(true);
    expect(a.canConfirm).toBe(false);
    expect(a.canDecline).toBe(false);
  });

  it.each(["declined", "cancelled", "completed"])(
    "%s → no state-changing or consult actions (Open record may remain)",
    (status) => {
      const a = bookingActions({
        booking_status: status,
        pet_id: 1,
        capability: "telehealth",
        telehealth_session_id: 9,
        telehealth_session_status: "in_progress",
      });
      expect(a.canConfirm).toBe(false);
      expect(a.canDecline).toBe(false);
      expect(a.canCancel).toBe(false);
      expect(a.canAssign).toBe(false);
      expect(a.canJoinConsult).toBe(false);
      expect(a.canEndConsult).toBe(false);
      expect(a.canOpenRecord).toBe(true);
    },
  );

  it("Join consult only for a confirmed telehealth booking", () => {
    expect(
      bookingActions({ booking_status: "confirmed", capability: "telehealth" })
        .canJoinConsult,
    ).toBe(true);
    expect(
      bookingActions({ booking_status: "requested", capability: "telehealth" })
        .canJoinConsult,
    ).toBe(false);
    expect(
      bookingActions({ booking_status: "confirmed", capability: "vet" })
        .canJoinConsult,
    ).toBe(false);
  });

  it("End consult only when confirmed AND the session is in_progress", () => {
    const base = {
      booking_status: "confirmed",
      capability: "telehealth",
      telehealth_session_id: 9,
    };
    expect(
      bookingActions({ ...base, telehealth_session_status: "in_progress" })
        .canEndConsult,
    ).toBe(true);
    // A pre-created but not-yet-started session offers nothing to end.
    expect(
      bookingActions({ ...base, telehealth_session_status: "scheduled" })
        .canEndConsult,
    ).toBe(false);
    // No session at all.
    expect(
      bookingActions({
        booking_status: "confirmed",
        capability: "telehealth",
        telehealth_session_id: null,
        telehealth_session_status: "in_progress",
      }).canEndConsult,
    ).toBe(false);
  });
});
