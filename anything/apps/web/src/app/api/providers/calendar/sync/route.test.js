import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/providers/calendar/sync (ticket 2.84) — the import scheduler. Proves: disabled with no
// CRON_SECRET (503); wrong secret → 401; with the secret it enumerates active feeds, syncs each, and
// an unreachable feed fails soft (counted in `failed`, run still 200). sql + calendarImport mocked.

import { POST } from "./route";
import sql from "@/app/api/utils/sql";
import { fetchIcsFeed, parseIcsBusy } from "@/app/api/utils/calendarImport";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/calendarImport", () => ({
  fetchIcsFeed: vi.fn(),
  parseIcsBusy: vi.fn(),
}));

const req = (secret) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : {},
  });

let savedSecret;
beforeEach(() => {
  vi.clearAllMocks();
  savedSecret = process.env.CRON_SECRET;
  // sql.json is used by the route; provide a passthrough.
  sql.json = (v) => v;
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

describe("POST providers/calendar/sync", () => {
  it("no CRON_SECRET configured → 503, never reads feeds", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("anything"));
    expect(res.status).toBe(503);
    expect(sql).not.toHaveBeenCalled();
  });

  it("wrong secret → 401", async () => {
    process.env.CRON_SECRET = "right";
    const res = await POST(req("wrong"));
    expect(res.status).toBe(401);
  });

  it("syncs reachable feeds and soft-fails unreachable ones", async () => {
    process.env.CRON_SECRET = "s3cret";
    // 1) enumerate active feeds
    sql.mockResolvedValueOnce([
      { id: 1, provider_id: 10, ics_url: "https://ok/feed.ics" },
      { id: 2, provider_id: 20, ics_url: "https://bad/feed.ics" },
    ]);
    fetchIcsFeed
      .mockResolvedValueOnce("BEGIN:VCALENDAR…") // feed 1 reachable
      .mockResolvedValueOnce(null); // feed 2 unreachable
    parseIcsBusy.mockReturnValue([{ starts_at: "x", ends_at: "y" }]);
    // 2) app_sync_calendar_feed for feed 1
    sql.mockResolvedValueOnce([{}]);

    const res = await POST(req("s3cret"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processed).toBe(2);
    expect(data.synced).toBe(1);
    expect(data.failed).toEqual([{ feedId: 2, reason: "unreachable" }]);
  });
});
