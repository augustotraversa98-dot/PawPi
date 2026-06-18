import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/insurance-policies — OWNER side of in-app binding (ticket 2.72). Apply requires terms
// acceptance + an `insurance`-capable insurer; RLS forbids a self-issued number/premium.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requireProviderCapability: vi.fn() };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/insurance-policies", {
    method: "POST",
    body: JSON.stringify(body),
  });
const goodBody = { plan_id: 100, provider_id: 10, pet_id: 5, terms_accepted: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderCapability.mockResolvedValue(undefined);
});

describe("POST /api/insurance-policies", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post(goodBody))).status).toBe(401);
  });

  it("missing provider_id → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ terms_accepted: true }))).status).toBe(400);
  });

  it("terms not accepted → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ provider_id: 10 }))).status).toBe(400);
  });

  it("insurer lacks the insurance capability → 403", async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderCapability.mockRejectedValueOnce(
      Object.assign(new Error("Provider does not have the 'insurance' capability"), { status: 403 }),
    );
    expect((await POST(post(goodBody))).status).toBe(403);
  });

  it("pet not owned → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // pet lookup empty
    expect((await POST(post(goodBody))).status).toBe(404);
  });

  it("valid application → 201", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 5 }]) // pet ok
      .mockResolvedValueOnce([{ id: 1, status: "application" }]);
    const res = await POST(post(goodBody));
    expect(res.status).toBe(201);
    expect((await res.json()).policy).toMatchObject({ status: "application" });
    expect(sql.mock.calls[1][0].join(" ")).toContain("INSERT INTO insurance_policies");
  });

  it("RLS rejects a forbidden write → 400", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 5 }])
      .mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    expect((await POST(post(goodBody))).status).toBe(400);
  });
});

describe("GET /api/insurance-policies", () => {
  it("owner-scoped list → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, status: "active" }]);
    const res = await GET(new Request("http://localhost/api/insurance-policies?petId=5"));
    expect(res.status).toBe(200);
    expect((await res.json()).policies).toHaveLength(1);
    expect(sql.mock.calls[0][0].join(" ")).toContain("pol.owner_user_id =");
  });
});
