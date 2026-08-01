import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST .../telehealth/sessions/[sessionId]/join — a PARTICIPANT joins the room (ticket 2.18).
// Participant-only (RLS scopes the SELECT → no row = 403); video dormant behind keys (503 when
// unconfigured); first join flips scheduled → in_progress. getVideoRoom is REAL (env-driven);
// auth + sql mocked; resolveUserId runs for real (sql call 1 = profile lookup).
//
// Follow-up: the OWNER early-join gate (5 minutes before appointment_date/appointment_time, OR
// once status is already in_progress). Vet/staff (non-owner) joins are never gated — see the
// "staff" tests below.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100", sessionId: "1" } };
const req = (qs = "") => new Request(`http://localhost/x${qs}`, { method: "POST" });

let savedKey, savedSecret;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId
  savedKey = process.env.VIDEO_API_KEY;
  savedSecret = process.env.VIDEO_API_SECRET;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.VIDEO_API_KEY;
  else process.env.VIDEO_API_KEY = savedKey;
  if (savedSecret === undefined) delete process.env.VIDEO_API_SECRET;
  else process.env.VIDEO_API_SECRET = savedSecret;
});

function configureVideo() {
  process.env.VIDEO_API_KEY = "vk";
  process.env.VIDEO_API_SECRET = "vs";
}
function unconfigureVideo() {
  delete process.env.VIDEO_API_KEY;
  delete process.env.VIDEO_API_SECRET;
}

describe("POST telehealth join", () => {
  it("a non-participant (RLS returns no row) → 403, no join link", async () => {
    configureVideo();
    sql.mockResolvedValueOnce([]); // session SELECT → none (RLS)
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(403);
  });

  it("video vendor unconfigured (staff join, no gate) → clean 503 (nothing crashes)", async () => {
    unconfigureVideo();
    // No owner_user_id set → not the caller (7) → treated as staff, ungated.
    sql.mockResolvedValueOnce([{ id: 1, provider_id: 100, status: "scheduled" }]); // session
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(503);
  });

  it("staff join succeeds → returns a joinUrl/token and flips scheduled → in_progress", async () => {
    configureVideo();
    sql.mockResolvedValueOnce([{ id: 1, provider_id: 100, status: "scheduled" }]); // session
    sql.mockResolvedValueOnce([{ id: 1, provider_id: 100, status: "in_progress" }]); // UPDATE

    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.joinUrl).toBe("string");
    expect(data.joinUrl.length).toBeGreaterThan(0);
    expect(data.session.status).toBe("in_progress");
    // The UPDATE flipped status → in_progress.
    const upd = sql.mock.calls[2];
    expect(upd[0].join(" ")).toContain("UPDATE telehealth_sessions");
    expect(upd[0].join(" ")).toContain("in_progress");
  });

  it("an already-ended consult → 409 (no link)", async () => {
    configureVideo();
    sql.mockResolvedValueOnce([{ id: 1, provider_id: 100, status: "ended" }]);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
  });

  it("staff join anytime, even hours before the scheduled time (no gate)", async () => {
    configureVideo();
    sql.mockResolvedValueOnce([
      {
        id: 1,
        provider_id: 100,
        status: "scheduled",
        owner_user_id: 999, // NOT the caller (7) → staff
        appointment_date: "2026-08-01",
        appointment_time: "22:00:00",
      },
    ]);
    sql.mockResolvedValueOnce([{ id: 1, provider_id: 100, status: "in_progress" }]); // UPDATE

    const res = await POST(
      req("?today=2026-08-01&nowTime=09:00"), // hours before appointment — irrelevant for staff
      PARAMS,
    );
    expect(res.status).toBe(200);
  });

  describe("owner early-join gate", () => {
    const OWNER_ROW = {
      id: 1,
      provider_id: 100,
      status: "scheduled",
      owner_user_id: 7, // matches resolveUserId's mocked profile id → isOwner
      appointment_date: "2026-08-01",
      appointment_time: "10:15:00",
    };

    it("more than 5 minutes early → 425, not ready, no join link requested", async () => {
      configureVideo();
      sql.mockResolvedValueOnce([{ ...OWNER_ROW }]);
      const res = await POST(req("?today=2026-08-01&nowTime=09:50"), PARAMS);
      expect(res.status).toBe(425);
      const data = await res.json();
      expect(data.ready).toBe(false);
      expect(data.availableAt).toEqual({ date: "2026-08-01", time: "10:10" });
      // No further sql calls beyond the session SELECT (no getVideoRoom / UPDATE attempted).
      expect(sql).toHaveBeenCalledTimes(2); // resolveUserId + session SELECT
    });

    it("exactly at the 5-minute boundary → allowed", async () => {
      configureVideo();
      sql.mockResolvedValueOnce([{ ...OWNER_ROW }]);
      sql.mockResolvedValueOnce([{ ...OWNER_ROW, status: "in_progress" }]); // UPDATE
      const res = await POST(req("?today=2026-08-01&nowTime=10:10"), PARAMS);
      expect(res.status).toBe(200);
    });

    it("inside the 5-minute window → allowed", async () => {
      configureVideo();
      sql.mockResolvedValueOnce([{ ...OWNER_ROW }]);
      sql.mockResolvedValueOnce([{ ...OWNER_ROW, status: "in_progress" }]); // UPDATE
      const res = await POST(req("?today=2026-08-01&nowTime=10:12"), PARAMS);
      expect(res.status).toBe(200);
    });

    it("already in_progress → allowed even though early (vet started first)", async () => {
      configureVideo();
      sql.mockResolvedValueOnce([{ ...OWNER_ROW, status: "in_progress" }]);
      const res = await POST(req("?today=2026-08-01&nowTime=09:00"), PARAMS);
      expect(res.status).toBe(200);
    });

    it("missing the client's today/nowTime params → 425 (fail closed)", async () => {
      configureVideo();
      sql.mockResolvedValueOnce([{ ...OWNER_ROW }]);
      const res = await POST(req(), PARAMS);
      expect(res.status).toBe(425);
      const data = await res.json();
      expect(data.ready).toBe(false);
    });

    it("booking has no linked appointment date/time → 425 (fail closed)", async () => {
      configureVideo();
      sql.mockResolvedValueOnce([
        { id: 1, provider_id: 100, status: "scheduled", owner_user_id: 7 },
      ]);
      const res = await POST(req("?today=2026-08-01&nowTime=10:12"), PARAMS);
      expect(res.status).toBe(425);
    });
  });
});
