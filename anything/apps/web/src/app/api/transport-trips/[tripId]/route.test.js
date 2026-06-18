import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/transport-trips/[tripId] (ticket 2.52) — OWNER cancel only.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 } };
const PARAMS = { params: { tripId: "1" } };
const PROFILE = [{ id: 7 }];
const patch = (body) =>
  new Request("http://localhost/api/transport-trips/1", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("owners can only cancel — any other status is 400", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await PATCH(patch({ status: "confirmed" }), PARAMS)).status).toBe(400);
});

it("owner cancels their own trip and mirrors the booking", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE) // resolveUserId
    .mockResolvedValueOnce([{ id: 1, booking_id: 900, status: "cancelled" }]) // trip cancel
    .mockResolvedValueOnce([{ id: 900 }]); // booking mirror
  const res = await PATCH(patch({ status: "cancelled" }), PARAMS);
  expect(res.status).toBe(200);
  expect((await res.json()).trip.status).toBe("cancelled");
});

it("404 when the trip is not the caller's", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([]);
  expect((await PATCH(patch({ status: "cancelled" }), PARAMS)).status).toBe(404);
});
