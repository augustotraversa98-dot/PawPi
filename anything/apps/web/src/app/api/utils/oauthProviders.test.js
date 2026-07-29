import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { socialProviders, enabledSocialProviderIds } from "./oauthProviders";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const TEST_APPLE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

// Ticket 2.46 — social providers are ADDITIVE + ENV-GATED. With no keys, login is unchanged.

describe("socialProviders gating", () => {
  it("returns NO providers when no social env is set (login unchanged)", () => {
    expect(socialProviders({})).toEqual([]);
    expect(enabledSocialProviderIds({})).toEqual([]);
  });

  it("does NOT enable a provider when only one of its two keys is present", () => {
    expect(enabledSocialProviderIds({ AUTH_GOOGLE_ID: "x" })).toEqual([]);
    expect(enabledSocialProviderIds({ AUTH_GOOGLE_SECRET: "y" })).toEqual([]);
    expect(enabledSocialProviderIds({ AUTH_APPLE_ID: "x" })).toEqual([]);
  });

  it("enables Google only when both Google keys are present", () => {
    const env = { AUTH_GOOGLE_ID: "gid", AUTH_GOOGLE_SECRET: "gsecret" };
    expect(enabledSocialProviderIds(env)).toEqual(["google"]);
    const providers = socialProviders(env);
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe("google");
  });

  it("enables Apple only when both Apple keys are present", () => {
    const env = { AUTH_APPLE_ID: "aid", AUTH_APPLE_SECRET: "asecret" };
    expect(enabledSocialProviderIds(env)).toEqual(["apple"]);
    const providers = socialProviders(env);
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe("apple");
  });

  it("enables BOTH when all four keys are present", () => {
    const env = {
      AUTH_GOOGLE_ID: "gid",
      AUTH_GOOGLE_SECRET: "gsecret",
      AUTH_APPLE_ID: "aid",
      AUTH_APPLE_SECRET: "asecret",
    };
    expect(enabledSocialProviderIds(env)).toEqual(["google", "apple"]);
    expect(socialProviders(env).map((p) => p.id).sort()).toEqual(["apple", "google"]);
  });

  it("enables Apple via generated key material (AUTH_APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY) instead of a static secret", () => {
    const env = {
      AUTH_APPLE_ID: "com.pawpi.app.signin",
      AUTH_APPLE_TEAM_ID: "TEAM123456",
      AUTH_APPLE_KEY_ID: "KEY1234567",
      AUTH_APPLE_PRIVATE_KEY: TEST_APPLE_PRIVATE_KEY,
    };
    expect(enabledSocialProviderIds(env)).toEqual(["apple"]);
    const providers = socialProviders(env);
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe("apple");
    // The generated JWT, not a literal env value, ends up as the clientSecret.
    expect(providers[0].options.clientSecret.split(".")).toHaveLength(3);
  });

  it("prefers generated key material over a static AUTH_APPLE_SECRET when both are set", () => {
    const env = {
      AUTH_APPLE_ID: "com.pawpi.app.signin",
      AUTH_APPLE_SECRET: "a-static-secret-that-should-be-ignored",
      AUTH_APPLE_TEAM_ID: "TEAM123456",
      AUTH_APPLE_KEY_ID: "KEY1234567",
      AUTH_APPLE_PRIVATE_KEY: TEST_APPLE_PRIVATE_KEY,
    };
    const [apple] = socialProviders(env);
    expect(apple.options.clientSecret).not.toBe("a-static-secret-that-should-be-ignored");
    expect(apple.options.clientSecret.split(".")).toHaveLength(3);
  });

  it("does not enable Apple, and does not throw, when only SOME of the new key-material vars are set", () => {
    const env = {
      AUTH_APPLE_ID: "com.pawpi.app.signin",
      AUTH_APPLE_TEAM_ID: "TEAM123456",
      // KEY_ID and PRIVATE_KEY missing, no static AUTH_APPLE_SECRET either.
    };
    expect(() => socialProviders(env)).not.toThrow();
    expect(socialProviders(env)).toEqual([]);
    expect(enabledSocialProviderIds(env)).toEqual([]);
  });

  it("does not throw and simply disables Apple when the private key is malformed", () => {
    const env = {
      AUTH_APPLE_ID: "com.pawpi.app.signin",
      AUTH_APPLE_TEAM_ID: "TEAM123456",
      AUTH_APPLE_KEY_ID: "KEY1234567",
      AUTH_APPLE_PRIVATE_KEY: "not a real key",
    };
    expect(() => socialProviders(env)).not.toThrow();
    expect(socialProviders(env)).toEqual([]);
  });

  it("constructs the providers synchronously (no network) — pure config objects", () => {
    const env = { AUTH_GOOGLE_ID: "gid", AUTH_GOOGLE_SECRET: "gsecret" };
    const [google] = socialProviders(env);
    // The factory stows the passed config under .options. allowDangerousEmailAccountLinking
    // lets an OAuth login attach to an existing email user.
    expect(google.options.allowDangerousEmailAccountLinking).toBe(true);
    expect(google.options.clientId).toBe("gid");
    expect(google.type).toBe("oidc"); // Google is an OIDC provider in @auth/core
  });
});
