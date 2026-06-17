import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH .../telehealth/sessions/[sessionId] — end / cancel a consult (ticket 2.18).
// Participant-only: the RLS-scoped UPDATE returns no row for a non-participant → 403.
// auth + sql mocked; resolveUserId runs for real (sql call 1 = profile lookup).

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100", sessionId: "1" } };
const req = (body) =>
  new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId
});

describe("PATCH telehealth session", () => {
  it("an invalid action → 400", async () => {
    const res = await PATCH(req({ action: "frobnicate" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("end → status ended (+ ended_at), optional summary", async () => {
    sql.mockResolvedValueOnce([{ id: 1, status: "ended", summary: "Recap" }]); // UPDATE
    const res = await PATCH(req({ action: "end", summary: "Recap" }), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.status).toBe("ended");
    const upd = sql.mock.calls[1];
    expect(upd[0].join(" ")).toContain("UPDATE telehealth_sessions");
    expect(upd[0].join(" ")).toContain("'ended'");
  });

  it("cancel → status cancelled", async () => {
    sql.mockResolvedValueOnce([{ id: 1, status: "cancelled" }]); // UPDATE
    const res = await PATCH(req({ action: "cancel" }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).session.status).toBe("cancelled");
  });

  it("a non-participant (RLS returns no row) → 403", async () => {
    sql.mockResolvedValueOnce([]); // UPDATE affected nothing
    const res = await PATCH(req({ action: "end" }), PARAMS);
    expect(res.status).toBe(403);
  });
});
