import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/events/[id]/rsvp — own-only rsvp upsert/toggle (ticket 2.74). RLS forbids another user's
// rsvp + rsvping a cancelled event (surfaced as 400).

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "9" } };
const post = (body) =>
  new Request("http://localhost/api/events/9/rsvp", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("POST /api/events/[id]/rsvp", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post({ status: "going" }), PARAMS)).status).toBe(401);
  });

  it("invalid status → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ status: "maybe" }), PARAMS)).status).toBe(400);
  });

  it("upserts the rsvp + returns the attendee count → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1, event_id: 9, status: "going" }]) // upsert
      .mockResolvedValueOnce([{ attendee_count: 4 }]); // count
    const res = await POST(post({ status: "going" }), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rsvp).toMatchObject({ status: "going" });
    expect(body.attendee_count).toBe(4);
    expect(sql.mock.calls[0][0].join(" ")).toContain("ON CONFLICT");
  });

  it("RLS rejects rsvp on a cancelled/deleted event → 400", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    expect((await POST(post({ status: "going" }), PARAMS)).status).toBe(400);
  });
});
