import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/pets/[id]/training-classes — the OWNER joins a trainer's GROUP CLASS
// (Ticket 2.10). Owner-context route: pet ownership → class is a published trainer's group
// class → not already enrolled → GROUP-CLASS CAPACITY guard (count-based, the 2.8 pattern,
// clean 409 when full) → insert the roster row. `auth`/`sql` mocked; resolveUserId runs.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "55" } }; // pet id

const postReq = (body) =>
  new Request("http://localhost/api/pets/55/training-classes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

// A capacity-2 published group class of a trainer provider.
const CLASS = { id: 200, provider_id: 100, kind: "group_class", capacity: 2, status: "scheduled" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/pets/[id]/training-classes (owner joins a group class)", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ session_id: 200 }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403 when the caller does not own the pet", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // pet ownership → none
    const res = await POST(postReq({ session_id: 200 }), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO training_progress");
  });

  it("400 when session_id is missing", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]); // pet ownership
    const res = await POST(postReq({}), PARAMS);
    expect(res.status).toBe(400);
  });

  it("404 when the class is not a published trainer's group class", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([]); // class lookup → none
    const res = await POST(postReq({ session_id: 200 }), PARAMS);
    expect(res.status).toBe(404);
    expect(allQueryText()).not.toContain("INSERT INTO training_progress");
  });

  it("409 when the pet is already enrolled in the class", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([CLASS]) // class lookup
      .mockResolvedValueOnce([{ id: 9 }]); // duplicate enrollment found
    const res = await POST(postReq({ session_id: 200 }), PARAMS);
    expect(res.status).toBe(409);
    expect(allQueryText()).not.toContain("INSERT INTO training_progress");
  });

  it("409 'This class is full' when at capacity (the count-based guard)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([CLASS]) // class lookup (capacity 2)
      .mockResolvedValueOnce([]) // no duplicate
      .mockResolvedValueOnce([{ n: 2 }]); // live attendee count == capacity → full
    const res = await POST(postReq({ session_id: 200 }), PARAMS);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/full/i);
    expect(allQueryText()).not.toContain("INSERT INTO training_progress");
  });

  it("201 joins the class when there is a free seat", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 1, session_id: 200, pet_id: 55, owner_user_id: 7, status: "booked" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([CLASS]) // class lookup
      .mockResolvedValueOnce([]) // no duplicate
      .mockResolvedValueOnce([{ n: 1 }]) // 1 < capacity 2 → seat free
      .mockResolvedValueOnce([CREATED]); // INSERT
    const res = await POST(postReq({ session_id: 200 }), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.progress).toEqual(CREATED);
    expect(allQueryText()).toContain("INSERT INTO training_progress");
  });
});
