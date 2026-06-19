import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/calendar/booking/[id].ics — owner-scoped booking ICS export (ticket 2.79).
// Auth-gated; returns a spec-valid text/calendar payload for the owner's own booking and
// a clean 404 for anyone else's (the SQL filters owner_user_id = the caller).

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const get = (id) =>
  new Request(`http://localhost/api/calendar/booking/${id}`, { method: "GET" });

const ROW = {
  id: 9,
  title: "Annual Checkup",
  appointment_date: "2026-07-01",
  appointment_time: "10:00:00",
  clinic: "PawCare",
  veterinarian: "Dr. Smith",
  reason_for_visit: "Vaccines, booster",
  notes: "Bring records",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/calendar/booking/[id].ics", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(get("9.ics"), { params: { id: "9.ics" } })).status).toBe(401);
  });

  it("no user profile → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(null);
    expect((await GET(get("9.ics"), { params: { id: "9.ics" } })).status).toBe(404);
  });

  it("owner booking → 200 text/calendar with a valid VEVENT", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([ROW]);
    const res = await GET(get("9.ics"), { params: { id: "9.ics" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain("booking-9.ics");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("UID:booking-9@pawpi");
    expect(body).toContain("DTSTART:20260701T100000");
    expect(body).toContain("Vaccines\\, booster");
  });

  it("strips the .ics suffix before querying by id", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([ROW]);
    await GET(get("9.ics"), { params: { id: "9.ics" } });
    // the bound id param must be the bare "9", not "9.ics"
    expect(sql.mock.calls[0].slice(1)).toContain("9");
  });

  it("another owner's / missing booking → 404 (never returns it)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // owner_user_id filter excluded it
    const res = await GET(get("9.ics"), { params: { id: "9.ics" } });
    expect(res.status).toBe(404);
  });

  it("DB error → 500", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    expect((await GET(get("9.ics"), { params: { id: "9.ics" } })).status).toBe(500);
  });
});
