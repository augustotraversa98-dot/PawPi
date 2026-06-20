import { describe, it, expect, vi, beforeEach } from "vitest";

// POST .../calendar-feeds/[feedId]/sync — "Refresh now" (ticket 2.84). Proves: a reachable feed
// parses + writes busy via the DEFINER; an unreachable feed fails soft (synced:0, ok:false, 200);
// a feed not owned by this provider → 404.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { fetchIcsFeed, parseIcsBusy } from "@/app/api/utils/calendarImport";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => ({ requireProviderRole: vi.fn() }));
vi.mock("@/app/api/utils/calendarImport", () => ({
  fetchIcsFeed: vi.fn(),
  parseIcsBusy: vi.fn(),
}));

const SESSION = { user: { id: 42 }, expires: "9999" };
const PARAMS = { params: { id: "100", feedId: "5" } };
const req = () => new Request("http://localhost/x", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  requireProviderRole.mockResolvedValue({ role: "owner" });
  sql.json = (v) => v;
  sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId
});

describe("calendar-feeds/[feedId]/sync", () => {
  it("syncs a reachable feed and reports the count", async () => {
    sql.mockResolvedValueOnce([{ id: 5, ics_url: "https://ok/f.ics" }]); // feed lookup
    fetchIcsFeed.mockResolvedValue("BEGIN:VCALENDAR…");
    parseIcsBusy.mockReturnValue([{ starts_at: "a", ends_at: "b" }]);
    sql.mockResolvedValueOnce([{ written: 3 }]); // app_sync_calendar_feed
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ synced: 3, ok: true });
  });

  it("fails soft when the feed is unreachable", async () => {
    sql.mockResolvedValueOnce([{ id: 5, ics_url: "https://bad/f.ics" }]);
    fetchIcsFeed.mockResolvedValue(null);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.synced).toBe(0);
  });

  it("404 when the feed isn't this provider's", async () => {
    sql.mockResolvedValueOnce([]); // feed lookup empty
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
  });
});
