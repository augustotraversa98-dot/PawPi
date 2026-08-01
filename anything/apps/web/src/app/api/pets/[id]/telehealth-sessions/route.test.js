import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/pets/[id]/telehealth-sessions — the OWNER's video consults for a pet (ticket 2.18).
// Owner-context; RLS is the real guard. Follow-up: also joins vet_appointments for
// appointment_date/appointment_time so the mobile client can pre-check the early-join gate.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "5" } };
const req = () => new Request("http://localhost/api/pets/5/telehealth-sessions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/pets/[id]/telehealth-sessions", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("404 when the caller has no profile", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns sessions carrying the joined appointment_date/appointment_time", async () => {
    auth.mockResolvedValue(SESSION);
    const SESSIONS = [
      {
        id: 1,
        booking_id: 10,
        pet_id: 5,
        owner_user_id: 7,
        provider_id: 100,
        status: "scheduled",
        provider_name: "Dr. Jane",
        appointment_date: "2026-08-01",
        appointment_time: "10:15:00",
      },
    ];
    sql.mockResolvedValueOnce(SESSIONS);

    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessions: SESSIONS });

    const queryText = sql.mock.calls[0][0].join(" ");
    expect(queryText).toContain("FROM telehealth_sessions");
    expect(queryText).toContain("LEFT JOIN vet_appointments");
    expect(queryText).toContain("va.appointment_date");
    expect(queryText).toContain("va.appointment_time");
    expect(queryText).toContain("ts.owner_user_id =");
  });

  it("empty → { sessions: [] }", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    const res = await GET(req(), PARAMS);
    expect(await res.json()).toEqual({ sessions: [] });
  });
});
