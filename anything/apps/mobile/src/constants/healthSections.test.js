import { HEALTH_SECTIONS, HEALTH_SECTION_IDS, SHOW_INSIGHTS } from "./healthSections";

// AUDIT_2026-09 A-13: Insights renders sample data, so it must not be reachable until
// SHOW_INSIGHTS is flipped. The other three sections stay exactly as they were.
test("Insights is hidden while SHOW_INSIGHTS is false; the other sections are intact", () => {
  expect(SHOW_INSIGHTS).toBe(false);
  expect(HEALTH_SECTIONS.map((s) => s.id)).toEqual(["today", "track", "vet-record"]);
  expect(HEALTH_SECTION_IDS.has("insights")).toBe(false);
  expect(HEALTH_SECTION_IDS.has("vet-record")).toBe(true);
});
