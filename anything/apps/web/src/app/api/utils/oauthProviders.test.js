import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  socialProviders,
  enabledSocialProviderIds,
  googleProvider,
  appleNativeProvider,
  socialEnabled,
} from "./oauthProviders";

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

describe("googleProvider", () => {
  it("returns [] without both Google keys", () => {
    expect(googleProvider({})).toEqual([]);
    expect(googleProvider({ AUTH_GOOGLE_ID: "x" })).toEqual([]);
  });
  it("returns the single Google provider when both keys are present", () => {
    const [google] = googleProvider({ AUTH_GOOGLE_ID: "gid", AUTH_GOOGLE_SECRET: "gsecret" });
    expect(google.id).toBe("google");
    expect(google.options.clientId).toBe("gid");
  });
});

describe("socialEnabled", () => {
  it("reports google only when both Google keys are set", () => {
    expect(socialEnabled({})).toEqual({ google: false, apple: false });
    expect(socialEnabled({ AUTH_GOOGLE_ID: "g" })).toEqual({ google: false, apple: false });
    expect(socialEnabled({ AUTH_GOOGLE_ID: "g", AUTH_GOOGLE_SECRET: "s" })).toEqual({
      google: true,
      apple: false,
    });
  });
  it("reports apple whenever AUTH_APPLE_ID is set (native audience needs no client secret)", () => {
    expect(socialEnabled({ AUTH_APPLE_ID: "com.pawpi.app" })).toEqual({
      google: false,
      apple: true,
    });
  });
});

describe("appleNativeProvider", () => {
  const fakeAdapter = () => ({
    getUserByAccount: vi.fn().mockResolvedValue(null),
    getUserByEmail: vi.fn().mockResolvedValue(null),
    createUser: vi.fn(async (u) => ({ id: 42, ...u })),
    linkAccount: vi.fn().mockResolvedValue(undefined),
  });

  it("returns [] when AUTH_APPLE_ID is absent", () => {
    expect(appleNativeProvider({ env: {}, adapter: fakeAdapter() })).toEqual([]);
  });
  it("returns [] when no adapter is provided", () => {
    expect(appleNativeProvider({ env: { AUTH_APPLE_ID: "com.pawpi.app" } })).toEqual([]);
  });
  it("registers an 'apple-native' credentials provider when gated on", () => {
    const [p] = appleNativeProvider({ env: { AUTH_APPLE_ID: "com.pawpi.app" }, adapter: fakeAdapter() });
    // The @auth/core Credentials factory keeps the custom id under .options.id.
    expect(p.options.id).toBe("apple-native");
    expect(p.type).toBe("credentials");
  });

  it("HAPPY: verifies, creates the user, links the apple account, returns the user", async () => {
    const adapter = fakeAdapter();
    const verify = vi.fn().mockResolvedValue({ sub: "apple-sub-1", email: "a@privaterelay.appleid.com" });
    const [p] = appleNativeProvider({ env: { AUTH_APPLE_ID: "com.pawpi.app" }, adapter, verify });

    const user = await p.options.authorize({
      identityToken: "tok",
      rawNonce: "raw",
      name: "Ada Lovelace",
    });

    expect(verify).toHaveBeenCalledWith({ identityToken: "tok", rawNonce: "raw", clientId: "com.pawpi.app" });
    expect(adapter.getUserByAccount).toHaveBeenCalledWith({ provider: "apple", providerAccountId: "apple-sub-1" });
    expect(adapter.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@privaterelay.appleid.com", name: "Ada Lovelace" }),
    );
    expect(adapter.linkAccount).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "apple", providerAccountId: "apple-sub-1", userId: 42 }),
    );
    expect(user.id).toBe(42);
  });

  it("RETURNING: reuses the linked user and does not create a new one", async () => {
    const adapter = fakeAdapter();
    adapter.getUserByAccount.mockResolvedValue({ id: 7, email: "known@x.com" });
    const verify = vi.fn().mockResolvedValue({ sub: "apple-sub-1" });
    const [p] = appleNativeProvider({ env: { AUTH_APPLE_ID: "com.pawpi.app" }, adapter, verify });

    const user = await p.options.authorize({ identityToken: "tok", rawNonce: "raw" });
    expect(user.id).toBe(7);
    expect(adapter.createUser).not.toHaveBeenCalled();
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it("BLOCKED: returns null (no user created) when verification throws", async () => {
    const adapter = fakeAdapter();
    const verify = vi.fn().mockRejectedValue(new Error("nonce mismatch"));
    const [p] = appleNativeProvider({ env: { AUTH_APPLE_ID: "com.pawpi.app" }, adapter, verify });

    const user = await p.options.authorize({ identityToken: "tok", rawNonce: "wrong" });
    expect(user).toBeNull();
    expect(adapter.createUser).not.toHaveBeenCalled();
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it("BLOCKED: returns null when identityToken is missing (no verify call)", async () => {
    const adapter = fakeAdapter();
    const verify = vi.fn();
    const [p] = appleNativeProvider({ env: { AUTH_APPLE_ID: "com.pawpi.app" }, adapter, verify });
    expect(await p.options.authorize({ rawNonce: "raw" })).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
});
