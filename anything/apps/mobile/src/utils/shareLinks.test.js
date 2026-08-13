// Share-card helpers (unit E4): the @handle label + handle-only deep link, and the deck built from
// REAL stats (empty-safe, never a fabricated number).

import { petHandleLabel, petShareUrl, buildShareCards, SHARE_TEMPLATES } from "./shareLinks";

describe("petHandleLabel / petShareUrl", () => {
  it("labels the handle with a single @ and tolerates a leading @", () => {
    expect(petHandleLabel("rex")).toBe("@rex");
    expect(petHandleLabel("@rex")).toBe("@rex");
    expect(petHandleLabel("")).toBe("");
    expect(petHandleLabel(null)).toBe("");
  });

  it("builds a deep link from the handle ONLY — never any location data", () => {
    const url = petShareUrl("rex");
    expect(url).toMatch(/\/@rex$/);
    expect(url).not.toMatch(/lat|lng|location|geo/i);
    // no handle → the bare base, still no location
    expect(petShareUrl("")).not.toMatch(/@/);
  });
});

describe("buildShareCards — real stats only, empty-safe", () => {
  const pet = { id: 1, name: "Rex", handle: "rex", avatar_url: "x" };

  it("marks each card available only when its REAL stat exists", () => {
    const cards = buildShareCards({
      stats: { pet, streak: { current: 5 }, walks_this_week: 3, moments_total: 9 },
      milestone: { type: "gotcha", years: 3 },
    });
    const by = Object.fromEntries(cards.map((c) => [c.template, c]));
    expect(by.streak).toMatchObject({ available: true, value: 5 });
    expect(by.week_in_walks).toMatchObject({ available: true, value: 3 });
    expect(by.milestone).toMatchObject({ available: true });
    expect(by.pet_of_the_day.available).toBe(true);
    expect(by.care_recap).toMatchObject({ available: false, stub: true }); // depends on E10
  });

  it("degrades to empty (no fake numbers) when stats are zero/absent", () => {
    const cards = buildShareCards({ stats: { pet, streak: null, walks_this_week: 0, moments_total: 0 } });
    const by = Object.fromEntries(cards.map((c) => [c.template, c]));
    expect(by.streak.available).toBe(false);
    expect(by.week_in_walks.available).toBe(false);
    expect(by.milestone.available).toBe(false); // no milestone today
  });

  it("covers every template, care_recap always a stub", () => {
    const cards = buildShareCards({ stats: { pet } });
    expect(cards.map((c) => c.template).sort()).toEqual([...SHARE_TEMPLATES].sort());
    expect(cards.find((c) => c.template === "care_recap").stub).toBe(true);
  });

  it("is safe with no input", () => {
    expect(buildShareCards()).toHaveLength(SHARE_TEMPLATES.length);
  });
});
