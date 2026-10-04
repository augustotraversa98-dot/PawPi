import { describe, it, expect } from "vitest";
import { resolveCallbackUrl, isMobileAuthWebview } from "./resolveCallbackUrl";

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

describe("isMobileAuthWebview", () => {
  it("is true for the two mobile bridge callback targets", () => {
    expect(isMobileAuthWebview("?callbackUrl=/api/auth/expo-web-success")).toBe(true);
    expect(isMobileAuthWebview("?callbackUrl=/api/auth/token")).toBe(true);
    expect(isMobileAuthWebview("?callbackUrl=%2Fapi%2Fauth%2Ftoken")).toBe(true);
    expect(isMobileAuthWebview("?callbackUrl=https://www.pawpi.info/api/auth/token")).toBe(true);
  });

  it("is false for standalone web", () => {
    expect(isMobileAuthWebview("")).toBe(false);
    expect(isMobileAuthWebview(undefined)).toBe(false);
    expect(isMobileAuthWebview("?callbackUrl=")).toBe(false);
    expect(isMobileAuthWebview("?callbackUrl=/provider")).toBe(false);
    expect(isMobileAuthWebview("?callbackUrl=/provider/api/auth/token")).toBe(false);
  });
});
