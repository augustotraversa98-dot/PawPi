import {
  onThisDay,
  longestStreak,
  detectMilestones,
  buildWrapped,
  wrappedSlides,
} from "./memoriesWrapped";

describe("onThisDay", () => {
  const today = "2026-06-18";
  it("surfaces past posts with the same month+day from an earlier year, newest first", () => {
    const posts = [
      { id: 1, post_date: "2025-06-18", image_url: "a" },
      { id: 2, post_date: "2024-06-18", image_url: "b" },
      { id: 3, post_date: "2025-06-17", image_url: "c" }, // different day
      { id: 4, post_date: "2026-06-18", image_url: "d" }, // today, not a memory
    ];
    const res = onThisDay(posts, today);
    expect(res.map((p) => p.id)).toEqual([1, 2]);
    expect(res[0].yearsAgo).toBe(1);
    expect(res[1].yearsAgo).toBe(2);
  });
  it("is empty-safe", () => {
    expect(onThisDay([], today)).toEqual([]);
    expect(onThisDay(null, today)).toEqual([]);
    expect(onThisDay([{ post_date: "2025-01-01" }], today)).toEqual([]);
  });
});

describe("longestStreak", () => {
  it("finds the longest consecutive run anywhere in history", () => {
    expect(longestStreak(["2026-01-01", "2026-01-02", "2026-01-03", "2026-02-01"])).toBe(3);
    expect(longestStreak(["2026-01-01", "2026-01-03"])).toBe(1);
    expect(longestStreak(["2026-01-02", "2026-01-01", "2026-01-02"])).toBe(2); // dupes + unordered
  });
  it("is empty-safe", () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(null)).toBe(0);
  });
});

describe("detectMilestones", () => {
  it("celebrates a birthday today with age when the year is known", () => {
    const m = detectMilestones({ name: "Rex", birthday: "2020-06-18" }, { today: "2026-06-18" });
    expect(m.find((x) => x.key === "birthday")).toBeTruthy();
    expect(m.find((x) => x.key === "birthday").subtitle).toMatch(/6 years/);
  });
  it("celebrates gotcha day", () => {
    const m = detectMilestones({ name: "Rex", adoption_date: "2022-06-18" }, { today: "2026-06-18" });
    expect(m.find((x) => x.key === "gotcha")).toBeTruthy();
  });
  it("fires a streak milestone only on the exact threshold", () => {
    expect(detectMilestones({ name: "Rex" }, { today: "2026-06-18", currentStreak: 7 }).some((x) => x.key === "streak-7")).toBe(true);
    expect(detectMilestones({ name: "Rex" }, { today: "2026-06-18", currentStreak: 8 }).some((x) => x.key.startsWith("streak"))).toBe(false);
  });
  it("fires a post-count milestone on the exact total", () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-05-${String(i + 1).padStart(2, "0")}`);
    expect(detectMilestones({ name: "Rex" }, { today: "2026-06-18", postDates: dates }).some((x) => x.key === "posts-10")).toBe(true);
  });
  it("is empty-safe (no pet, no data → no milestones)", () => {
    expect(detectMilestones(null, { today: "2026-06-18" })).toEqual([]);
  });
});

describe("buildWrapped + wrappedSlides", () => {
  const today = "2026-12-31";
  const manyDays = Array.from({ length: 20 }, (_, i) => `2026-03-${String(i + 1).padStart(2, "0")}`);

  it("returns hasEnough:false for thin accounts (no fabricated stats)", () => {
    const w = buildWrapped({ name: "Rex" }, { today, postDates: ["2026-01-01", "2026-01-02"] });
    expect(w.hasEnough).toBe(false);
    expect(wrappedSlides(w)).toEqual([]);
  });

  it("tallies real data and builds slides when there's enough", () => {
    const w = buildWrapped({ name: "Rex" }, { today, postDates: manyDays, friendCount: 4, walkCount: 12 });
    expect(w.hasEnough).toBe(true);
    expect(w.totalPosts).toBe(20);
    expect(w.bestStreak).toBe(20);
    expect(w.topMonth).toBe("March");
    expect(w.friendCount).toBe(4);
    const slides = wrappedSlides(w);
    expect(slides[0].key).toBe("intro");
    expect(slides.some((s) => s.key === "posts")).toBe(true);
    expect(slides.some((s) => s.key === "friends")).toBe(true);
    expect(slides.some((s) => s.key === "walks")).toBe(true);
  });
});
