import { describe, it, expect, vi, beforeEach } from "vitest";
import sql from "@/app/api/utils/sql";
import { invalidateUserTokens, isTokenRevoked } from "./tokenRevocation";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("invalidateUserTokens (AUDIT A-05)", () => {
  it("stamps token_invalidated_at = now() for the user", async () => {
    sql.mockResolvedValueOnce([]);
    await invalidateUserTokens(42);
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("UPDATE auth_users");
    expect(q).toContain("token_invalidated_at = now()");
    expect(sql.mock.calls[0].slice(1)).toContain(42);
  });
  it("no-ops on a null user id", async () => {
    await invalidateUserTokens(null);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("isTokenRevoked (AUDIT A-05)", () => {
  it("true when the token predates the cutoff", async () => {
    const cutoff = new Date("2026-06-01T00:00:00Z");
    sql.mockResolvedValueOnce([{ token_invalidated_at: cutoff }]);
    // iat = a second well before the cutoff
    const iat = Math.floor(new Date("2026-05-01T00:00:00Z").getTime() / 1000);
    expect(await isTokenRevoked(7, iat)).toBe(true);
  });
  it("false when the token was issued after the cutoff", async () => {
    const cutoff = new Date("2026-06-01T00:00:00Z");
    sql.mockResolvedValueOnce([{ token_invalidated_at: cutoff }]);
    const iat = Math.floor(new Date("2026-07-01T00:00:00Z").getTime() / 1000);
    expect(await isTokenRevoked(7, iat)).toBe(false);
  });
  it("false when no cutoff is set (nothing revoked)", async () => {
    sql.mockResolvedValueOnce([{ token_invalidated_at: null }]);
    expect(await isTokenRevoked(7, 1_700_000_000)).toBe(false);
  });
  it("fails OPEN on a DB error (never locks everyone out)", async () => {
    sql.mockRejectedValueOnce(new Error("column does not exist"));
    expect(await isTokenRevoked(7, 1_700_000_000)).toBe(false);
  });
  it("false on missing inputs", async () => {
    expect(await isTokenRevoked(null, 123)).toBe(false);
    expect(await isTokenRevoked(7, undefined)).toBe(false);
  });
});

describe("isTokenRevoked — undefined_column latch (incident 2026-09-16)", () => {
  // Isolated module instance (vi.resetModules) so this doesn't leak the
  // latched in-process flag into the other tests in this file.
  it("stops querying the DB after a 42703 (column truly absent), but not after a generic error", async () => {
    vi.resetModules();
    const freshSql = vi.fn();
    vi.doMock("@/app/api/utils/sql", () => ({ default: freshSql }));
    const { isTokenRevoked: isTokenRevokedFresh } = await import(
      "./tokenRevocation"
    );

    const columnMissing = Object.assign(new Error("column does not exist"), {
      code: "42703",
    });
    freshSql.mockRejectedValueOnce(columnMissing);
    expect(await isTokenRevokedFresh(7, 1_700_000_000)).toBe(false);
    expect(freshSql).toHaveBeenCalledTimes(1);

    // Latched: a second call must not hit the DB again.
    expect(await isTokenRevokedFresh(7, 1_700_000_000)).toBe(false);
    expect(freshSql).toHaveBeenCalledTimes(1);

    vi.doUnmock("@/app/api/utils/sql");
  });
});
