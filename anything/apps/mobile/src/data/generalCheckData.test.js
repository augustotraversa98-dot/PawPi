// getSuggestedAreas — the rotating daily suggestion for the light Care-Ring Quick Check.
// Pure, so this pins the ranking rules directly: never-checked areas first, then
// least-recently-checked; an area checked TODAY is deprioritized (rotates out); a new pet
// with no history falls back to the fixed opening order. Tolerant of both API shapes
// (flat *_status columns and the `areas` jsonb).

import { getSuggestedAreas, QUICK_SUGGESTION_COUNT } from "./generalCheckData";

const TODAY = "2026-08-20";

// One flat-column row that marks a single area on a given day.
const flat = (day, field, status = "usual") => ({ logged_at: day, [field]: status });

test("no history → fixed opening order (eyes, ears)", () => {
  expect(getSuggestedAreas([], 2, TODAY)).toEqual(["eyes", "ears"]);
});

test("default count comes from QUICK_SUGGESTION_COUNT", () => {
  expect(getSuggestedAreas([], undefined, TODAY)).toHaveLength(QUICK_SUGGESTION_COUNT);
});

test("count is configurable", () => {
  expect(getSuggestedAreas([], 3, TODAY)).toEqual(["eyes", "ears", "teeth_mouth"]);
});

test("never-checked areas come before ever-checked ones", () => {
  // eyes + ears were checked (old); the never-checked areas outrank them.
  const history = [
    flat("2026-08-01", "eyes_status"),
    flat("2026-08-02", "ears_status"),
  ];
  expect(getSuggestedAreas(history, 2, TODAY)).toEqual(["teeth_mouth", "skin_fur"]);
});

test("orders least-recently-checked first when every area has history", () => {
  // Distinct last-checked days across all 8 areas (flat columns exercise every mapping,
  // incl. teeth_mouth→teeth_status and skin_fur→skin_fur_status).
  const history = [
    flat("2026-08-01", "eyes_status"),
    flat("2026-08-02", "ears_status"),
    flat("2026-08-03", "teeth_status"),
    flat("2026-08-04", "skin_fur_status"),
    flat("2026-08-05", "paws_status"),
    flat("2026-08-06", "face_status"),
    flat("2026-08-07", "mood"),
    flat("2026-08-08", "energy"),
  ];
  expect(getSuggestedAreas(history, 2, TODAY)).toEqual(["eyes", "ears"]);
});

test("an area checked today is deprioritized (rotates out) and not suggested next", () => {
  const history = [
    flat(TODAY, "eyes_status"), // eyes checked TODAY → pushed to the back
    flat("2026-08-02", "ears_status"),
    flat("2026-08-03", "teeth_status"),
    flat("2026-08-04", "skin_fur_status"),
    flat("2026-08-05", "paws_status"),
    flat("2026-08-06", "face_status"),
    flat("2026-08-07", "mood"),
    flat("2026-08-08", "energy"),
  ];
  const result = getSuggestedAreas(history, 2, TODAY);
  expect(result).not.toContain("eyes");
  // Next-oldest non-today areas are ears (08-02) then teeth_mouth (08-03).
  expect(result).toEqual(["ears", "teeth_mouth"]);
});

test("reads status from the `areas` jsonb too (not only flat columns)", () => {
  // eyes + ears checked TODAY, expressed ONLY via the jsonb blob (keys eyes/ears). If the
  // helper ignored jsonb they'd read as never-checked and rank first; instead they're
  // treated as checked-today and deprioritized, so the never-checked areas surface.
  const history = [
    { logged_at: TODAY, areas: { eyes: { status: "usual" }, ears: { status: "changed" } } },
  ];
  expect(getSuggestedAreas(history, 2, TODAY)).toEqual(["teeth_mouth", "skin_fur"]);
});
