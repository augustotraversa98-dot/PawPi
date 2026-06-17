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
});
