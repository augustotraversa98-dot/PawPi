import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST .../telehealth/sessions/[sessionId]/join — a PARTICIPANT joins the room (ticket 2.18).
// Participant-only (RLS scopes the SELECT → no row = 403); video dormant behind keys (503 when
// unconfigured); first join flips scheduled → in_progress. getVideoRoom is REAL (env-driven);
// auth + sql mocked; resolveUserId runs for real (sql call 1 = profile lookup).

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100", sessionId: "1" } };
const req = () => new Request("http://localhost/x", { method: "POST" });

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

  it("video vendor unconfigured → clean 503 (nothing crashes)", async () => {
    unconfigureVideo();
    sql.mockResolvedValueOnce([{ id: 1, provider_id: 100, status: "scheduled" }]); // session
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(503);
  });

  it("configured participant join → returns a joinUrl/token and flips scheduled → in_progress", async () => {
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
});
