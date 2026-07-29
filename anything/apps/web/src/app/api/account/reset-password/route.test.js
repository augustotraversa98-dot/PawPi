import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/account/reset-password — finishes a self-service reset.
//
// Two things these tests pin down:
//   • the SHARED 2.32 strength rule applies here, so a reset can't become a back door to a
//     password signup would have refused;
//   • every rejection reason collapses to ONE message, so a token guesser learns nothing.

import { POST } from "./route";
import sql from "@/app/api/utils/sql";
import { hash } from "argon2";
import { hashResetToken } from "@/app/api/utils/passwordResetToken";

// `getActiveTx` models "no request transaction is open", which is the unit-test reality (nothing
// here calls sql.begin). withSavepoint then runs the callback directly — see requestContext.
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn(), getActiveTx: () => null }));
// argon2 is a native module — stub it so the unit suite stays fast and platform-independent.
// Its real use (and the real hash) is exercised by the integration suite.
vi.mock("argon2", () => ({ hash: vi.fn(async (p) => `argon2:${p}`) }));

const INVALID =
  "This reset link is invalid or has expired. Request a new one and try again.";

const GOOD_PASSWORD = "Wagmore2026!";

const post = (body) =>
  new Request("http://localhost/api/account/reset-password", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** The route makes exactly one DB call: the consume helper. */
const mockConsume = (authUserId) =>
  sql.mockResolvedValue([{ auth_user_id: authUserId }]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockConsume(42);
});

describe("POST /api/account/reset-password — happy path", () => {
  it("a valid token + strong password → 200", async () => {
    const res = await POST(post({ token: "tok", password: GOOD_PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain("password has been updated");
  });

  it("consumes the token through the 0069 DEFINER helper (no direct table write)", async () => {
    await POST(post({ token: "tok", password: GOOD_PASSWORD }));
    expect(sql).toHaveBeenCalledTimes(1);
    const query = sql.mock.calls[0][0].join(" ");
    expect(query).toContain("app_consume_password_reset_token");
    expect(/insert\s+into|update\s+auth_accounts/i.test(query)).toBe(false);
  });

  it("sends the token's HASH, never the token itself", async () => {
    await POST(post({ token: "tok", password: GOOD_PASSWORD }));
    const [, tokenHash] = sql.mock.calls[0];
    expect(tokenHash).toBe(hashResetToken("tok"));
    expect(tokenHash).not.toBe("tok");
  });

  // The DB must never see a plaintext password — hashing stays in the app layer, alongside
  // src/auth.js's sign-up path, so the parameters live in exactly one place.
  it("argon2-hashes the password in the app layer; the DB gets only the hash", async () => {
    await POST(post({ token: "tok", password: GOOD_PASSWORD }));
    expect(hash).toHaveBeenCalledWith(GOOD_PASSWORD);
    const [, , passwordHash] = sql.mock.calls[0];
    expect(passwordHash).toBe(`argon2:${GOOD_PASSWORD}`);
    expect(passwordHash).not.toBe(GOOD_PASSWORD);
  });
});

describe("POST /api/account/reset-password — the 2.32 strength rule", () => {
  it.each([
    ["too short", "Ab1!"],
    ["only two character classes", "alllowercase1"],
    ["a common password", "password1"],
    ["empty", ""],
  ])("rejects a weak password (%s) with 400 and never touches the DB", async (_label, password) => {
    const res = await POST(post({ token: "tok", password }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it("returns the shared validator's own message, so the copy can't drift", async () => {
    const res = await POST(post({ token: "tok", password: "short1" }));
    const body = await res.json();
    expect(body.error).toBe("Use at least 8 characters");
    expect(body.errors).toContain("Use at least 8 characters");
  });

  it("a non-string password is refused", async () => {
    const res = await POST(post({ token: "tok", password: 12345678 }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("accepts exactly what sign-up accepts (same util, same verdict)", async () => {
    const res = await POST(post({ token: "tok", password: "Correct-Horse9" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/account/reset-password — one message for every rejection", () => {
  it("an unknown / used / expired token (helper → null) → 400 with the single message", async () => {
    mockConsume(null);
    const res = await POST(post({ token: "tok", password: GOOD_PASSWORD }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(INVALID);
  });

  it("a REPLAYED token gets the same answer as a never-existing one", async () => {
    mockConsume(null);
    const replay = await POST(post({ token: "burned", password: GOOD_PASSWORD }));
    const unknown = await POST(post({ token: "never", password: GOOD_PASSWORD }));
    expect(replay.status).toBe(unknown.status);
    expect(await replay.json()).toEqual(await unknown.json());
  });

  it("a missing token → 400 with the same message, no DB call", async () => {
    const res = await POST(post({ password: GOOD_PASSWORD }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(INVALID);
    expect(sql).not.toHaveBeenCalled();
  });

  it("a non-string token → 400, no DB call", async () => {
    const res = await POST(post({ token: { $ne: null }, password: GOOD_PASSWORD }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("a missing body → 400", async () => {
    const res = await POST(post(undefined));
    expect(res.status).toBe(400);
  });

  it("an empty helper result is treated as a rejection, not a success", async () => {
    sql.mockResolvedValue([]);
    const res = await POST(post({ token: "tok", password: GOOD_PASSWORD }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(INVALID);
  });

  it("a DB failure → 500 and leaks nothing about the token", async () => {
    sql.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ token: "tok", password: GOOD_PASSWORD }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("boom");
  });
});
