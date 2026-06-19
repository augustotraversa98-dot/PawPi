import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/calendar/event/[id].ics — visibility-scoped event ICS export (ticket 2.80).
// Auth-gated; returns a spec-valid text/calendar payload for an event the caller can see
// (published+non-deleted OR hosted), 404 otherwise. The WHERE enforces the same
// visibility as the events listing (RLS events_read is the backstop).

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const get = (id) =>
  new Request(`http://localhost/api/calendar/event/${id}`, { method: "GET" });

const ROW = {
  id: 7,
  title: "Puppy Social",
  description: "Bring water; meet at the gate",
  starts_at: "2026-08-01T15:00:00Z",
  ends_at: "2026-08-01T17:00:00Z",
  location_name: "Central Park",
  address: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/calendar/event/[id].ics", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(get("7.ics"), { params: { id: "7.ics" } })).status).toBe(401);
  });

  it("no user profile → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(null);
    expect((await GET(get("7.ics"), { params: { id: "7.ics" } })).status).toBe(404);
  });

  it("visible event → 200 text/calendar with a valid VEVENT (UTC times)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([ROW]);
    const res = await GET(get("7.ics"), { params: { id: "7.ics" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain("event-7.ics");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("UID:event-7@pawpi");
    expect(body).toContain("DTSTART:20260801T150000Z");
    expect(body).toContain("DTEND:20260801T170000Z");
    expect(body).toContain("SUMMARY:Puppy Social");
    expect(body).toContain("Bring water\\; meet at the gate");
  });

  it("the query enforces visibility (non-deleted + published-or-host)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([ROW]);
    await GET(get("7.ics"), { params: { id: "7.ics" } });
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("deleted_at IS NULL");
    expect(q).toContain("status = 'published'");
    expect(q).toContain("host_user_id =");
  });

  it("not visible / missing → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // RLS/visibility filter excluded it
    expect((await GET(get("7.ics"), { params: { id: "7.ics" } })).status).toBe(404);
  });

  it("DB error → 500", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    expect((await GET(get("7.ics"), { params: { id: "7.ics" } })).status).toBe(500);
  });
});
