import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/walk-requests — AUDIT A-26: one OPEN request per pet. A double submit
// (or an impatient re-tap) otherwise created several duplicate open requests that
// all fanned out notifications.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/notify", () => ({ safeNotify: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/walk-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  resolveUserId.mockResolvedValue(7);
});

it("409 when the pet already has an OPEN request", async () => {
  sql
    .mockResolvedValueOnce([{ id: 5 }]) // pet ownership
    .mockResolvedValueOnce([{ id: 9 }]) // provider published
    .mockResolvedValueOnce([{ has: true }]) // walker capability
    .mockResolvedValueOnce([{ id: 42 }]); // open-request guard → one exists
  const res = await POST(post({ pet_id: 5, target_provider_id: 9 }));
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.existing_id).toBe(42);
  // The INSERT never ran.
  const texts = sql.mock.calls.map((c) => (c[0] ?? []).join(" "));
  expect(texts.some((t) => t.includes("INSERT INTO walk_requests"))).toBe(false);
});

it("creates the request when the pet has no open one", async () => {
  sql
    .mockResolvedValueOnce([{ id: 5 }]) // pet ownership
    .mockResolvedValueOnce([{ id: 9 }]) // provider published
    .mockResolvedValueOnce([{ has: true }]) // walker capability
    .mockResolvedValueOnce([]) // open-request guard → none
    .mockResolvedValueOnce([{ id: 100, status: "open" }]) // INSERT
    .mockResolvedValue([]); // any fan-out queries
  const res = await POST(post({ pet_id: 5, target_provider_id: 9 }));
  expect(res.status).toBe(201);
  const texts = sql.mock.calls.map((c) => (c[0] ?? []).join(" "));
  expect(texts.some((t) => t.includes("INSERT INTO walk_requests"))).toBe(true);
});
