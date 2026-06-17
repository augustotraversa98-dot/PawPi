import { describe, it, expect, beforeEach, afterEach } from "vitest";

// tokenCrypto (ticket 2.16) — AES-256-GCM encrypt/decrypt of provider payment tokens at
// rest. Proves: round-trip; ciphertext != plaintext + version prefix; legacy plaintext
// passes through; tampered ciphertext fails GCM auth cleanly; missing key → encrypt throws
// while a plaintext decrypt still passes through.

import { encryptToken, decryptToken, TokenCryptoConfigError } from "./tokenCrypto";

// 32 zero bytes, as 64 hex chars — a deterministic test key (NOT a real secret).
const HEX_KEY = "0".repeat(64);
let saved;

beforeEach(() => {
  saved = process.env.PAYMENTS_TOKEN_KEY;
  process.env.PAYMENTS_TOKEN_KEY = HEX_KEY;
});
afterEach(() => {
  if (saved === undefined) delete process.env.PAYMENTS_TOKEN_KEY;
  else process.env.PAYMENTS_TOKEN_KEY = saved;
});

describe("encrypt/decrypt round-trip", () => {
  it("decrypts back to the original plaintext", () => {
    const enc = encryptToken("SECRET_TOKEN");
    expect(decryptToken(enc)).toBe("SECRET_TOKEN");
  });

  it("ciphertext differs from plaintext and carries the enc:v1: version prefix", () => {
    const enc = encryptToken("SECRET_TOKEN");
    expect(enc).not.toBe("SECRET_TOKEN");
    expect(enc).not.toContain("SECRET_TOKEN");
    expect(enc.startsWith("enc:v1:")).toBe(true);
  });

  it("uses a random IV — encrypting the same value twice yields different ciphertexts", () => {
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("accepts a base64 key as well as hex", () => {
    process.env.PAYMENTS_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(decryptToken(encryptToken("hi"))).toBe("hi");
  });
});

describe("null / legacy handling", () => {
  it("encryptToken(null|undefined) → null (a null refresh_token stays null)", () => {
    expect(encryptToken(null)).toBeNull();
    expect(encryptToken(undefined)).toBeNull();
  });

  it("decryptToken(null|undefined) → null", () => {
    expect(decryptToken(null)).toBeNull();
    expect(decryptToken(undefined)).toBeNull();
  });

  it("decryptToken passes a non-prefixed (legacy plaintext) value through unchanged", () => {
    expect(decryptToken("legacy-plaintext-token")).toBe("legacy-plaintext-token");
  });
});

describe("tamper resistance", () => {
  it("a tampered ciphertext fails GCM auth and throws (never returns a forged token)", () => {
    const enc = encryptToken("SECRET_TOKEN");
    // Flip a character in the base64 body.
    const flipped =
      enc.slice(0, -2) + (enc.slice(-2, -1) === "A" ? "B" : "A") + enc.slice(-1);
    expect(() => decryptToken(flipped)).toThrow();
  });
});

describe("missing key", () => {
  it("encryptToken throws a 503-shaped config error when PAYMENTS_TOKEN_KEY is unset", () => {
    delete process.env.PAYMENTS_TOKEN_KEY;
    let thrown;
    try {
      encryptToken("SECRET_TOKEN");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(TokenCryptoConfigError);
    expect(thrown.status).toBe(503);
  });

  it("a missing key still passes a plaintext (non-prefixed) row through on decrypt", () => {
    delete process.env.PAYMENTS_TOKEN_KEY;
    expect(decryptToken("legacy-plaintext")).toBe("legacy-plaintext");
  });

  it("rejects a key of the wrong length", () => {
    process.env.PAYMENTS_TOKEN_KEY = "tooshort";
    expect(() => encryptToken("x")).toThrow(TokenCryptoConfigError);
  });
});
