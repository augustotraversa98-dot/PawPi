// Ticket 2.38 — real relative time from created_at (no more fake "just now").

import { formatRelativeTime } from "./relativeTime";

const NOW = Date.parse("2026-06-18T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe("formatRelativeTime", () => {
  it("'just now' only for the last minute", () => {
    expect(formatRelativeTime(ago(10 * SEC), NOW)).toBe("just now");
    expect(formatRelativeTime(ago(59 * SEC), NOW)).toBe("just now");
  });

  it("minutes then hours", () => {
    expect(formatRelativeTime(ago(5 * MIN), NOW)).toBe("5m");
    expect(formatRelativeTime(ago(59 * MIN), NOW)).toBe("59m");
    expect(formatRelativeTime(ago(1 * HR), NOW)).toBe("1h");
    expect(formatRelativeTime(ago(23 * HR), NOW)).toBe("23h");
  });

  it("yesterday then days", () => {
    expect(formatRelativeTime(ago(1 * DAY), NOW)).toBe("yesterday");
    expect(formatRelativeTime(ago(3 * DAY), NOW)).toBe("3d");
  });

  it("a real date for older posts", () => {
    // 10 days ago → falls through to a locale date string (not a bucket).
    const out = formatRelativeTime(ago(10 * DAY), NOW);
    expect(out).not.toMatch(/just now|m$|h$|yesterday|d$/);
  });

  it("future / skew reads as just now; empty/invalid → empty string", () => {
    expect(formatRelativeTime(ago(-5 * MIN), NOW)).toBe("just now");
    expect(formatRelativeTime("", NOW)).toBe("");
    expect(formatRelativeTime(null, NOW)).toBe("");
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });

  // A2b: the options form { now, t } localizes every bucket via react-i18next's translate fn.
  describe("localized ({ now, t }) form", () => {
    // Fake translator: returns "<key>|<count>" so we can assert the exact key + params used.
    const t = (key, params) =>
      params && params.count != null ? `${key}|${params.count}` : key;

    it("uses feed.* keys for each bucket", () => {
      expect(formatRelativeTime(ago(10 * SEC), { now: NOW, t })).toBe("feed.justNow");
      expect(formatRelativeTime(ago(5 * MIN), { now: NOW, t })).toBe("feed.minutesShort|5");
      expect(formatRelativeTime(ago(2 * HR), { now: NOW, t })).toBe("feed.hoursShort|2");
      expect(formatRelativeTime(ago(1 * DAY), { now: NOW, t })).toBe("feed.yesterday");
      expect(formatRelativeTime(ago(3 * DAY), { now: NOW, t })).toBe("feed.daysShort|3");
    });

    it("still returns empty for missing/invalid even with a translator (no fabricated time)", () => {
      expect(formatRelativeTime(null, { now: NOW, t })).toBe("");
      expect(formatRelativeTime("", { now: NOW, t })).toBe("");
      expect(formatRelativeTime("not-a-date", { now: NOW, t })).toBe("");
    });
  });
});
