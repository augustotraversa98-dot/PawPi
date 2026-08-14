// E5 notification policy — the pure decision layer. Proves the streak-save fires ONLY in the
// exact at-risk condition, that toggles suppress, that the cap is enforced, and that the send
// hour personalizes.

import {
  NOTIF_CATEGORIES,
  DEFAULT_PREFS,
  EVENING_HOUR,
  countRemainingSegments,
  isCategoryEnabled,
  shouldSendStreakSave,
  isWithinDailyCap,
  resolvePersonalizedSendHour,
} from "./notificationPolicy";

describe("countRemainingSegments", () => {
  it("counts open segments", () => {
    expect(countRemainingSegments({})).toBe(3);
    expect(countRemainingSegments({ walkDone: true })).toBe(2);
    expect(countRemainingSegments({ walkDone: true, momentDone: true })).toBe(1);
    expect(countRemainingSegments({ walkDone: true, momentDone: true, careDone: true })).toBe(0);
  });
});

describe("isCategoryEnabled", () => {
  it("defaults to enabled, false suppresses", () => {
    expect(isCategoryEnabled(DEFAULT_PREFS, NOTIF_CATEGORIES.STREAK)).toBe(true);
    expect(isCategoryEnabled({ streak: false }, NOTIF_CATEGORIES.STREAK)).toBe(false);
    expect(isCategoryEnabled(undefined, NOTIF_CATEGORIES.SOCIAL)).toBe(true);
  });
});

describe("shouldSendStreakSave — the exact at-risk condition", () => {
  const atRisk = {
    walkDone: true,
    momentDone: true,
    careDone: false, // exactly one segment left
    ringClosed: false,
    restDay: false,
    paused: false,
    streakCount: 12,
    alreadySentToday: false,
  };

  it("fires when exactly one segment remains and the streak is at risk", () => {
    expect(shouldSendStreakSave(atRisk)).toBe(true);
  });

  it("does NOT fire when two segments remain", () => {
    expect(shouldSendStreakSave({ ...atRisk, momentDone: false })).toBe(false);
  });

  it("does NOT fire when the ring is already closed", () => {
    expect(
      shouldSendStreakSave({ ...atRisk, careDone: true, ringClosed: true }),
    ).toBe(false);
  });

  it("does NOT fire when there is no streak to save", () => {
    expect(shouldSendStreakSave({ ...atRisk, streakCount: 0 })).toBe(false);
  });

  it("does NOT fire on a rest day or a paused day (excused, never at risk)", () => {
    expect(shouldSendStreakSave({ ...atRisk, restDay: true })).toBe(false);
    expect(shouldSendStreakSave({ ...atRisk, paused: true })).toBe(false);
  });

  it("does NOT fire twice in a day", () => {
    expect(shouldSendStreakSave({ ...atRisk, alreadySentToday: true })).toBe(false);
  });

  it("is suppressed when the streak category is toggled off", () => {
    expect(shouldSendStreakSave(atRisk, { streak: false })).toBe(false);
  });
});

describe("isWithinDailyCap", () => {
  it("allows up to cap, blocks beyond", () => {
    expect(isWithinDailyCap({ "2026-08-14": 0 }, "2026-08-14", 4)).toBe(true);
    expect(isWithinDailyCap({ "2026-08-14": 3 }, "2026-08-14", 4)).toBe(true);
    expect(isWithinDailyCap({ "2026-08-14": 4 }, "2026-08-14", 4)).toBe(false);
    expect(isWithinDailyCap({}, "2026-08-14", 4)).toBe(true);
  });
});

describe("resolvePersonalizedSendHour", () => {
  it("falls back to the evening hour with no history", () => {
    expect(resolvePersonalizedSendHour([], DEFAULT_PREFS)).toBe(EVENING_HOUR);
    expect(resolvePersonalizedSendHour(undefined, DEFAULT_PREFS)).toBe(EVENING_HOUR);
  });

  it("uses the most common open hour", () => {
    expect(resolvePersonalizedSendHour([8, 8, 8, 21, 21], DEFAULT_PREFS)).toBe(8);
  });

  it("an explicit prefs.sendHour always wins", () => {
    expect(resolvePersonalizedSendHour([8, 8, 8], { sendHour: 20 })).toBe(20);
  });
});
