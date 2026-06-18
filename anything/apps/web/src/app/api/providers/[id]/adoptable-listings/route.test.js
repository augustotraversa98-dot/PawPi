import { describe, it, expect, vi, beforeEach } from "vitest";

// Adoptable-listings POST/GET — foster/urgent/featured flags (ticket 2.57). POST persists the new
// columns (admin); GET returns them + orders featured first. auth/sql/providerAuth mocked.

import { POST, GET } from "./route";
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

it("POST persists placement_type + urgent/featured flags", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, placement_type: "both", is_urgent: true }]);
  const res = await POST(
    new Request("http://localhost/api/providers/10/adoptable-listings", {
      method: "POST",
      body: JSON.stringify({ name: "Pongo", placement_type: "both", is_urgent: true, urgent_reason: "Medical", is_featured: true }),
    }), PARAMS,
  );
  expect(res.status).toBe(201);
  const insert = sql.mock.calls[1][0].join(" ");
  expect(insert).toContain("placement_type");
  expect(insert).toContain("is_urgent");
  expect(insert).toContain("is_featured");
});

it("GET orders featured listings first + returns the new columns", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, is_featured: true }]);
  const res = await GET(new Request("http://localhost/api/providers/10/adoptable-listings"), PARAMS);
  expect(res.status).toBe(200);
  const select = sql.mock.calls[1][0].join(" ");
  expect(select).toContain("is_featured DESC");
  expect(select).toContain("placement_type");
});
