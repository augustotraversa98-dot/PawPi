import { describe, it, expect, beforeEach } from "vitest";
import {
  generateKeyPairSync,
  createPublicKey,
  createHash,
  sign as cryptoSign,
} from "node:crypto";
import {
  verifyAppleIdentityToken,
  __resetAppleJwksCacheForTests,
} from "./appleIdentityToken";

// A throwaway RSA keypair standing in for Apple's signing key — never used for anything real.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "TESTKID123";
const BUNDLE_ID = "com.pawpi.app";

// Apple's JWKS shape: the RSA public key exported as a JWK, tagged with the kid we sign under.
const APPLE_JWK = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
const JWKS = [APPLE_JWK];

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

// Mint an identity token signed with our test private key, mirroring Apple's structure.
function mintToken({
  iss = "https://appleid.apple.com",
  aud = BUNDLE_ID,
  sub = "000123.abcdef.0001",
  exp = Math.floor(Date.now() / 1000) + 3600,
  nonce, // optional; when set it is the value Apple echoes (sha256hex of the raw nonce)
  email,
  kid = KID,
  alg = "RS256",
} = {}) {
  const header = { alg, kid, typ: "JWT" };
  const payload = { iss, aud, sub, exp, iat: Math.floor(Date.now() / 1000) };
  if (nonce !== undefined) payload.nonce = nonce;
  if (email !== undefined) payload.email = email;
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = cryptoSign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

function sha256hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

describe("verifyAppleIdentityToken", () => {
  beforeEach(() => __resetAppleJwksCacheForTests());

  it("verifies a well-formed token and returns the payload (happy path)", async () => {
    const rawNonce = "raw-nonce-abc";
    const token = mintToken({ nonce: sha256hex(rawNonce), email: "user@privaterelay.appleid.com" });
    const payload = await verifyAppleIdentityToken({
      identityToken: token,
      rawNonce,
      clientId: BUNDLE_ID,
      jwks: JWKS,
    });
    expect(payload.sub).toBe("000123.abcdef.0001");
    expect(payload.email).toBe("user@privaterelay.appleid.com");
  });

  it("verifies a token that carries no nonce when the caller supplies none", async () => {
    const token = mintToken(); // no nonce claim
    const payload = await verifyAppleIdentityToken({
      identityToken: token,
      clientId: BUNDLE_ID,
      jwks: JWKS,
    });
    expect(payload.sub).toBe("000123.abcdef.0001");
  });

  it("BLOCKED: rejects a token whose signature does not match the key", async () => {
    const token = mintToken();
    // Tamper with the payload after signing → signature no longer matches.
    const [h, , s] = token.split(".");
    const forged = `${h}.${b64url({ iss: "https://appleid.apple.com", aud: BUNDLE_ID, sub: "evil", exp: Math.floor(Date.now() / 1000) + 3600 })}.${s}`;
    await expect(
      verifyAppleIdentityToken({ identityToken: forged, clientId: BUNDLE_ID, jwks: JWKS }),
    ).rejects.toThrow(/signature/);
  });

  it("BLOCKED: rejects a wrong audience (token minted for another app)", async () => {
    const token = mintToken({ aud: "com.someone.else" });
    await expect(
      verifyAppleIdentityToken({ identityToken: token, clientId: BUNDLE_ID, jwks: JWKS }),
    ).rejects.toThrow(/aud/);
  });

  it("BLOCKED: rejects a wrong issuer", async () => {
    const token = mintToken({ iss: "https://evil.example.com" });
    await expect(
      verifyAppleIdentityToken({ identityToken: token, clientId: BUNDLE_ID, jwks: JWKS }),
    ).rejects.toThrow(/iss/);
  });

  it("BLOCKED: rejects an expired token", async () => {
    const token = mintToken({ exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(
      verifyAppleIdentityToken({ identityToken: token, clientId: BUNDLE_ID, jwks: JWKS }),
    ).rejects.toThrow(/expired/);
  });

  it("BLOCKED: rejects when no JWKS key matches the token's kid", async () => {
    const token = mintToken({ kid: "SOMEOTHERKID" });
    await expect(
      verifyAppleIdentityToken({ identityToken: token, clientId: BUNDLE_ID, jwks: JWKS }),
    ).rejects.toThrow(/no Apple key/);
  });

  it("NONCE MISMATCH: rejects when sha256(rawNonce) != token.nonce", async () => {
    const token = mintToken({ nonce: sha256hex("the-real-nonce") });
    await expect(
      verifyAppleIdentityToken({
        identityToken: token,
        rawNonce: "a-different-nonce",
        clientId: BUNDLE_ID,
        jwks: JWKS,
      }),
    ).rejects.toThrow(/nonce mismatch/);
  });

  it("NONCE MISSING: rejects when the token has a nonce but no rawNonce is supplied (replay guard)", async () => {
    const token = mintToken({ nonce: sha256hex("bound-nonce") });
    await expect(
      verifyAppleIdentityToken({ identityToken: token, clientId: BUNDLE_ID, jwks: JWKS }),
    ).rejects.toThrow(/no rawNonce/);
  });

  it("fetches the JWKS from Apple when none is injected (uses the provided fetch)", async () => {
    const rawNonce = "n1";
    const token = mintToken({ nonce: sha256hex(rawNonce) });
    let calledUrl = null;
    const fetchImpl = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ keys: JWKS }) };
    };
    const payload = await verifyAppleIdentityToken({
      identityToken: token,
      rawNonce,
      clientId: BUNDLE_ID,
      fetchImpl,
    });
    expect(calledUrl).toBe("https://appleid.apple.com/auth/keys");
    expect(payload.sub).toBe("000123.abcdef.0001");
  });
});
