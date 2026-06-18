import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH .../rx-refill-requests/[requestId] — vet decides a refill via decide_rx_refill (ticket 2.53).

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
const PARAMS = { params: { id: "10", requestId: "3" } };
const PROFILE = [{ id: 7 }];
const patch = (body) =>
  new Request("http://localhost/api/providers/10/rx-refill-requests/3", {
    method: "PATCH", body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
});

it("rejects an invalid decision", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await PATCH(patch({ decision: "maybe" }), PARAMS)).status).toBe(400);
});

it("approve → decide_rx_refill runs and returns the new status", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ result: "approved" }]);
  const res = await PATCH(patch({ decision: "approve" }), PARAMS);
  expect(res.status).toBe(200);
  expect((await res.json()).status).toBe("approved");
  expect(sql.mock.calls[1][0].join(" ")).toContain("decide_rx_refill");
});

it("forbidden result → 403", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ result: "forbidden" }]);
  expect((await PATCH(patch({ decision: "approve" }), PARAMS)).status).toBe(403);
});

it("already-decided → 409", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ result: "already_decided" }]);
  expect((await PATCH(patch({ decision: "decline" }), PARAMS)).status).toBe(409);
});
