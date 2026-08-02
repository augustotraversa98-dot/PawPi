import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/pets/[id]/daycare-stays — the OWNER books a stay (Ticket 2.8). This is an
// owner-context route (pet ownership), so it checks: ownership → provider published +
// HOLDS 'daycare' → location belongs to provider (+ capacity) → OVERBOOK count → insert.
// `auth` + `sql` are mocked at the module boundary; resolveUserId runs for real.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { createCheckout } from "@/app/api/utils/payments";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/payments", () => ({ createCheckout: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "55" } }; // pet id

const postReq = (body) =>
  new Request("http://localhost/api/pets/55/daycare-stays", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

const okBody = {
  provider_id: 100,
  location_id: 20,
  start_date: "2026-08-01",
  end_date: "2026-08-03",
  feeding_instructions: "Two cups",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/pets/[id]/daycare-stays (owner books a stay)", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403 when the caller does not own the pet", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // pet ownership → none
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO daycare_stays");
  });

  it("400 when the provider lacks the 'daycare' capability (the gate)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ id: 100, status: "published" }]) // provider
      .mockResolvedValueOnce([]); // capability lookup → none
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO daycare_stays");
  });

  it("409 when the location is at capacity (OVERBOOK prevention)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ id: 100, status: "published" }]) // provider
      .mockResolvedValueOnce([{ "?column?": 1 }]) // capability present
      .mockResolvedValueOnce([{ id: 20, capacity: 2 }]) // location + capacity 2
      .mockResolvedValueOnce([{ n: 2 }]); // overlap count == capacity
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(409);
    expect(allQueryText()).not.toContain("INSERT INTO daycare_stays");
  });

  it("201 books the stay when capacity is free (count < capacity)", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 1, status: "booked", owner_user_id: 7 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ id: 100, status: "published" }]) // provider
      .mockResolvedValueOnce([{ "?column?": 1 }]) // capability present
      .mockResolvedValueOnce([{ id: 20, capacity: 2 }]) // location + capacity
      .mockResolvedValueOnce([{ n: 1 }]) // overlap count < capacity
      .mockResolvedValueOnce([CREATED]) // INSERT
      .mockResolvedValueOnce([]) // daycare service pricing → none (no charge)
      .mockResolvedValueOnce([]) // requirements (vaccine status)
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.stay).toEqual(CREATED);
    expect(json.checkoutUrl).toBeNull(); // no pricing → free stay, no checkout
    expect(allQueryText()).toContain("INSERT INTO daycare_stays");
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("full-policy daycare charges nightly_rate × nights and returns a checkout link", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 1, status: "booked", owner_user_id: 7 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ id: 100, status: "published" }]) // provider
      .mockResolvedValueOnce([{ "?column?": 1 }]) // capability present
      .mockResolvedValueOnce([{ id: 20, capacity: 2 }]) // location + capacity
      .mockResolvedValueOnce([{ n: 0 }]) // overlap count
      .mockResolvedValueOnce([CREATED]) // INSERT stay
      .mockResolvedValueOnce([
        { nightly_rate_cents: 5000, deposit_cents: 2000, payment_policy: "full" },
      ]) // daycare service pricing
      .mockResolvedValueOnce([{ id: 900, amount_cents: 10000 }]) // order INSERT
      .mockResolvedValueOnce([]); // requirements (vaccine status)
    createCheckout.mockResolvedValueOnce({ checkoutUrl: "https://mp/checkout/900" });

    // okBody is 2026-08-01 → 2026-08-03 = 2 nights.
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(201);
    expect((await res.json()).checkoutUrl).toBe("https://mp/checkout/900");

    const orderInsert = sql.mock.calls.find((c) =>
      (c?.[0] ?? []).join(" ").includes("INSERT INTO orders"),
    );
    expect(orderInsert).toBeTruthy();
    // rate 5000 × 2 nights = 10000 cents, linked via source_ref daycare:1
    expect(orderInsert).toEqual(expect.arrayContaining([10000, "daycare:1"]));
    expect(createCheckout).toHaveBeenCalledTimes(1);
  });

  it("400 when end_date precedes start_date", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]); // pet ownership
    const res = await POST(
      postReq({ ...okBody, start_date: "2026-08-05", end_date: "2026-08-01" }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO daycare_stays");
  });
});
