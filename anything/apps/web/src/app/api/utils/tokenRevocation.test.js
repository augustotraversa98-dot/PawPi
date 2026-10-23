import { describe, it, expect, vi, beforeEach } from "vitest";
import sql from "@/app/api/utils/sql";
import {
  invalidateUserTokens,
  isTokenRevoked,
  clearRevocationCache,
  REVOCATION_CACHE_TTL_MS,
} from "./tokenRevocation";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  clearRevocationCache();
});

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
  it("treats a non-numeric sub (ghost UUID session) as revoked WITHOUT querying", async () => {
    expect(await isTokenRevoked("eb5e3d2e-339e-4ebd-83c6-54fbcf3700ba", 1_700_000_000)).toBe(true);
    expect(sql).not.toHaveBeenCalled();
  });
  it("accepts a numeric-string sub (how @auth/core stringifies the id)", async () => {
    sql.mockResolvedValueOnce([{ token_invalidated_at: null }]);
    expect(await isTokenRevoked("42", 1_700_000_000)).toBe(false);
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("false on missing inputs", async () => {
    expect(await isTokenRevoked(null, 123)).toBe(false);
    expect(await isTokenRevoked(7, undefined)).toBe(false);
  });
});

describe("revocation cutoff cache (perf audit 2026-10-23)", () => {
  const IAT = Math.floor(new Date("2026-07-01T00:00:00Z").getTime() / 1000);

  it("two checks within the TTL cost ONE query", async () => {
    sql.mockResolvedValueOnce([{ token_invalidated_at: null }]);
    expect(await isTokenRevoked(7, IAT)).toBe(false);
    expect(await isTokenRevoked(7, IAT + 5)).toBe(false);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("a cached cutoff still judges each token by its own iat", async () => {
    sql.mockResolvedValueOnce([{ token_invalidated_at: new Date("2026-06-01T00:00:00Z") }]);
    const before = Math.floor(new Date("2026-05-01T00:00:00Z").getTime() / 1000);
    const after = Math.floor(new Date("2026-07-01T00:00:00Z").getTime() / 1000);
    expect(await isTokenRevoked(7, before)).toBe(true); // revoked token
    expect(await isTokenRevoked(7, after)).toBe(false); // newer token of the same user
    expect(await isTokenRevoked(7, before)).toBe(true); // still rejected from the cache
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("re-reads after the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    sql.mockResolvedValue([{ token_invalidated_at: null }]);
    await isTokenRevoked(7, IAT);
    vi.setSystemTime(new Date(Date.now() + REVOCATION_CACHE_TTL_MS - 1));
    await isTokenRevoked(7, IAT);
    expect(sql).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(Date.now() + 2));
    await isTokenRevoked(7, IAT);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("invalidateUserTokens clears the entry so the next check reads the new cutoff", async () => {
    sql.mockResolvedValueOnce([{ token_invalidated_at: null }]); // first check: not revoked, cached
    expect(await isTokenRevoked(7, IAT)).toBe(false);
    sql.mockResolvedValueOnce([]); // the UPDATE
    await invalidateUserTokens(7);
    sql.mockResolvedValueOnce([{ token_invalidated_at: new Date("2026-12-01T00:00:00Z") }]);
    expect(await isTokenRevoked(7, IAT)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it("a lookup that raced an invalidation is not cached", async () => {
    let release;
    sql.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([{ token_invalidated_at: null }]))),
    );
    const inFlight = isTokenRevoked(7, IAT); // reads the OLD row, still pending
    sql.mockResolvedValueOnce([]); // the UPDATE
    await invalidateUserTokens(7);
    release();
    await inFlight;
    sql.mockResolvedValueOnce([{ token_invalidated_at: new Date("2026-12-01T00:00:00Z") }]);
    expect(await isTokenRevoked(7, IAT)).toBe(true); // had to re-read, not served the stale null
  });

  it("does not share entries between users", async () => {
    sql.mockResolvedValueOnce([{ token_invalidated_at: new Date("2026-12-01T00:00:00Z") }]);
    sql.mockResolvedValueOnce([{ token_invalidated_at: null }]);
    expect(await isTokenRevoked(7, IAT)).toBe(true);
    expect(await isTokenRevoked(8, IAT)).toBe(false);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("never caches a failed lookup (stays fail-open and retries)", async () => {
    sql.mockRejectedValueOnce(new Error("blip"));
    expect(await isTokenRevoked(7, IAT)).toBe(false);
    sql.mockResolvedValueOnce([{ token_invalidated_at: new Date("2026-12-01T00:00:00Z") }]);
    expect(await isTokenRevoked(7, IAT)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(2);
  });
});
