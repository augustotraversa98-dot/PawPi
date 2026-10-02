import {
  AUTH_RETURN_URL,
  buildGoogleStartUrl,
  parseAuthReturnUrl,
  parseAuthReturnError,
  decideSocialButtons,
} from "./socialAuthShared";

describe("parseAuthReturnUrl", () => {
  it("extracts jwt + user from a successful callback deep link", () => {
    const url = `${AUTH_RETURN_URL}?token=abc.def.ghi&uid=42&email=a%40b.com&name=Ada%20Lovelace`;
    expect(parseAuthReturnUrl(url)).toEqual({
      jwt: "abc.def.ghi",
      user: { id: "42", email: "a@b.com", name: "Ada Lovelace" },
    });
  });

  it("returns just the jwt (undefined user fields) when only a token is present", () => {
    const url = `${AUTH_RETURN_URL}?token=xyz`;
    expect(parseAuthReturnUrl(url)).toEqual({
      jwt: "xyz",
      user: { id: undefined, email: undefined, name: undefined },
    });
  });

  it("also parses a fragment (#) style return", () => {
    const url = `${AUTH_RETURN_URL}#token=frag&uid=7`;
    expect(parseAuthReturnUrl(url)).toEqual({
      jwt: "frag",
      user: { id: "7", email: undefined, name: undefined },
    });
  });

  it("returns null on an error return", () => {
    expect(parseAuthReturnUrl(`${AUTH_RETURN_URL}?error=unauthorized`)).toBeNull();
  });

  it("returns null when there is no token", () => {
    expect(parseAuthReturnUrl(`${AUTH_RETURN_URL}?uid=1`)).toBeNull();
  });

  it("returns null for empty / non-string / query-less input", () => {
    expect(parseAuthReturnUrl("")).toBeNull();
    expect(parseAuthReturnUrl(null)).toBeNull();
    expect(parseAuthReturnUrl(undefined)).toBeNull();
    expect(parseAuthReturnUrl("pawpi://auth-callback")).toBeNull();
  });
});

describe("buildGoogleStartUrl", () => {
  it("builds the mobile-start URL with an encoded return", () => {
    expect(buildGoogleStartUrl("https://pawpi-production.up.railway.app")).toBe(
      "https://pawpi-production.up.railway.app/api/auth/mobile-start?provider=google&return=pawpi%3A%2F%2Fauth-callback",
    );
  });
  it("trims a trailing slash on the base URL", () => {
    expect(buildGoogleStartUrl("https://x.dev/")).toContain("https://x.dev/api/auth/mobile-start");
  });
});

describe("decideSocialButtons (provider gating)", () => {
  it("shows nothing when the backend reports nothing enabled", () => {
    expect(
      decideSocialButtons({ enabled: { google: false, apple: false }, appleNativeAvailable: true, platform: "ios" }),
    ).toEqual({ showGoogle: false, showApple: false });
  });

  it("shows Google whenever the backend has google enabled (any platform)", () => {
    expect(
      decideSocialButtons({ enabled: { google: true }, appleNativeAvailable: false, platform: "android" }),
    ).toEqual({ showGoogle: true, showApple: false });
  });

  it("shows Apple only on iOS when backend-enabled AND device-supported", () => {
    expect(
      decideSocialButtons({ enabled: { apple: true }, appleNativeAvailable: true, platform: "ios" }),
    ).toEqual({ showGoogle: false, showApple: true });
  });

  it("hides Apple on iOS when the device does not support it (old iOS)", () => {
    expect(
      decideSocialButtons({ enabled: { apple: true }, appleNativeAvailable: false, platform: "ios" }),
    ).toEqual({ showGoogle: false, showApple: false });
  });

  it("hides Apple on Android even when backend-enabled + 'available'", () => {
    expect(
      decideSocialButtons({ enabled: { apple: true }, appleNativeAvailable: true, platform: "android" }),
    ).toEqual({ showGoogle: false, showApple: false });
  });

  it("is defensive against a missing enabled object", () => {
    expect(decideSocialButtons({ appleNativeAvailable: true, platform: "ios" })).toEqual({
      showGoogle: false,
      showApple: false,
    });
  });
});

describe("token round-trip through mobile-return's encoding", () => {
  // mirrors web/src/app/api/auth/mobile-return: new URLSearchParams({ token: raw, ... }).toString()
  const encode = (token, extra = {}) => {
    const p = new URLSearchParams({ token });
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `${AUTH_RETURN_URL}?${p.toString()}`;
  };
  // A real @auth/core JWE is 5 base64url segments; also cover '+', '/', '=' and spaces, which
  // URLSearchParams percent-encodes (and encodes space as '+').
  const tokens = [
    "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIn0..Zs_-9aQ.k8-_Xy0Zz.tAg-_9",
    "head.pay+load/with=equals.sig+na/ture==",
    "a b.c%d&e=f.g",
  ];
  it.each(tokens)("is byte-identical after the round trip: %s", (raw) => {
    const out = parseAuthReturnUrl(encode(raw, { uid: "42", email: "a+b@c.com", name: "Ada L" }));
    expect(out.jwt).toBe(raw);
    expect(out.user).toEqual({ id: "42", email: "a+b@c.com", name: "Ada L" });
  });
});

describe("parseAuthReturnError", () => {
  it("returns the error code", () => {
    expect(parseAuthReturnError(`${AUTH_RETURN_URL}?error=unauthorized`)).toBe("unauthorized");
  });
  it("returns null for a success return or no query", () => {
    expect(parseAuthReturnError(`${AUTH_RETURN_URL}?token=x`)).toBeNull();
    expect(parseAuthReturnError(AUTH_RETURN_URL)).toBeNull();
    expect(parseAuthReturnError(null)).toBeNull();
  });
});
