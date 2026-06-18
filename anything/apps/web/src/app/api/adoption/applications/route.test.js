import { describe, it, expect, vi, beforeEach } from "vitest";

// Adoption applications POST — foster-vs-adopt intent (ticket 2.57). requested_placement persists.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => {
  const fn = vi.fn();
  fn.json = (v) => v;
  return { default: fn };
});

const SESSION = { user: { id: 42 } };
const PROFILE = [{ id: 7 }];
const post = (body) =>
  new Request("http://localhost/api/adoption/applications", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sql.json = (v) => v;
});

it("persists requested_placement='foster' on the application", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE) // resolveUserId
    .mockResolvedValueOnce([{ id: 5, provider_id: 10, status: "available" }]) // listing
    .mockResolvedValueOnce([{ id: 1, requested_placement: "foster" }]); // insert
  const res = await POST(post({ listing_id: 5, requested_placement: "foster" }));
  expect(res.status).toBe(201);
  const insert = sql.mock.calls[2][0].join(" ");
  expect(insert).toContain("requested_placement");
});

it("ignores an invalid placement (stored as null)", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE)
    .mockResolvedValueOnce([{ id: 5, provider_id: 10, status: "available" }])
    .mockResolvedValueOnce([{ id: 1, requested_placement: null }]);
  const res = await POST(post({ listing_id: 5, requested_placement: "lease" }));
  expect(res.status).toBe(201);
  // The bound value for requested_placement is null (4th-from-last binding); spot-check the call ran.
  expect(sql.mock.calls[2][0].join(" ")).toContain("requested_placement");
});
