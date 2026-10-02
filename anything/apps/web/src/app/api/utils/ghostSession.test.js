import { describe, it, expect, vi, beforeEach } from "vitest";

// Ghost session = JWT whose sub is a UUID (pre-#582 Google token). It must be treated as
// signed-out EVERYWHERE, before any query casts the sub to an integer (22P02 → 500).
const UUID = "eb5e3d2e-339e-4ebd-83c6-54fbcf3700ba";

const getToken = vi.fn();
vi.mock("@auth/core/jwt", () => ({ getToken: (...a) => getToken(...a) }));
vi.mock("hono/context-storage", () => ({
  getContext: () => ({ req: { raw: {}, header: () => undefined } }),
}));
const sqlFn = vi.fn();
vi.mock("./sql", () => ({
  default: Object.assign((...a) => sqlFn(...a), { begin: undefined }),
  getActiveTx: () => undefined,
  runWithTx: (_t, fn) => fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("isValidAuthUserId", async () => {
  const { isValidAuthUserId } = await import("./authUserId.js");
  it("accepts positive integers (number or string)", () => {
    expect(isValidAuthUserId(7)).toBe(true);
    expect(isValidAuthUserId("42")).toBe(true);
  });
  it.each([UUID, "", "0", "-1", "1.5", "12abc", null, undefined, {}])("rejects %s", (v) => {
    expect(isValidAuthUserId(v)).toBe(false);
  });
});

describe("auth() shim", () => {
  it("returns no session for a UUID-sub token (→ routes 401)", async () => {
    getToken.mockResolvedValue({ sub: UUID, exp: 9999999999 });
    const { default: CreateAuth } = await import("../../../__create/@auth/create.js");
    expect(await CreateAuth().auth()).toBeUndefined();
  });
  it("returns the session for an integer-sub token", async () => {
    getToken.mockResolvedValue({ sub: "12", exp: 9999999999, email: "a@b.c" });
    const { default: CreateAuth } = await import("../../../__create/@auth/create.js");
    expect((await CreateAuth().auth()).user.id).toBe("12");
  });
});

describe("isTokenRevoked", () => {
  it("revokes a UUID sub even when the token has NO iat, without querying", async () => {
    vi.doMock("@/app/api/utils/sql", () => ({ default: sqlFn }));
    const { isTokenRevoked } = await import("./tokenRevocation.js");
    expect(await isTokenRevoked(UUID, undefined)).toBe(true);
    expect(sqlFn).not.toHaveBeenCalled();
  });
});
