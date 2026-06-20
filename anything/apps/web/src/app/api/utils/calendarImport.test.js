import { describe, it, expect, vi } from "vitest";
import { parseIcsBusy, fetchIcsFeed } from "./calendarImport";

// Pure ICS parsing for business calendar import (ticket 2.84). Proves: VEVENTs → busy windows
// (UTC, all-day, DURATION, line-folding); non-calendar input → []; fetchIcsFeed fails soft.

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-1@google
DTSTART:20260620T130000Z
DTEND:20260620T140000Z
SUMMARY:Busy meeting
END:VEVENT
BEGIN:VEVENT
UID:evt-2@google
DTSTART;VALUE=DATE:20260622
END:VEVENT
BEGIN:VEVENT
UID:evt-3@google
DTSTART:20260623T090000Z
DURATION:PT1H30M
END:VEVENT
END:VCALENDAR`;

describe("parseIcsBusy", () => {
  it("parses timed, all-day and DURATION events into busy windows", () => {
    const busy = parseIcsBusy(ICS);
    expect(busy).toHaveLength(3);
    expect(busy[0]).toEqual({
      starts_at: "2026-06-20T13:00:00.000Z",
      ends_at: "2026-06-20T14:00:00.000Z",
      source_uid: "evt-1@google",
    });
    // all-day with no DTEND → blocks the whole day (24h)
    expect(busy[1].starts_at).toBe("2026-06-22T00:00:00.000Z");
    expect(busy[1].ends_at).toBe("2026-06-23T00:00:00.000Z");
    // DURATION PT1H30M → +90 min
    expect(busy[2].starts_at).toBe("2026-06-23T09:00:00.000Z");
    expect(busy[2].ends_at).toBe("2026-06-23T10:30:00.000Z");
  });

  it("unfolds RFC-5545 folded lines", () => {
    const folded = `BEGIN:VEVENT\r\nUID:fold\r\nDTSTART:20260620T130\r\n 000Z\r\nDTEND:20260620T140000Z\r\nEND:VEVENT`;
    const busy = parseIcsBusy(folded);
    expect(busy[0].starts_at).toBe("2026-06-20T13:00:00.000Z");
  });

  it("returns [] for empty / non-calendar input and skips bad events", () => {
    expect(parseIcsBusy("")).toEqual([]);
    expect(parseIcsBusy("hello world")).toEqual([]);
    // start after end → skipped
    const bad = `BEGIN:VEVENT\nDTSTART:20260620T140000Z\nDTEND:20260620T130000Z\nEND:VEVENT`;
    expect(parseIcsBusy(bad)).toEqual([]);
  });
});

describe("fetchIcsFeed", () => {
  it("returns text on a 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => ICS });
    expect(await fetchIcsFeed("https://x/feed.ics", { fetchImpl })).toBe(ICS);
  });

  it("fails soft (null) on a non-URL, a non-ok response, or a throw", async () => {
    expect(await fetchIcsFeed("not-a-url")).toBeNull();
    expect(
      await fetchIcsFeed("https://x", { fetchImpl: vi.fn().mockResolvedValue({ ok: false }) }),
    ).toBeNull();
    expect(
      await fetchIcsFeed("https://x", {
        fetchImpl: vi.fn().mockRejectedValue(new Error("boom")),
      }),
    ).toBeNull();
  });
});
