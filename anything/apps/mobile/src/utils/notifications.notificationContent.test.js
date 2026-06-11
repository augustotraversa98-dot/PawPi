// Early-reminder notification COPY. P2 early reminders are OS-notification
// lead-time only — the instance stays at the event time and the in-app "Next Up"
// list spans only a few hours, so the early PUSH is the only artifact the user
// sees ahead of time. It must read as a heads-up naming the real due day/time, not
// a do-it-now task. On-time pushes must stay byte-for-byte unchanged.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));

import { buildReminderNotificationContent } from "./notifications";
import { formatScheduledTime } from "./scheduledTimeFormat";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const reminder = {
  type: "feeding",
  title: "Breakfast",
  description: "Time for breakfast",
};

describe("buildReminderNotificationContent — on-time (unchanged)", () => {
  const t = new Date(2026, 5, 11, 9, 0, 0);

  it("leadMs 0: title and body are exactly today's content", () => {
    const { title, body } = buildReminderNotificationContent(reminder, {
      eventTime: t,
      triggerTime: t,
      leadMs: 0,
    });
    expect(title).toBe("🍽️ Breakfast");
    expect(body).toBe("Time for breakfast");
  });

  it("absent leadMs is treated as on-time", () => {
    const { title, body } = buildReminderNotificationContent(reminder, {
      eventTime: t,
      triggerTime: t,
    });
    expect(title).toBe("🍽️ Breakfast");
    expect(body).toBe("Time for breakfast");
  });

  it("preserves an undefined description byte-for-byte (body undefined)", () => {
    const { body } = buildReminderNotificationContent(
      { type: "feeding", title: "Breakfast" },
      { eventTime: t, triggerTime: t, leadMs: 0 },
    );
    expect(body).toBeUndefined();
  });

  it("falls back to the default icon for an unknown type", () => {
    const { title } = buildReminderNotificationContent(
      { type: "mystery", title: "Thing", description: "d" },
      { eventTime: t, triggerTime: t, leadMs: 0 },
    );
    expect(title).toBe("📌 Thing");
  });
});

describe("buildReminderNotificationContent — early (heads-up)", () => {
  it('1 day before: body names "Due Tomorrow <time>" relative to the fire day', () => {
    const eventTime = new Date(2026, 5, 12, 9, 0, 0); // due tomorrow 9:00
    const triggerTime = new Date(2026, 5, 11, 9, 0, 0); // alert fires today
    const { title, body } = buildReminderNotificationContent(reminder, {
      eventTime,
      triggerTime,
      leadMs: DAY,
    });

    // Reuses formatScheduledTime(eventTime, triggerTime) verbatim.
    expect(body).toBe(
      `Time for breakfast\nDue ${formatScheduledTime(eventTime, triggerTime)}`,
    );
    expect(body).toContain("Due Tomorrow");
    expect(body).toContain("Time for breakfast");
    // Title reframed as a heads-up, not the bare do-it-now title.
    expect(title).not.toBe("🍽️ Breakfast");
    expect(title).toContain("Breakfast");
  });

  it("further out (1 week): body uses the weekday/date form", () => {
    const eventTime = new Date(2026, 5, 18, 9, 0, 0);
    const triggerTime = new Date(2026, 5, 11, 9, 0, 0);
    const { body } = buildReminderNotificationContent(reminder, {
      eventTime,
      triggerTime,
      leadMs: 7 * DAY,
    });
    expect(body).toContain(`Due ${formatScheduledTime(eventTime, triggerTime)}`);
    expect(body).not.toContain("Tomorrow");
  });

  it("same-day early (1h before): body names the due time without a day word", () => {
    const eventTime = new Date(2026, 5, 11, 14, 0, 0);
    const triggerTime = new Date(2026, 5, 11, 13, 0, 0);
    const { body } = buildReminderNotificationContent(reminder, {
      eventTime,
      triggerTime,
      leadMs: HOUR,
    });
    expect(body).toContain("Due ");
    expect(body).not.toContain("Tomorrow");
    expect(body).not.toContain("Yesterday");
  });

  it("empty description: body is just the due line", () => {
    const eventTime = new Date(2026, 5, 12, 9, 0, 0);
    const triggerTime = new Date(2026, 5, 11, 9, 0, 0);
    const { body } = buildReminderNotificationContent(
      { ...reminder, description: "" },
      { eventTime, triggerTime, leadMs: DAY },
    );
    expect(body).toBe(`Due ${formatScheduledTime(eventTime, triggerTime)}`);
  });
});
