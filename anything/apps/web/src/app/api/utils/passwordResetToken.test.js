import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";

import {
  RESET_TOKEN_TTL_MINUTES,
  buildResetLink,
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  resolveAppOrigin,
} from "./passwordResetToken";

const ORIGINAL_BASE = process.env.APP_BASE_URL;
afterEach(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = ORIGINAL_BASE;
});

const req = (url, headers = {}) => new Request(url, { headers });

describe("generateResetToken", () => {
  it("is 32 bytes of CSPRNG output, base64url (URL-safe, no padding)", () => {
    const token = generateResetToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateResetToken()));
    expect(seen.size).toBe(200);
  });
});

describe("hashResetToken", () => {
  it("is sha256 hex of the token — the DB stores this, never the token", () => {
    const token = "a-known-token";
    expect(hashResetToken(token)).toBe(
      crypto.createHash("sha256").update(token).digest("hex"),
    );
    expect(hashResetToken(token)).toHaveLength(64);
  });

  it("is deterministic (the same link always finds the same row)", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
  });

  it("never returns the token itself", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).not.toBe(token);
  });

  // A malformed request must not produce a lookup key at all — `null` matches no row, whereas a
  // fallback like "" could in principle collide with a badly-written insert.
  it.each([[""], [null], [undefined], [123], [{}]])(
    "returns null for a non-string / empty token (%p)",
    (bad) => {
      expect(hashResetToken(bad)).toBeNull();
    },
  );
});

describe("resetTokenExpiry", () => {
  it(`is ${RESET_TOKEN_TTL_MINUTES} minutes after the given instant`, () => {
    const now = new Date("2026-07-28T12:00:00.000Z");
    expect(resetTokenExpiry(now).toISOString()).toBe("2026-07-28T12:30:00.000Z");
  });

  it("is short — a recovery window, not a login", () => {
    expect(RESET_TOKEN_TTL_MINUTES).toBeLessThanOrEqual(60);
  });
});

describe("resolveAppOrigin", () => {
  // The security-relevant case: a poisoned Host header must NOT be able to redirect a real
  // reset link to an attacker's server when the app has a configured origin.
  it("prefers APP_BASE_URL over anything the request claims", () => {
    process.env.APP_BASE_URL = "https://pawpi-production.up.railway.app";
    const origin = resolveAppOrigin(
      req("http://internal/api/account/forgot-password", {
        host: "evil.test",
        "x-forwarded-host": "evil.test",
        "x-forwarded-proto": "https",
      }),
    );
    expect(origin).toBe("https://pawpi-production.up.railway.app");
  });

  it("strips a trailing slash from APP_BASE_URL so links aren't doubled", () => {
    process.env.APP_BASE_URL = "https://pawpi.info/";
    expect(resolveAppOrigin(req("http://x/y"))).toBe("https://pawpi.info");
  });

  it("falls back to the forwarded proto+host for local/LAN dev", () => {
    delete process.env.APP_BASE_URL;
    const origin = resolveAppOrigin(
      req("http://internal/api/account/forgot-password", {
        "x-forwarded-host": "192.168.1.20:4000",
        "x-forwarded-proto": "http",
      }),
    );
    expect(origin).toBe("http://192.168.1.20:4000");
  });

  it("falls back to the request origin when there are no forwarding headers", () => {
    delete process.env.APP_BASE_URL;
    // Request() always supplies a Host header, so drop headers entirely to reach the last branch.
    expect(
      resolveAppOrigin({ url: "http://localhost:4000/api/account/forgot-password" }),
    ).toBe("http://localhost:4000");
  });
});

describe("buildResetLink", () => {
  it("points at the reset page with the token in the query", () => {
    expect(buildResetLink("https://pawpi.info", "tok123")).toBe(
      "https://pawpi.info/account/reset-password?token=tok123",
    );
  });

  it("URL-encodes the token so it survives the round trip", () => {
    expect(buildResetLink("https://pawpi.info", "a+b/c=")).toBe(
      "https://pawpi.info/account/reset-password?token=a%2Bb%2Fc%3D",
    );
  });
});
