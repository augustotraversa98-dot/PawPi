import { describe, it, expect } from "vitest";
import {
  signPickupToken,
  verifyPickupToken,
  PICKUP_TOKEN_TTL_SECONDS,
} from "./walkPickupToken";

const PAYLOAD = { owner_user_id: 7, pet_id: 3, provider_id: 100 };

describe("walkPickupToken", () => {
  it("round-trips a signed token → verified payload", () => {
    const token = signPickupToken(PAYLOAD);
    const out = verifyPickupToken(token);
    expect(out).toMatchObject(PAYLOAD);
    expect(typeof out.exp).toBe("number");
  });

  it("stamps exp = now + TTL", () => {
    const now = 1_700_000_000_000;
    const token = signPickupToken(PAYLOAD, { now });
    const out = verifyPickupToken(token, { now });
    expect(out.exp).toBe(Math.floor(now / 1000) + PICKUP_TOKEN_TTL_SECONDS);
  });

  it("rejects an EXPIRED token", () => {
    const now = 1_700_000_000_000;
    const token = signPickupToken(PAYLOAD, { now, ttlSeconds: 60 });
    // 61s later → expired.
    expect(verifyPickupToken(token, { now: now + 61_000 })).toBeNull();
  });

  it("rejects a TAMPERED payload (signature mismatch)", () => {
    const token = signPickupToken(PAYLOAD);
    const [, sig] = token.split(".");
    // Swap the payload for a forged one, keep the old signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ owner_user_id: 7, pet_id: 3, provider_id: 999, exp: 9_999_999_999 }),
    ).toString("base64url");
    expect(verifyPickupToken(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyPickupToken(null)).toBeNull();
    expect(verifyPickupToken("")).toBeNull();
    expect(verifyPickupToken("no-dot")).toBeNull();
    expect(verifyPickupToken("a.")).toBeNull();
    expect(verifyPickupToken(".b")).toBeNull();
  });
});
