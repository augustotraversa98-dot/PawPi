import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/providers/[id]/insurance-plans (ticket 2.54). GET capability-gated (RLS scopes rows);
// POST admin-only create.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability, requireProviderRole } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error { constructor(m) { super(m); this.status = 403; } }
  return { requireProviderCapability: vi.fn(), requireProviderRole: vi.fn(), ProviderAuthError };
});

const SESSION = { user: { id: 42 } };
const PARAMS = { params: { id: "10" } };
const PROFILE = [{ id: 7 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  requireProviderRole.mockResolvedValue(undefined);
});

it("GET 401 unauthenticated", async () => {
  auth.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/providers/10/insurance-plans"), PARAMS)).status).toBe(401);
});

it("a non-insurance provider → 403 from the capability gate", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
  requireProviderCapability.mockRejectedValue(new ProviderAuthError("no insurance"));
  expect((await GET(new Request("http://localhost/api/providers/10/insurance-plans"), PARAMS)).status).toBe(403);
});

it("GET lists plans (RLS scopes published-vs-all)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, name: "Gold", published: true }]);
  const res = await GET(new Request("http://localhost/api/providers/10/insurance-plans"), PARAMS);
  expect(res.status).toBe(200);
  expect((await res.json()).plans).toHaveLength(1);
});

it("POST requires a name", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  const res = await POST(new Request("http://localhost/api/providers/10/insurance-plans", { method: "POST", body: "{}" }), PARAMS);
  expect(res.status).toBe(400);
});

it("admin creates a plan (201)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, name: "Gold" }]);
  const res = await POST(
    new Request("http://localhost/api/providers/10/insurance-plans", {
      method: "POST", body: JSON.stringify({ name: "Gold", published: true, coverage_highlights: ["accidents"] }),
    }), PARAMS,
  );
  expect(res.status).toBe(201);
  expect(requireProviderRole).toHaveBeenCalledWith("10", 7, ["owner", "admin"]);
  expect(sql.mock.calls[1][0].join(" ")).toContain("INSERT INTO insurance_plans");
});
