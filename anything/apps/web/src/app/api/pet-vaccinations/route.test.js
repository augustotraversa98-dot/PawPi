import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/pet-vaccinations?petId=... — OWNER-side read (Ticket 8). Owner-context,
// NOT assertCareAccess: resolveUserId runs for real against mocked sql, so sql
// call 1 is the profile lookup and sql 2 is the owner-scoped vaccinations read.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

const reqWith = (qs) =>
  new Request(`http://localhost/api/pet-vaccinations${qs}`);

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(" ");
const lastValues = () => lastCall()?.slice(1) ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/pet-vaccinations", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(reqWith("?petId=55"));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("missing petId → 400", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(reqWith(""));
    expect(res.status).toBe(400);
  });

  it("returns only the caller's pet's non-deleted vaccinations", async () => {
    auth.mockResolvedValue(SESSION);
    const VAX = [{ id: 9, name: "Rabies" }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce(VAX); // owner-scoped read
    const res = await GET(reqWith("?petId=55"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ vaccinations: VAX });

    const text = lastQueryText();
    expect(text).toContain("FROM pet_vaccinations");
    expect(text).toContain("owner_user_id =");
    expect(text).toContain("deleted_at IS NULL");
    const values = lastValues();
    expect(values).toContain("55"); // petId
    expect(values).toContain(7); // owner_user_id = me
  });
});
