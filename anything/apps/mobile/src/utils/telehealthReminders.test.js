import {
  buildTelehealthReminderId,
  parseTelehealthReminderId,
  computeTelehealthReminderTriggerAt,
  isTelehealthBookingReminderEligible,
  buildTelehealthReminder,
  syncTelehealthReminderNotifications,
  TELEHEALTH_REMINDER_LEAD_MINUTES,
} from "./telehealthReminders";
import {
  scheduleReminderNotification,
  cancelNotification,
  getScheduledNotifications,
} from "./notifications";

jest.mock("./notifications", () => ({
  scheduleReminderNotification: jest.fn(),
  cancelNotification: jest.fn(),
  getScheduledNotifications: jest.fn(),
}));

const BOOKING = {
  id: 42,
  capability: "telehealth",
  status: "scheduled",
  booking_status: "confirmed",
  appointment_date: "2026-08-01",
  appointment_time: "10:15",
  provider_name: "Dr. Jane",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("buildTelehealthReminderId / parseTelehealthReminderId", () => {
  it("round-trips bookingId + triggerAt", () => {
    const triggerAt = new Date(2026, 7, 1, 10, 10);
    const id = buildTelehealthReminderId(42, triggerAt);
    expect(id).toBe(`telehealth_42_${triggerAt.getTime()}`);
    expect(parseTelehealthReminderId(id)).toEqual({
      bookingId: "42",
      triggerAtMs: triggerAt.getTime(),
    });
  });

  it("returns null for a non-telehealth reminder id", () => {
    expect(parseTelehealthReminderId("vet_apt_7")).toBeNull();
    expect(parseTelehealthReminderId(undefined)).toBeNull();
  });
});

describe("computeTelehealthReminderTriggerAt", () => {
  it(`fires ${TELEHEALTH_REMINDER_LEAD_MINUTES} minutes before the appointment`, () => {
    const triggerAt = computeTelehealthReminderTriggerAt(BOOKING);
    expect(triggerAt.getHours()).toBe(10);
    expect(triggerAt.getMinutes()).toBe(10);
  });

  it("returns null when unparseable", () => {
    expect(computeTelehealthReminderTriggerAt({})).toBeNull();
  });
});

describe("isTelehealthBookingReminderEligible", () => {
  it("accepts a confirmed/requested, still-scheduled telehealth booking", () => {
    expect(isTelehealthBookingReminderEligible(BOOKING)).toBe(true);
    expect(
      isTelehealthBookingReminderEligible({ ...BOOKING, booking_status: "requested" }),
    ).toBe(true);
  });

  it("rejects a non-telehealth booking", () => {
    expect(isTelehealthBookingReminderEligible({ ...BOOKING, capability: "vet" })).toBe(false);
  });

  it("rejects a cancelled/declined booking", () => {
    expect(
      isTelehealthBookingReminderEligible({ ...BOOKING, booking_status: "cancelled" }),
    ).toBe(false);
    expect(
      isTelehealthBookingReminderEligible({ ...BOOKING, booking_status: "declined" }),
    ).toBe(false);
  });

  it("rejects a completed/missed booking (status !== scheduled)", () => {
    expect(isTelehealthBookingReminderEligible({ ...BOOKING, status: "completed" })).toBe(
      false,
    );
    expect(isTelehealthBookingReminderEligible({ ...BOOKING, status: "missed" })).toBe(false);
  });
});

describe("buildTelehealthReminder", () => {
  it("names the provider in the description", () => {
    const triggerAt = new Date(2026, 7, 1, 10, 10);
    const reminder = buildTelehealthReminder(BOOKING, triggerAt);
    expect(reminder.type).toBe("telehealth");
    expect(reminder.description).toContain("Dr. Jane");
    expect(reminder.nextTriggerAt).toBe(triggerAt.toISOString());
    expect(reminder.timeSensitive).toBe(true);
  });
});

describe("syncTelehealthReminderNotifications", () => {
  it("schedules a reminder for a newly-eligible booking with no existing schedule", async () => {
    getScheduledNotifications.mockResolvedValue([]);
    scheduleReminderNotification.mockResolvedValue("notif-1");

    await syncTelehealthReminderNotifications([BOOKING]);

    expect(scheduleReminderNotification).toHaveBeenCalledTimes(1);
    const [reminder] = scheduleReminderNotification.mock.calls[0];
    expect(parseTelehealthReminderId(reminder.id)).toEqual(
      expect.objectContaining({ bookingId: "42" }),
    );
    expect(cancelNotification).not.toHaveBeenCalled();
  });

  it("leaves an already-correctly-scheduled reminder alone (idempotent)", async () => {
    const triggerAt = computeTelehealthReminderTriggerAt(BOOKING);
    const existingId = buildTelehealthReminderId(BOOKING.id, triggerAt);
    getScheduledNotifications.mockResolvedValue([
      { identifier: "abc", content: { data: { reminderId: existingId } } },
    ]);

    await syncTelehealthReminderNotifications([BOOKING]);

    expect(scheduleReminderNotification).not.toHaveBeenCalled();
    expect(cancelNotification).not.toHaveBeenCalled();
  });

  it("cancels a stale reminder when the booking is no longer present (deleted/out of range)", async () => {
    const triggerAt = computeTelehealthReminderTriggerAt(BOOKING);
    const staleId = buildTelehealthReminderId(BOOKING.id, triggerAt);
    getScheduledNotifications.mockResolvedValue([
      { identifier: "stale-1", content: { data: { reminderId: staleId } } },
    ]);

    await syncTelehealthReminderNotifications([]); // booking gone from the upcoming list

    expect(cancelNotification).toHaveBeenCalledWith("stale-1");
    expect(scheduleReminderNotification).not.toHaveBeenCalled();
  });

  it("cancels a stale reminder when the booking is cancelled", async () => {
    const triggerAt = computeTelehealthReminderTriggerAt(BOOKING);
    const staleId = buildTelehealthReminderId(BOOKING.id, triggerAt);
    getScheduledNotifications.mockResolvedValue([
      { identifier: "stale-2", content: { data: { reminderId: staleId } } },
    ]);

    await syncTelehealthReminderNotifications([
      { ...BOOKING, booking_status: "cancelled" },
    ]);

    expect(cancelNotification).toHaveBeenCalledWith("stale-2");
    expect(scheduleReminderNotification).not.toHaveBeenCalled();
  });

  it("reschedules when the booking's time changed (old trigger no longer matches)", async () => {
    const oldTriggerAt = computeTelehealthReminderTriggerAt(BOOKING);
    const staleId = buildTelehealthReminderId(BOOKING.id, oldTriggerAt);
    getScheduledNotifications.mockResolvedValue([
      { identifier: "old-1", content: { data: { reminderId: staleId } } },
    ]);
    scheduleReminderNotification.mockResolvedValue("notif-2");

    const rescheduled = { ...BOOKING, appointment_time: "14:00" };
    await syncTelehealthReminderNotifications([rescheduled]);

    expect(cancelNotification).toHaveBeenCalledWith("old-1");
    expect(scheduleReminderNotification).toHaveBeenCalledTimes(1);
    const [reminder] = scheduleReminderNotification.mock.calls[0];
    const newTrigger = computeTelehealthReminderTriggerAt(rescheduled);
    expect(parseTelehealthReminderId(reminder.id)).toEqual({
      bookingId: "42",
      triggerAtMs: newTrigger.getTime(),
    });
  });

  it("ignores notifications that aren't ours", async () => {
    getScheduledNotifications.mockResolvedValue([
      { identifier: "other", content: { data: { reminderId: "vet_apt_9" } } },
    ]);

    await syncTelehealthReminderNotifications([]);

    expect(cancelNotification).not.toHaveBeenCalled();
    expect(scheduleReminderNotification).not.toHaveBeenCalled();
  });
});
