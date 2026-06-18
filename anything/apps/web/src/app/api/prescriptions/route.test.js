import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/prescriptions?petId= — owner reads own Rx (read-only), labeled by clinic (ticket 2.53).

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 } };
const PROFILE = [{ id: 7 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("401 unauthenticated", async () => {
  auth.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/prescriptions?petId=5"))).status).toBe(401);
});

it("400 without petId", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await GET(new Request("http://localhost/api/prescriptions"))).status).toBe(400);
});

it("returns the owner's Rx with the clinic name + their refill requests", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE)
    .mockResolvedValueOnce([{ id: 1, drug_name: "Amoxicillin", clinic_name: "Happy Vet" }])
    .mockResolvedValueOnce([{ id: 3, prescription_id: 1, status: "requested" }]);
  const res = await GET(new Request("http://localhost/api/prescriptions?petId=5"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.prescriptions[0].clinic_name).toBe("Happy Vet");
  expect(body.refillRequests).toHaveLength(1);
  // owner read is scoped to owner_user_id (no provider join into private fields).
  expect(sql.mock.calls[1][0].join(" ")).toContain("owner_user_id =");
});
