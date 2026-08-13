import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/pets/[id]/walk-pickup-token — the owner mints a signed QR token (Ticket B3). Owner-
// context: owns the pet; binds { owner_user_id, pet_id, provider_id, exp }. auth/sql mocked; the
// token util is REAL (pure crypto) so we assert the token verifies.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { verifyPickupToken } from "@/app/api/utils/walkPickupToken";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "55" } };
const req = (qs = "?provider_id=100") =>
  new Request(`http://localhost/api/pets/55/walk-pickup-token${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/pets/[id]/walk-pickup-token", () => {
  it("401 for a guest", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("404 (before SQL) for a non-integer pet id", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(req(), { params: { id: "abc" } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it("400 when provider_id is missing", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(req(""), PARAMS);
    expect(res.status).toBe(400);
  });

  it("403 when the caller does not own the pet", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]); // ownership → none
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(403);
  });

  it("mints a token bound to owner/pet/provider that verifies", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([{ id: 55 }]); // owns pet
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const { token, expires_at } = await res.json();
    expect(typeof expires_at).toBe("string");
    const payload = verifyPickupToken(token);
    expect(payload).toMatchObject({ owner_user_id: 7, pet_id: 55, provider_id: 100 });
  });
});
