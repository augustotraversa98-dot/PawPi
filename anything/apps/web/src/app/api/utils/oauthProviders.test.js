import { describe, it, expect } from "vitest";
import { socialProviders, enabledSocialProviderIds } from "./oauthProviders";

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
