// Pure tests for the heads-up (early reminder) selection. A reminder is an ACTIVE
// HEADS-UP when leadMs > 0 AND earlyTime <= now < eventTime, where leadMs is read
// back off the source routine's item-level reminderTiming. Excluded: before the
// early time, at/after the event, leadMs 0 / no early timing, snoozed, completed,
// real-dismissed, and early-dismissed. A heads-up is also kept OUT of Due Soon /
// Next Up (the section layer excludes its id) — exactly one home at a time.

// headsUpReminders.js imports notifications.js (for resolveReminderTiming /
// resolveLeadTimeMs), which touches expo-notifications at module load — mock it,
// matching the other notifications.* tests.
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import {
  buildHeadsUpReminders,
  earlyDismissalKey,
} from "./headsUpReminders";
import { sectionTodayReminders } from "./reminderSections";

const NOW = new Date(2026, 5, 11, 12, 0, 0); // local noon
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// A wellness_check routine whose single item carries a "1 day before" lead-time.
// resolveReminderTiming reads item.reminderTiming for wellness_check / photo_check.
const routine = (overrides = {}) => ({
  id: "100",
  petId: "42",
  type: "wellness_check",
  isActive: true,
  wellnessCheckItems: [{ checkType: "general", reminderTiming: "1d" }],
  ...overrides,
});

// An upcoming instance of that routine's item, due `eventOffsetMs` from NOW.
const reminder = (eventOffsetMs, overrides = {}) => {
  const at = new Date(NOW.getTime() + eventOffsetMs).toISOString();
  return {
    id: "w1",
    routineId: "100",
    wellnessCheckItemIndex: 0,
    petId: "42",
    type: "wellness_check",
    checkType: "general",
    title: "General check",
    status: "upcoming",
    timeSensitive: false,
    scheduledAt: at,
    nextTriggerAt: at,
    snoozedUntil: null,
    ...overrides,
  };
};

function build(reminders, opts = {}) {
  return buildHeadsUpReminders({
    reminders,
    routines: [routine()],
    now: NOW,
    ...opts,
  });
}

describe("buildHeadsUpReminders — window", () => {
  it("emits an in-window early reminder (event tomorrow, 1 day before)", () => {
    // Event is +18h; earlyTime = event − 1d, so NOW is inside [earlyTime, event).
    const r = reminder(18 * HOUR);
    const out = build([r]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("w1");
    // Carries eventTime as the due-label source.
    expect(out[0].eventTime).toBe(r.scheduledAt);
  });

  it("excludes a reminder whose early time hasn't been reached yet", () => {
    // Event is +2 days; earlyTime = event − 1d = +1 day, still in the future.
    const out = build([reminder(2 * DAY)]);
    expect(out).toHaveLength(0);
  });

  it("excludes a reminder once now >= eventTime (resumes normal sectioning)", () => {
    // Event already passed (−1h) → no longer a heads-up.
    const out = build([reminder(-1 * HOUR)]);
    expect(out).toHaveLength(0);
  });

  it("is inclusive at the early edge and exclusive at the event edge", () => {
    // Exactly at earlyTime (event = NOW + leadMs) → included (earlyTime <= now).
    const atEarlyEdge = reminder(DAY);
    expect(build([atEarlyEdge])).toHaveLength(1);

    // Exactly at the event (event = NOW) → excluded (now < eventTime is false).
    const atEventEdge = reminder(0);
    expect(build([atEventEdge])).toHaveLength(0);
  });
});

describe("buildHeadsUpReminders — eligibility", () => {
  it("leadMs 0 (on_time timing) is never a heads-up", () => {
    const out = buildHeadsUpReminders({
      reminders: [reminder(18 * HOUR)],
      routines: [
        routine({
          wellnessCheckItems: [{ checkType: "general", reminderTiming: "on_time" }],
        }),
      ],
      now: NOW,
    });
    expect(out).toHaveLength(0);
  });

  it("no early timing at all (absent reminderTiming) is never a heads-up", () => {
    const out = buildHeadsUpReminders({
      reminders: [reminder(18 * HOUR)],
      routines: [routine({ wellnessCheckItems: [{ checkType: "general" }] })],
      now: NOW,
    });
    expect(out).toHaveLength(0);
  });

  it("a type with no resolveReminderTiming branch (feeding) is never a heads-up", () => {
    const feeding = reminder(18 * HOUR, {
      id: "f1",
      type: "feeding",
      routineId: "200",
    });
    const out = buildHeadsUpReminders({
      reminders: [feeding],
      routines: [routine({ id: "200", type: "feeding" })],
      now: NOW,
    });
    expect(out).toHaveLength(0);
  });

  it("excludes snoozed, completed and real-dismissed instances", () => {
    const snoozedR = reminder(18 * HOUR, { id: "s1" });
    const completedR = reminder(18 * HOUR, { id: "c1", status: "completed" });
    const dismissedR = reminder(18 * HOUR, { id: "d1" });

    const out = buildHeadsUpReminders({
      reminders: [snoozedR, completedR, dismissedR],
      routines: [routine()],
      now: NOW,
      snoozes: { s1: new Date(NOW.getTime() + 2 * HOUR).toISOString() },
      dismissedKeys: new Set(["d1"]),
    });
    expect(out).toHaveLength(0);
  });

  it("early-dismissed is excluded BUT the instance still sections normally at event time", () => {
    const r = reminder(18 * HOUR);
    const earlyDismissed = new Set([earlyDismissalKey(r)]);

    // Heads-up suppressed during the early window…
    expect(
      build([r], { earlyDismissedKeys: earlyDismissed }),
    ).toHaveLength(0);

    // …and the early dismissal does NOT count as a real dismissal: at the event
    // time the real instance sections normally (Next Up here, future + within 6h).
    const atEvent = new Date(r.scheduledAt);
    const eventR = { ...r, timeSensitive: false };
    const { nextUp } = sectionTodayReminders({
      reminders: [eventR],
      now: new Date(atEvent.getTime() - 30 * 60 * 1000), // 30m before event
      // Real dismissals only — the `::early` key is NOT in this set.
      dismissedKeys: new Set(),
      headsUpIds: new Set(),
    });
    expect(nextUp.map((x) => x.id)).toContain("w1");
  });
});

describe("buildHeadsUpReminders — single home (not also in Next Up)", () => {
  it("an active heads-up excluded via headsUpIds does not appear in Next Up", () => {
    // Event +3h: without heads-up it would be a Next Up item (future, within 6h).
    const r = reminder(3 * HOUR, { timeSensitive: false });
    const headsUp = build([r]);
    expect(headsUp).toHaveLength(1);

    const headsUpIds = new Set(headsUp.map((x) => x.id));
    const { dueSoon, nextUp } = sectionTodayReminders({
      reminders: [r],
      now: NOW,
      headsUpIds,
    });
    expect(dueSoon).toHaveLength(0);
    expect(nextUp).toHaveLength(0);
  });

  it("without the exclusion the same instance WOULD be in Next Up (sanity)", () => {
    const r = reminder(3 * HOUR, { timeSensitive: false });
    const { nextUp } = sectionTodayReminders({ reminders: [r], now: NOW });
    expect(nextUp.map((x) => x.id)).toContain("w1");
  });
});

describe("earlyDismissalKey", () => {
  it("namespaces the instance key with ::early", () => {
    expect(earlyDismissalKey({ id: "w1" })).toBe("w1::early");
  });
  it("returns null when there is no id", () => {
    expect(earlyDismissalKey({})).toBeNull();
    expect(earlyDismissalKey(null)).toBeNull();
  });
});
