jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.0.1", ios: { buildNumber: "24" } }, nativeBuildVersion: "24" },
}));

import { buildDiagnostic, reportClientDiagnostic, EVENT_WIZARD_FOR_EXISTING_OWNER } from "./clientDiagnostics";
import { recordRoute, __resetNavTrailForTests } from "./navTrail";

beforeEach(() => __resetNavTrailForTests());

describe("clientDiagnostics", () => {
  test("payload = event + details + screen trail + session age + app/OS info (no PII fields)", () => {
    recordRoute("/(tabs)");
    recordRoute("/services");
    const p = buildDiagnostic(EVENT_WIZARD_FOR_EXISTING_OWNER, { where: "mount", screen: "onboarding-photo" });
    expect(p).toMatchObject({
      event: "onboarding_wizard_for_existing_owner",
      where: "mount",
      screen: "onboarding-photo",
      app_version: "1.0.1",
      build: "24",
    });
    expect(p.trail.map((e) => e.p)).toEqual(["/(tabs)", "/services"]);
    expect(typeof p.session_age_s).toBe("number");
    expect(typeof p.platform).toBe("string");
    expect(Object.keys(p).sort()).toEqual(
      ["app_version", "build", "event", "os_version", "platform", "screen", "session_age_s", "trail", "where"].sort(),
    );
  });

  test("POSTs JSON to /api/client-diagnostics", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve({ ok: true }));
    await reportClientDiagnostic(EVENT_WIZARD_FOR_EXISTING_OWNER, { where: "submit", screen: "onboarding" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/client-diagnostics");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ event: EVENT_WIZARD_FOR_EXISTING_OWNER, where: "submit" });
  });

  test("never throws or rejects — network error, sync throw, or a non-OK response", async () => {
    await expect(
      reportClientDiagnostic("e", {}, () => Promise.reject(new Error("offline"))),
    ).resolves.toBeUndefined();
    await expect(
      reportClientDiagnostic("e", {}, () => {
        throw new Error("boom");
      }),
    ).resolves.toBeUndefined();
    await expect(
      reportClientDiagnostic("e", {}, () => Promise.resolve({ ok: false, status: 500 })),
    ).resolves.toBeUndefined();
  });
});
