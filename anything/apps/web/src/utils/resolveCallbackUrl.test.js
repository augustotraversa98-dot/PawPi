import { describe, it, expect } from "vitest";
import { resolveCallbackUrl } from "./resolveCallbackUrl";

describe("resolveCallbackUrl", () => {
  it("defaults to /provider for standalone-web (no callbackUrl param)", () => {
    expect(resolveCallbackUrl("")).toBe("/provider");
    expect(resolveCallbackUrl("?foo=bar")).toBe("/provider");
    expect(resolveCallbackUrl(undefined)).toBe("/provider");
  });

  it("honors the incoming callbackUrl from the mobile bridge", () => {
    // device flow
    expect(resolveCallbackUrl("?callbackUrl=/api/auth/token")).toBe(
      "/api/auth/token",
    );
    // Expo-web iframe flow
    expect(resolveCallbackUrl("?callbackUrl=/api/auth/expo-web-success")).toBe(
      "/api/auth/expo-web-success",
    );
  });

  it("preserves query params encoded inside the callbackUrl", () => {
    expect(
      resolveCallbackUrl("?callbackUrl=/auth/expo-web-success%3Fnext%3D/onboarding"),
    ).toBe("/auth/expo-web-success?next=/onboarding");
  });

  it("uses the provided fallback when given one", () => {
    expect(resolveCallbackUrl("", "/somewhere")).toBe("/somewhere");
  });

  it("falls back when callbackUrl is present but empty/blank", () => {
    expect(resolveCallbackUrl("?callbackUrl=")).toBe("/provider");
    expect(resolveCallbackUrl("?callbackUrl=%20")).toBe("/provider");
  });
});
