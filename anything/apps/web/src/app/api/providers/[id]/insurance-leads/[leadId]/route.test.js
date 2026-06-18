import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH .../insurance-leads/[leadId] — insurer updates a lead status (ticket 2.54).

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error { constructor(m) { super(m); this.status = 403; } }
  return { requireProviderCapability: vi.fn(), ProviderAuthError };
});

const SESSION = { user: { id: 42 } };
const PARAMS = { params: { id: "10", leadId: "5" } };
const PROFILE = [{ id: 7 }];
const patch = (body) =>
  new Request("http://localhost/api/providers/10/insurance-leads/5", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
});

it("rejects an invalid status", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await PATCH(patch({ status: "spam" }), PARAMS)).status).toBe(400);
});

it("updates the status (RLS scopes to staff)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 5, status: "contacted" }]);
  const res = await PATCH(patch({ status: "contacted" }), PARAMS);
  expect(res.status).toBe(200);
  expect((await res.json()).lead.status).toBe("contacted");
});

it("404 when the lead isn't this provider's (RLS → zero rows)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([]);
  expect((await PATCH(patch({ status: "closed" }), PARAMS)).status).toBe(404);
});
