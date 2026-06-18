import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/pet-caregivers — person↔person sharing (ticket 2.47). auth() + sql mocked.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));

const SESSION = { user: { id: 99 }, expires: "9999999999" };

function mockSql({ profile = [{ id: 7 }], pet = [{ id: 1 }], grantee = [{ id: 8 }], grants = [], insert = [{ id: 20 }] } = {}) {
  sql.mockImplementation((strings) => {
    const q = Array.isArray(strings) ? strings.join(" ") : "";
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve(profile);
    if (q.includes("FROM pets WHERE id")) return Promise.resolve(pet);
    if (q.includes("FROM user_profiles WHERE username")) return Promise.resolve(grantee);
    if (q.includes("INSERT INTO pet_caregivers")) return Promise.resolve(insert);
    if (q.includes("FROM pet_caregivers")) return Promise.resolve(grants);
    return Promise.resolve([]); // audit insert
  });
}

const postReq = (body) =>
  new Request("http://localhost/api/pet-caregivers", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET", () => {
  it("401 unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/pet-caregivers?petId=1"))).status).toBe(401);
  });

  it("mine=true lists pets shared with me", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ grants: [{ id: 5, pet_name: "Rex", role: "caregiver" }] });
    const res = await GET(new Request("http://localhost/api/pet-caregivers?mine=true"));
    expect(res.status).toBe(200);
    expect((await res.json()).grants[0].id).toBe(5);
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("grantee_user_id =");
  });

  it("owner lists grants for their pet", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ grants: [{ id: 6, grantee_username: "jane", role: "family" }] });
    const res = await GET(new Request("http://localhost/api/pet-caregivers?petId=1"));
    expect(res.status).toBe(200);
    expect((await res.json()).grants[0].grantee_username).toBe("jane");
  });
});

describe("POST invite", () => {
  it("owner invites a user as family (derives scopes, status pending)", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ insert: [{ id: 20, role: "family", status: "pending" }] });
    const res = await POST(postReq({ petId: 1, role: "family", granteeUsername: "jane" }));
    expect(res.status).toBe(201);
    expect((await res.json()).grant.id).toBe(20);
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("INSERT INTO pet_caregivers");
    expect(text).toContain("INSERT INTO pet_caregiver_audit");
  });

  it("403 when the pet is not the caller's", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ pet: [] });
    expect((await POST(postReq({ petId: 2, role: "family", granteeUsername: "jane" }))).status).toBe(403);
  });

  it("404 when the invited username does not exist", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ grantee: [] });
    expect((await POST(postReq({ petId: 1, role: "caregiver", granteeUsername: "ghost" }))).status).toBe(404);
  });

  it("400 on an invalid role", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql();
    expect((await POST(postReq({ petId: 1, role: "boss", granteeUsername: "jane" }))).status).toBe(400);
  });
});
