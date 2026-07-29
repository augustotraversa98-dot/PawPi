import { describe, it, expect } from "vitest";
import { generateKeyPairSync, verify as cryptoVerify } from "node:crypto";
import { buildAppleClientSecret } from "./appleClientSecret";

// Throwaway ES256 (P-256) test keypair — never used for anything real.
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const TEST_PRIVATE_KEY_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

function decodePart(b64url) {
  return JSON.parse(Buffer.from(b64url, "base64url").toString("utf8"));
}

describe("buildAppleClientSecret", () => {
  it("throws when any required field is missing", () => {
    expect(() =>
      buildAppleClientSecret({ teamId: "T", keyId: "K", privateKey: TEST_PRIVATE_KEY_PEM }),
    ).toThrow();
    expect(() =>
      buildAppleClientSecret({ keyId: "K", privateKey: TEST_PRIVATE_KEY_PEM, clientId: "C" }),
    ).toThrow();
  });

  it("throws on malformed key material instead of crashing silently later", () => {
    expect(() =>
      buildAppleClientSecret({
        teamId: "TEAM123456",
        keyId: "KEY1234567",
        privateKey: "not a real PEM key",
        clientId: "com.pawpi.app.signin",
      }),
    ).toThrow();
  });

  it("builds a well-formed, correctly-signed ES256 JWT from known test key material", () => {
    const now = 1_700_000_000;
    const jwt = buildAppleClientSecret({
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: TEST_PRIVATE_KEY_PEM,
      clientId: "com.pawpi.app.signin",
      now,
    });

    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const [headerPart, payloadPart, sigPart] = parts;

    const header = decodePart(headerPart);
    expect(header).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });

    const payload = decodePart(payloadPart);
    expect(payload.iss).toBe("TEAM123456");
    expect(payload.sub).toBe("com.pawpi.app.signin");
    expect(payload.aud).toBe("https://appleid.apple.com");
    expect(payload.iat).toBe(now);
    // Under Apple's 6-month (15,777,000s) cap.
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(15_777_000);
    expect(payload.exp).toBeGreaterThan(payload.iat);

    // Verify the signature against the matching public key — proves the JWT is genuinely
    // signed with the supplied private key, in the raw IEEE-P1363 format JOSE requires.
    const signingInput = `${headerPart}.${payloadPart}`;
    const signature = Buffer.from(sigPart, "base64url");
    const isValid = cryptoVerify(
      "sha256",
      Buffer.from(signingInput),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    );
    expect(isValid).toBe(true);
  });

  it("regenerating produces a fresh iat/exp each time (no staleness possible)", () => {
    const jwtA = buildAppleClientSecret({
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: TEST_PRIVATE_KEY_PEM,
      clientId: "com.pawpi.app.signin",
      now: 1000,
    });
    const jwtB = buildAppleClientSecret({
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: TEST_PRIVATE_KEY_PEM,
      clientId: "com.pawpi.app.signin",
      now: 2000,
    });
    const payloadA = decodePart(jwtA.split(".")[1]);
    const payloadB = decodePart(jwtB.split(".")[1]);
    expect(payloadA.iat).toBe(1000);
    expect(payloadB.iat).toBe(2000);
  });
});
