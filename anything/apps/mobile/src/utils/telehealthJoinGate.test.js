import {
  resolveTelehealthAppointmentMoment,
  minutesUntilTelehealthAppointment,
  canOwnerJoinTelehealthNow,
  isTelehealthJoinTooEarly,
  describeTelehealthJoinWait,
  OWNER_EARLY_JOIN_WINDOW_MINUTES,
} from "./telehealthJoinGate";

const BOOKING = { appointment_date: "2026-08-01", appointment_time: "10:15" };

describe("resolveTelehealthAppointmentMoment", () => {
  it("composes date + time as a local moment", () => {
    const moment = resolveTelehealthAppointmentMoment(BOOKING);
    expect(moment.getFullYear()).toBe(2026);
    expect(moment.getMonth()).toBe(7); // 0-indexed August
    expect(moment.getDate()).toBe(1);
    expect(moment.getHours()).toBe(10);
    expect(moment.getMinutes()).toBe(15);
  });

  it("returns null for an unparseable booking", () => {
    expect(resolveTelehealthAppointmentMoment({})).toBeNull();
    expect(resolveTelehealthAppointmentMoment(null)).toBeNull();
    expect(
      resolveTelehealthAppointmentMoment({ appointment_date: "garbage", appointment_time: "10:15" }),
    ).toBeNull();
  });
});

describe("minutesUntilTelehealthAppointment", () => {
  it("returns positive minutes before the appointment", () => {
    const now = new Date(2026, 7, 1, 9, 50);
    expect(minutesUntilTelehealthAppointment(BOOKING, now)).toBe(25);
  });

  it("returns negative minutes after the appointment", () => {
    const now = new Date(2026, 7, 1, 10, 20);
    expect(minutesUntilTelehealthAppointment(BOOKING, now)).toBe(-5);
  });

  it("returns null when unparseable", () => {
    expect(minutesUntilTelehealthAppointment({})).toBeNull();
  });
});

describe("canOwnerJoinTelehealthNow", () => {
  it("rejects more than 5 minutes early", () => {
    const now = new Date(2026, 7, 1, 9, 50); // 25 min early
    expect(canOwnerJoinTelehealthNow(BOOKING, { now })).toBe(false);
  });

  it(`accepts exactly at the ${OWNER_EARLY_JOIN_WINDOW_MINUTES}-minute boundary`, () => {
    const now = new Date(2026, 7, 1, 10, 10); // exactly 5 min early
    expect(canOwnerJoinTelehealthNow(BOOKING, { now })).toBe(true);
  });

  it("accepts inside the window", () => {
    const now = new Date(2026, 7, 1, 10, 12); // 3 min early
    expect(canOwnerJoinTelehealthNow(BOOKING, { now })).toBe(true);
  });

  it("accepts after the scheduled time", () => {
    const now = new Date(2026, 7, 1, 10, 20);
    expect(canOwnerJoinTelehealthNow(BOOKING, { now })).toBe(true);
  });

  it("accepts any time once the session is in_progress, even hours early", () => {
    const now = new Date(2026, 7, 1, 6, 0);
    expect(canOwnerJoinTelehealthNow(BOOKING, { now, sessionStatus: "in_progress" })).toBe(true);
  });

  it("rejects when the booking has no parseable date/time and isn't in_progress", () => {
    expect(canOwnerJoinTelehealthNow({})).toBe(false);
  });
});

describe("isTelehealthJoinTooEarly", () => {
  it("blocks when clearly more than 5 minutes early", () => {
    const now = new Date(2026, 7, 1, 9, 50);
    expect(isTelehealthJoinTooEarly(BOOKING, { now })).toBe(true);
  });

  it("does not block inside the window", () => {
    const now = new Date(2026, 7, 1, 10, 12);
    expect(isTelehealthJoinTooEarly(BOOKING, { now })).toBe(false);
  });

  it("does not block once in_progress, even hours early", () => {
    const now = new Date(2026, 7, 1, 6, 0);
    expect(isTelehealthJoinTooEarly(BOOKING, { now, sessionStatus: "in_progress" })).toBe(
      false,
    );
  });

  it("fails OPEN (does not block) when the booking's date/time can't be parsed — the server is the source of truth", () => {
    expect(isTelehealthJoinTooEarly({})).toBe(false);
  });
});

describe("describeTelehealthJoinWait", () => {
  it("names the scheduled time and minutes remaining", () => {
    const now = new Date(2026, 7, 1, 9, 50); // 25 min early → 20 min until join opens
    const message = describeTelehealthJoinWait(BOOKING, now);
    expect(message).toContain("you can join in 20 minutes");
    expect(message).toContain("once your vet starts the call");
  });

  it("falls back to generic copy when the booking has no parseable time", () => {
    const message = describeTelehealthJoinWait({});
    expect(message).toContain("once your vet starts the call");
  });
});
