import { recordRoute, getNavTrail, sessionAgeSeconds, __resetNavTrailForTests } from "./navTrail";

beforeEach(() => __resetNavTrailForTests());

describe("navTrail", () => {
  test("records screens in order with how long ago each was shown", () => {
    recordRoute("/(tabs)", 1_000);
    recordRoute("/services", 41_000);
    recordRoute("/onboarding-photo", 60_000);
    expect(getNavTrail(61_000)).toEqual([
      { p: "/(tabs)", ago_s: 60 },
      { p: "/services", ago_s: 20 },
      { p: "/onboarding-photo", ago_s: 1 },
    ]);
  });

  test("consecutive duplicates collapse; non-strings and empties are ignored", () => {
    recordRoute("/a", 1);
    recordRoute("/a", 2);
    recordRoute(undefined, 3);
    recordRoute("", 4);
    recordRoute(42, 5);
    expect(getNavTrail(1000).map((e) => e.p)).toEqual(["/a"]);
  });

  test("keeps only the last 15 in a report, never more than 30 in memory, and truncates long paths", () => {
    for (let i = 0; i < 50; i++) recordRoute(`/p${i}`, i * 1000);
    const t = getNavTrail(60_000);
    expect(t).toHaveLength(15);
    expect(t[t.length - 1].p).toBe("/p49");
    recordRoute("/" + "x".repeat(200), 99_000);
    expect(getNavTrail(100_000).pop().p).toHaveLength(80);
  });

  test("a clock that goes backwards never produces a negative age", () => {
    recordRoute("/a", 10_000);
    expect(getNavTrail(5_000)[0].ago_s).toBe(0);
  });

  test("session age is a non-negative whole number of seconds", () => {
    expect(Number.isInteger(sessionAgeSeconds())).toBe(true);
    expect(sessionAgeSeconds()).toBeGreaterThanOrEqual(0);
  });
});
