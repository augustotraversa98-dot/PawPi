import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH/DELETE .../insurance-plans/[planId] — admin edit/publish/delete (ticket 2.54).

import { PATCH, DELETE } from "./route";
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
const PARAMS = { params: { id: "10", planId: "1" } };
const PROFILE = [{ id: 7 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  requireProviderRole.mockResolvedValue(undefined);
});

it("admin publishes a plan via PATCH", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, published: true }]);
  const res = await PATCH(
    new Request("http://localhost/api/providers/10/insurance-plans/1", { method: "PATCH", body: JSON.stringify({ published: true }) }),
    PARAMS,
  );
  expect(res.status).toBe(200);
  expect((await res.json()).plan.published).toBe(true);
});

it("404 when the plan isn't this provider's", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([]);
  const res = await PATCH(
    new Request("http://localhost/api/providers/10/insurance-plans/1", { method: "PATCH", body: "{}" }),
    PARAMS,
  );
  expect(res.status).toBe(404);
});

it("admin deletes a plan", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1 }]);
  const res = await DELETE(new Request("http://localhost/api/providers/10/insurance-plans/1", { method: "DELETE" }), PARAMS);
  expect(res.status).toBe(200);
});
