import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/saved-places — owner-scoped favorites (ticket 2.73). RLS owner_all is the backstop.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/saved-places", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/saved-places", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET()).status).toBe(401);
  });

  it("owner-scoped list → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, place_id: "p1", name: "Dog Park" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).places).toHaveLength(1);
    expect(sql.mock.calls[0][0].join(" ")).toContain("owner_user_id =");
  });
});

describe("POST /api/saved-places", () => {
  it("missing place_id/name → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ name: "x" }))).status).toBe(400);
  });

  it("saves a place (idempotent upsert) → 201", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, place_id: "p1", name: "Dog Park", category: "park" }]);
    const res = await POST(post({ place_id: "p1", name: "Dog Park", category: "park", lat: 40.7, lng: -74 }));
    expect(res.status).toBe(201);
    expect((await res.json()).place).toMatchObject({ place_id: "p1" });
    expect(sql.mock.calls[0][0].join(" ")).toContain("ON CONFLICT");
  });
});
