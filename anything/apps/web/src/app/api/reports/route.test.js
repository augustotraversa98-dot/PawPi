import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/reports — user report ledger (Guideline 1.2, T2).

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/reports", { method: "POST", body: JSON.stringify(body) });
const good = { target_type: "post", target_id: 5, reason: "spam" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("POST /api/reports", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post(good))).status).toBe(401);
  });

  it("invalid target_type → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ ...good, target_type: "nope" }))).status).toBe(400);
  });

  it("invalid target_id → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ ...good, target_id: 0 }))).status).toBe(400);
  });

  it("invalid reason → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ ...good, reason: "whatever" }))).status).toBe(400);
  });

  it("valid new report → 201 (reporter = caller)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no existing open report
    sql.mockResolvedValueOnce([{ id: 1, reporter_user_id: 7, target_type: "post", target_id: 5 }]);
    const res = await POST(post(good));
    expect(res.status).toBe(201);
    expect((await res.json()).report).toMatchObject({ reporter_user_id: 7 });
    expect(sql.mock.calls[1][0].join(" ")).toContain("INSERT INTO content_reports");
  });

  it("accepts provider_post_comment as a target_type (A3)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no existing open report
    sql.mockResolvedValueOnce([{ id: 2, reporter_user_id: 7, target_type: "provider_post_comment", target_id: 9 }]);
    const res = await POST(post({ target_type: "provider_post_comment", target_id: 9, reason: "spam" }));
    expect(res.status).toBe(201);
  });

  it("provider_post is an accepted target_type → 201 (Guideline 1.2 storefront posts)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no existing open report
    sql.mockResolvedValueOnce([
      { id: 2, reporter_user_id: 7, target_type: "provider_post", target_id: 9 },
    ]);
    const res = await POST(post({ target_type: "provider_post", target_id: 9, reason: "spam" }));
    expect(res.status).toBe(201);
    expect((await res.json()).report).toMatchObject({ target_type: "provider_post" });
  });

  it("a duplicate open report is idempotent → 200 already_reported", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, reporter_user_id: 7, status: "open" }]);
    const res = await POST(post(good));
    expect(res.status).toBe(200);
    expect((await res.json()).already_reported).toBe(true);
  });
});

describe("GET /api/reports", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(new Request("http://localhost/api/reports"))).status).toBe(401);
  });

  it("lists the caller's own reports → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, target_type: "post" }]);
    const res = await GET(new Request("http://localhost/api/reports"));
    expect(res.status).toBe(200);
    expect((await res.json()).reports).toHaveLength(1);
    expect(sql.mock.calls[0][0].join(" ")).toContain("reporter_user_id");
  });
});
