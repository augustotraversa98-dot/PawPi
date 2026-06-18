import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/nutrition-plans — owner-scoped per-pet nutrition plan (ticket 2.75). RLS owner_all backstops.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/nutrition-plans", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/nutrition-plans", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(new Request("http://localhost/api/nutrition-plans?petId=5"))).status).toBe(401);
  });

  it("missing petId → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await GET(new Request("http://localhost/api/nutrition-plans"))).status).toBe(400);
  });

  it("owner-scoped list → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, food_brand: "Acme" }]);
    const res = await GET(new Request("http://localhost/api/nutrition-plans?petId=5"));
    expect(res.status).toBe(200);
    expect((await res.json()).plans).toHaveLength(1);
    expect(sql.mock.calls[0][0].join(" ")).toContain("owner_user_id =");
  });
});

describe("POST /api/nutrition-plans", () => {
  it("missing pet_id → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ food_brand: "Acme" }))).status).toBe(400);
  });

  it("invalid food_form → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ pet_id: 5, food_form: "gas" }))).status).toBe(400);
  });

  it("pet not owned → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // pet lookup empty
    expect((await POST(post({ pet_id: 5, food_brand: "Acme" }))).status).toBe(404);
  });

  it("valid plan → 201", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 5 }]) // pet ok
      .mockResolvedValueOnce([{ id: 1, food_brand: "Acme", pet_id: 5 }]);
    const res = await POST(post({ pet_id: 5, food_brand: "Acme", food_form: "dry", target_calories: 500 }));
    expect(res.status).toBe(201);
    expect((await res.json()).plan).toMatchObject({ food_brand: "Acme" });
    expect(sql.mock.calls[1][0].join(" ")).toContain("INSERT INTO nutrition_plans");
  });
});
