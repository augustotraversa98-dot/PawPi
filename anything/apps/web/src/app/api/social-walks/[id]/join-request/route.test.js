import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/social-walks/[id]/join-request — duplicate detection (issue #507).
// The catch previously keyed off the message text ("duplicate key value"),
// which is fragile: postgres.js surfaces the unique-violation via
// `error.code === "23505"` and only sometimes includes that string in
// error.message. The 500 path in issue #507 is exactly a 23505 that the
// substring match didn't catch. Assert we now return 400 either way.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
}));

const SESSION = { user: { id: 99 }, expires: "9999999999" };
const OWNER = [{ id: 7 }];
const PET = [{ id: 1 }];
const WALK = [
  { id: 42, owner_user_id: 8, status: "scheduled", max_pets: 5 },
];

const postReq = (body) =>
  new Request("http://localhost/api/social-walks/42/join-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = { id: "42" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const stubHappyPathPreamble = () => {
  sql
    .mockResolvedValueOnce(OWNER) // user_profiles lookup
    .mockResolvedValueOnce(PET) // pet ownership
    .mockResolvedValueOnce(WALK) // social walk lookup
    .mockResolvedValueOnce([]) // existing approved (none)
    .mockResolvedValueOnce([{ count: 0 }]); // approved count
};

describe("POST /api/social-walks/[id]/join-request duplicate handling", () => {
  it("returns 400 when INSERT fails with SQLSTATE 23505 (no message match)", async () => {
    auth.mockResolvedValue(SESSION);
    stubHappyPathPreamble();
    // porsager/postgres shape: code on the error object; message may not
    // contain the "duplicate key value" phrase in every driver version.
    const err = Object.assign(new Error("insert failed"), { code: "23505" });
    sql.mockRejectedValueOnce(err); // INSERT

    const res = await POST(postReq({ petId: 1 }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Join request already pending");
  });

  it("still returns 400 for legacy 'duplicate key value' message (no code)", async () => {
    auth.mockResolvedValue(SESSION);
    stubHappyPathPreamble();
    const err = new Error(
      'duplicate key value violates unique constraint "idx_social_walk_join_requests_unique_pending"',
    );
    sql.mockRejectedValueOnce(err);

    const res = await POST(postReq({ petId: 1 }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 500 for unrelated errors", async () => {
    auth.mockResolvedValue(SESSION);
    stubHappyPathPreamble();
    sql.mockRejectedValueOnce(new Error("connection reset"));

    const res = await POST(postReq({ petId: 1 }), { params });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create join request");
  });
});
