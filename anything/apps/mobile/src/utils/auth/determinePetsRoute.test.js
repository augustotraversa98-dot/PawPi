import { determinePetsRoute } from "./determinePetsRoute";

describe("determinePetsRoute — the EntryPoint gate's three outcomes", () => {
  it("200 + empty array → genuinely new user → onboarding", () => {
    expect(determinePetsRoute({ ok: true, status: 200, pets: [] })).toEqual({
      action: "onboarding",
      destination: "/onboarding-photo",
    });
  });

  it("200 + pets → existing user → home", () => {
    expect(
      determinePetsRoute({ ok: true, status: 200, pets: [{ id: 1 }] }),
    ).toEqual({ action: "home", destination: "/(tabs)" });
  });

  it("business account (staff, no pets) → Business home, NOT pet onboarding", () => {
    expect(
      determinePetsRoute({
        ok: true,
        status: 200,
        pets: [],
        providers: [{ id: 10, name: "Clinic" }],
      }),
    ).toEqual({ action: "business", destination: "/business" });
  });

  it("non-staff account (no pets, no providers) → normal pet onboarding", () => {
    expect(
      determinePetsRoute({ ok: true, status: 200, pets: [], providers: [] }),
    ).toEqual({ action: "onboarding", destination: "/onboarding-photo" });
  });

  it("BOTH staff AND a pet owner → keep the pet app (home), never Business home here", () => {
    // A both-role account still lands in the pet app; Business home is reached from the More menu.
    expect(
      determinePetsRoute({
        ok: true,
        status: 200,
        pets: [{ id: 1 }],
        providers: [{ id: 10 }],
      }),
    ).toEqual({ action: "home", destination: "/(tabs)" });
  });

  it("a failed/absent providers read never blocks the pet flow (degrades to onboarding)", () => {
    // providers undefined (fetch failed / not run) with empty pets → still onboarding, never business.
    expect(determinePetsRoute({ ok: true, status: 200, pets: [] })).toEqual({
      action: "onboarding",
      destination: "/onboarding-photo",
    });
  });

  it("401 (expired/invalid token) → clear session → login, never onboarding", () => {
    expect(determinePetsRoute({ ok: false, status: 401 })).toEqual({
      action: "login",
      destination: "/welcome",
      clearSession: true,
    });
  });

  it("403 (forbidden) → clear session → login", () => {
    expect(determinePetsRoute({ ok: false, status: 403 })).toEqual({
      action: "login",
      destination: "/welcome",
      clearSession: true,
    });
  });

  it("network error / timeout → retry state, never onboarding", () => {
    expect(determinePetsRoute({ networkError: true })).toEqual({
      action: "error",
    });
  });

  it("non-auth server failure (500) → retry state, never onboarding", () => {
    expect(determinePetsRoute({ ok: false, status: 500 })).toEqual({
      action: "error",
    });
  });

  it("never routes a non-200 to onboarding (no duplicate-pet trap)", () => {
    for (const status of [401, 403, 500, 502, 503]) {
      const result = determinePetsRoute({ ok: false, status });
      expect(result.action).not.toBe("onboarding");
    }
    expect(determinePetsRoute({ networkError: true }).action).not.toBe(
      "onboarding",
    );
  });
});
