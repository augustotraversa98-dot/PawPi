import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  runWithIdentityScope,
  rememberRequestIdentity,
  recallRequestIdentity,
  getCachedProfileId,
  cacheProfileId,
  forgetCachedProfileId,
  clearCachedProfileIds,
} from "./requestIdentity";

// The per-request identity memo is a latency optimisation whose safety argument is "it can only ever
// return what applyIdentity itself read for that same auth id, on this request". These pin each of the
// ways it must NOT answer.

describe("requestIdentity memo", () => {
  it("is empty outside a request scope (cron, background work, unit tests with a mocked sql)", () => {
    rememberRequestIdentity(42, 7);
    expect(recallRequestIdentity(42)).toBeNull();
  });

  it("returns the remembered profile id for the same auth id inside the scope", () => {
    runWithIdentityScope(() => {
      expect(recallRequestIdentity("42")).toBeNull(); // nothing yet
      rememberRequestIdentity("42", 7);
      expect(recallRequestIdentity("42")).toBe(7);
    });
  });

  it("compares auth ids as strings (session.user.id is a string, callers may pass a number)", () => {
    runWithIdentityScope(() => {
      rememberRequestIdentity("42", 7);
      expect(recallRequestIdentity(42)).toBe(7);
    });
  });

  it("answers null for a DIFFERENT auth id — another caller always gets a real lookup", () => {
    runWithIdentityScope(() => {
      rememberRequestIdentity("42", 7);
      expect(recallRequestIdentity("43")).toBeNull();
    });
  });

  it("never memoises a missing profile (lazy-create paths must still look up and insert)", () => {
    runWithIdentityScope(() => {
      rememberRequestIdentity("42", null);
      rememberRequestIdentity("42", undefined);
      rememberRequestIdentity(null, 7);
      expect(recallRequestIdentity("42")).toBeNull();
    });
  });

  it("does not leak between concurrent requests", async () => {
    const run = (authId, userId, delayMs) =>
      runWithIdentityScope(async () => {
        rememberRequestIdentity(authId, userId);
        await new Promise((r) => setTimeout(r, delayMs));
        return [recallRequestIdentity(authId), recallRequestIdentity(authId === "1" ? "2" : "1")];
      });
    const [a, b] = await Promise.all([run("1", 11, 15), run("2", 22, 1)]);
    expect(a).toEqual([11, null]);
    expect(b).toEqual([22, null]);
  });

  it("is gone once the request scope ends", () => {
    runWithIdentityScope(() => rememberRequestIdentity("42", 7));
    expect(recallRequestIdentity("42")).toBeNull();
  });
});

describe("process-wide auth id -> profile id cache", () => {
  beforeEach(() => clearCachedProfileIds());
  afterEach(() => {
    delete process.env.IDENTITY_CACHE_TTL_MS;
  });

  it("returns what was cached for the same auth id (string/number agnostic) and nothing for others", () => {
    cacheProfileId("42", 7);
    expect(getCachedProfileId(42)).toBe(7);
    expect(getCachedProfileId("43")).toBeNull();
    expect(getCachedProfileId(null)).toBeNull();
  });

  it("expires after the TTL", () => {
    const t0 = 1_000_000;
    cacheProfileId("42", 7, t0);
    expect(getCachedProfileId("42", t0 + 5 * 60 * 1000 - 1)).toBe(7);
    expect(getCachedProfileId("42", t0 + 5 * 60 * 1000)).toBeNull();
  });

  it("forget drops one caller; null/undefined ids are never cached", () => {
    cacheProfileId("42", 7);
    cacheProfileId("43", 8);
    forgetCachedProfileId("42");
    expect(getCachedProfileId("42")).toBeNull();
    expect(getCachedProfileId("43")).toBe(8);
    cacheProfileId("44", null);
    cacheProfileId(null, 9);
    expect(getCachedProfileId("44")).toBeNull();
  });

  it("IDENTITY_CACHE_TTL_MS=0 turns it off", () => {
    process.env.IDENTITY_CACHE_TTL_MS = "0";
    cacheProfileId("42", 7);
    expect(getCachedProfileId("42")).toBeNull();
  });
});

