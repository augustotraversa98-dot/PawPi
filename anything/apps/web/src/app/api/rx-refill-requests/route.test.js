import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/rx-refill-requests — owner files a refill on their own active Rx (ticket 2.53).

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 } };
const PROFILE = [{ id: 7 }];
const post = (body) =>
  new Request("http://localhost/api/rx-refill-requests", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("400 without prescription_id", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await POST(post({}))).status).toBe(400);
});

it("404 when the Rx is not the owner's", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([]); // RLS read → none
  expect((await POST(post({ prescription_id: 1 }))).status).toBe(404);
});

it("files the request (201) on the owner's Rx", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE)
    .mockResolvedValueOnce([{ pet_id: 5 }]) // owner's Rx
    .mockResolvedValueOnce([{ id: 9, status: "requested" }]); // insert
  const res = await POST(post({ prescription_id: 1 }));
  expect(res.status).toBe(201);
  expect((await res.json()).request.status).toBe("requested");
});

it("a no-refills Rx (RLS WITH CHECK rejects) → clean 400", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE)
    .mockResolvedValueOnce([{ pet_id: 5 }])
    .mockRejectedValueOnce(new Error('new row violates row-level security policy'));
  expect((await POST(post({ prescription_id: 1 }))).status).toBe(400);
});
