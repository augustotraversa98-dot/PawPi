import { describe, it, expect, vi, beforeEach } from "vitest";

// Degrade-clean contract (ticket 2.92): the provider_follows table (migration 0083) is applied to
// Supabase AFTER this code deploys, so a missing-table error (Postgres undefined_table, 42P01) must
// yield the empty/degraded result — never a 500. Session, identity, sql, and the request-context
// wrapper are mocked at the module boundary (no live DB); requestContext is a passthrough so the
// exported GET/POST/DELETE are the raw handlers.

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));

import { GET, POST, DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

const MISSING_TABLE = { code: "42P01" };
const req = (method) => new Request("http://localhost/providers/100/follow", { method });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue({ user: { id: 42 } });
  resolveUserId.mockResolvedValue(7);
});

describe("provider follow — degrades cleanly when provider_follows is absent (2.92)", () => {
  it("GET returns not-following / 0 followers (200, not 500)", async () => {
    sql.mockRejectedValue(MISSING_TABLE); // every query → undefined_table
    const res = await GET(req("GET"), { params: { id: "100" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ following: false, followersCount: 0 });
  });

  it("POST accepts the tap as a pending no-op (200, not 500)", async () => {
    sql
      .mockResolvedValueOnce([{ id: 100 }]) // providers exists
      .mockRejectedValueOnce(MISSING_TABLE); // INSERT into provider_follows → undefined_table
    const res = await POST(req("POST"), { params: { id: "100" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ following: false, pending: true });
  });

  it("DELETE returns not-following (200, not 500)", async () => {
    sql.mockRejectedValue(MISSING_TABLE);
    const res = await DELETE(req("DELETE"), { params: { id: "100" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ following: false, pending: true });
  });

  it("a non-integer id 404s before touching SQL", async () => {
    const res = await POST(req("POST"), { params: { id: "following" } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });
});
