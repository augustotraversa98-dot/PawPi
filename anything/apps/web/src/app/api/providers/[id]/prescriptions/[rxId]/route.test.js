import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH .../prescriptions/[rxId] — vet cancels via cancel_rx (status only, ticket 2.53).

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
const PARAMS = { params: { id: "10", rxId: "1" } };
const PROFILE = [{ id: 7 }];
const patch = (body) =>
  new Request("http://localhost/api/providers/10/prescriptions/1", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
});

it("only cancellation is supported (any other status → 400)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await PATCH(patch({ status: "active" }), PARAMS)).status).toBe(400);
});

it("cancels via cancel_rx", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ ok: true }]);
  const res = await PATCH(patch({ status: "cancelled" }), PARAMS);
  expect(res.status).toBe(200);
  expect(sql.mock.calls[1][0].join(" ")).toContain("cancel_rx");
});

it("cancel_rx false (not the issuing provider) → 403", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ ok: false }]);
  expect((await PATCH(patch({ status: "cancelled" }), PARAMS)).status).toBe(403);
});
