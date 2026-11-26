// Health tab copy trim: the redundant lines stay out of both catalogs, and the shortened ones stay short.
import en from "./locales/en.json";
import es from "./locales/es.json";

const get = (dict, key) => key.split(".").reduce((o, k) => o?.[k], dict);

const REMOVED = [
  "health.vetRecord.footer",
  "health.vetRecord.readinessHint",
  "health.trackScreen.sectionEverydayHint",
  "healthUi.vetSummaryDashboard.prepareForYourVetVisit",
  "healthUi.vetSummaryDashboard.intro",
  "leaderboard.subtitle",
  "vetReadiness.title",
  "vetReadiness.level_start",
  "vetReadiness.level_building",
  "vetReadiness.level_great",
];

describe.each([
  ["en", en],
  ["es", es],
])("Health copy (%s)", (_lang, dict) => {
  test.each(REMOVED)("%s is gone", (key) => {
    expect(get(dict, key)).toBeUndefined();
  });

  test.each(["packStreaks.empty", "leaderboard.empty"])("%s is one short sentence", (key) => {
    expect(get(dict, key).length).toBeLessThanOrEqual(60);
  });

  test("the header line is shorter than the full disclaimer and still says it is not a diagnosis", () => {
    expect(get(dict, "health.headerDisclaimer").length).toBeLessThan(get(dict, "health.disclaimer").length);
    expect(get(dict, "health.headerDisclaimer")).toMatch(/does not diagnose|no diagnostica/);
  });
});
