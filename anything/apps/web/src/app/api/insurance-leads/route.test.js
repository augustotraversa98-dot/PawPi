import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/insurance-leads — owner creates/reads own leads (ticket 2.54). Only owner-entered pet
// fields + contact go to the insurer (never the Vet Record).

import { POST, GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 } };
const PROFILE = [{ id: 7 }];
const post = (body) => new Request("http://localhost/api/insurance-leads", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("400 without provider_id", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await POST(post({}))).status).toBe(400);
});

it("403 when naming a pet the caller doesn't own", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([]); // pet not owned
  expect((await POST(post({ provider_id: 10, pet_id: 99 }))).status).toBe(403);
});

it("creates a lead (201) with owner-entered fields; never touches the Vet Record", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE)
    .mockResolvedValueOnce([{ id: 5 }]) // pet owned
    .mockResolvedValueOnce([{ id: 1, status: "new" }]); // insert
  const res = await POST(post({ provider_id: 10, pet_id: 5, pet_species: "dog", contact_email: "a@b.c" }));
  expect(res.status).toBe(201);
  const text = sql.mock.calls.map((c) => c[0].join(" ")).join(" | ");
  expect(text).toContain("INSERT INTO insurance_leads");
  expect(text).not.toContain("pet_medical_profiles"); // no Vet Record attached
});

it("GET returns the owner's own leads", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, provider_name: "PawSure" }]);
  const res = await GET(new Request("http://localhost/api/insurance-leads"));
  expect(res.status).toBe(200);
  expect((await res.json()).leads).toHaveLength(1);
  expect(sql.mock.calls[1][0].join(" ")).toContain("owner_user_id =");
});
