import { formatScheduledTime } from "./scheduledTimeFormat";

// The time-of-day part comes from the device locale (12h vs 24h), so tests
// compute the expected time part with the SAME Intl call and assert the day
// qualifier logic around it — deterministic on any CI locale/timezone, since
// all fixture dates are built with local-time constructors.

const timePart = (d) =>
  d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Tue Jun 9 2026, 14:00 local.
const NOW = new Date(2026, 5, 9, 14, 0, 0);

describe("formatScheduledTime", () => {
  it("same local day → time only", () => {
    const t = new Date(2026, 5, 9, 20, 0, 0);
    expect(formatScheduledTime(t.toISOString(), NOW)).toBe(timePart(t));
  });

  it("same day boundary: 00:00 today is today, 23:59 yesterday is Yesterday", () => {
    const midnight = new Date(2026, 5, 9, 0, 0, 0);
    const lateYesterday = new Date(2026, 5, 8, 23, 59, 0);
    expect(formatScheduledTime(midnight.toISOString(), NOW)).toBe(
      timePart(midnight),
    );
    expect(formatScheduledTime(lateYesterday.toISOString(), NOW)).toBe(
      `Yesterday ${timePart(lateYesterday)}`,
    );
  });

  it("previous local day → Yesterday + time", () => {
    const t = new Date(2026, 5, 8, 20, 0, 0);
    expect(formatScheduledTime(t.toISOString(), NOW)).toBe(
      `Yesterday ${timePart(t)}`,
    );
  });

  it("next local day → Tomorrow + time", () => {
    const t = new Date(2026, 5, 10, 8, 0, 0);
    expect(formatScheduledTime(t.toISOString(), NOW)).toBe(
      `Tomorrow ${timePart(t)}`,
    );
  });

  it("2–6 days back → short weekday + time", () => {
    const t = new Date(2026, 5, 6, 20, 0, 0); // Saturday, 3 days before NOW
    const weekday = t.toLocaleDateString([], { weekday: "short" });
    expect(formatScheduledTime(t.toISOString(), NOW)).toBe(
      `${weekday} ${timePart(t)}`,
    );
  });

  it("more than 6 days away → short date + time", () => {
    const t = new Date(2026, 5, 1, 9, 30, 0); // 8 days before NOW
    const date = t.toLocaleDateString([], { month: "short", day: "numeric" });
    expect(formatScheduledTime(t.toISOString(), NOW)).toBe(
      `${date}, ${timePart(t)}`,
    );
  });

  it("accepts an epoch-ms now (the hook's reactive clock)", () => {
    const t = new Date(2026, 5, 8, 20, 0, 0);
    expect(formatScheduledTime(t.toISOString(), NOW.getTime())).toBe(
      `Yesterday ${timePart(t)}`,
    );
  });

  it("returns '' for missing/invalid input instead of throwing", () => {
    expect(formatScheduledTime(null, NOW)).toBe("");
    expect(formatScheduledTime(undefined, NOW)).toBe("");
    expect(formatScheduledTime("not-a-date", NOW)).toBe("");
  });
});
