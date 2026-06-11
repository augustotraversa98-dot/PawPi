import { describe, it, expect, vi, beforeEach } from "vitest";

// Route contract for DELETE /api/health/reminder-dismissals — clears a routine's
// heads-up acknowledgments (the `${id}::early` rows) so an edit / re-enable
// rebuilds its early reminders fresh (ticket/early-reminder-headsup). Session and
// DB are mocked at the module boundary — no live DB. The point is the contract +
// the SCOPING of the delete: owner + pet + routine, and ONLY `%::early` keys.

import { DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

// Identity chain: auth_users.id (42) -> user_profiles.auth_user_id (42) ->
// user_profiles.id (7) = owner_user_id on the dismissal rows.
const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

const req = (qs, method = "DELETE") =>
  new Request(`http://localhost/api/health/reminder-dismissals${qs}`, { method });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DELETE /api/health/reminder-dismissals — clear early acks", () => {
  it("anonymous -> 401, NOT 500, and never touches the DB", async () => {
    auth.mockResolvedValue(undefined);

    const res = await DELETE(req("?petId=1&routineId=16"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("missing petId or routineId -> 400 (no DB)", async () => {
    auth.mockResolvedValue(SESSION);

    expect((await DELETE(req("?routineId=16"))).status).toBe(400);
    expect((await DELETE(req("?petId=1"))).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("authed -> 200 and deletes ONLY the pet+routine `%::early` rows", async () => {
    auth.mockResolvedValue(SESSION);
    // 1st sql: profile lookup. 2nd: the scoped DELETE ... RETURNING id (2 rows).
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 11 }, { id: 12 }]);

    const res = await DELETE(req("?petId=1&routineId=16"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });

    // Two tagged-template calls: profile lookup, then the delete.
    expect(sql).toHaveBeenCalledTimes(2);

    // The delete is scoped to owner + pet + routine and the `%::early` namespace
    // only — so real skip dismissals and other routines'/pets' rows are untouched.
    const [strings, ...params] = sql.mock.calls[1];
    const queryText = strings.join("?");
    expect(queryText).toContain("DELETE FROM reminder_dismissals");
    expect(queryText).toContain("pet_id =");
    expect(queryText).toContain("owner_user_id =");
    expect(queryText).toContain("routine_id =");
    expect(queryText).toContain("instance_key LIKE");
    // Bound params, in order: pet_id, owner_user_id (profile id), routine_id, LIKE pattern.
    expect(params).toEqual([1, 7, 16, "%::early"]);
  });

  it("user profile not found -> 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no profile row

    const res = await DELETE(req("?petId=1&routineId=16"));
    expect(res.status).toBe(404);
  });
});
