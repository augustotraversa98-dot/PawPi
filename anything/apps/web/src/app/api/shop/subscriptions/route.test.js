import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/shop/subscriptions — the OWNER's auto-reorder plans (Ticket 2.11). REUSES the 2.3
// subscriptions table (plan=cadence + product_id + quantity). `auth`/`sql` mocked.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

const getReq = () => new Request("http://localhost/api/shop/subscriptions");
const postReq = (body) =>
  new Request("http://localhost/api/shop/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/shop/subscriptions", () => {
  it("200 lists the owner's product subscriptions", async () => {
    auth.mockResolvedValue(SESSION);
    const SUBS = [{ id: 1, product_id: 9, plan: "monthly", status: "active" }];
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(SUBS);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect((await res.json()).subscriptions).toEqual(SUBS);
  });
});

describe("POST /api/shop/subscriptions", () => {
  it("400 with an invalid plan/cadence", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({ product_id: 9, plan: "hourly" }), null);
    expect(res.status).toBe(400);
  });

  it("404 when the product is not available", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // product lookup → none
    const res = await POST(postReq({ product_id: 9, plan: "monthly" }), null);
    expect(res.status).toBe(404);
  });

  it("400 refuses to auto-reorder an Rx product", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 9, provider_id: 100, is_rx: true }]); // Rx product
    const res = await POST(postReq({ product_id: 9, plan: "monthly" }), null);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO subscriptions");
  });

  it("201 creates a monthly auto-reorder for a staple", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 1, product_id: 9, plan: "monthly", quantity: 2, status: "active" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 9, provider_id: 100, is_rx: false }]) // product
      .mockResolvedValueOnce([CREATED]); // INSERT
    const res = await POST(
      postReq({ product_id: 9, plan: "monthly", quantity: 2 }),
      null,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).subscription).toEqual(CREATED);
    expect(allQueryText()).toContain("INSERT INTO subscriptions");
  });
});
