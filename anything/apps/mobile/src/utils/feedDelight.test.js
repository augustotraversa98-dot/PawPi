// Ticket 2.37 — streak + birthday helpers.

import {
  computePostingStreak,
  isBirthdayToday,
  getMilestone,
  getUpcomingMilestone,
  postBirthday,
} from "./feedDelight";

describe("getMilestone (E3)", () => {
  it("identifies a birthday and its age (years)", () => {
    expect(getMilestone({ birthday: "2020-06-18" }, "2026-06-18")).toEqual({ type: "birthday", years: 6 });
  });
  it("identifies a gotcha/adoption anniversary and its years", () => {
    expect(getMilestone({ adoption_date: "2023-06-18" }, "2026-06-18")).toEqual({ type: "gotcha", years: 3 });
  });
  it("birthday wins when both fall on the same day", () => {
    expect(getMilestone({ birthday: "2020-06-18", adoption_date: "2022-06-18" }, "2026-06-18"))
      .toEqual({ type: "birthday", years: 6 });
  });
  it("returns null off the day, and for missing/invalid dates (no fabricated milestone)", () => {
    expect(getMilestone({ birthday: "2020-01-01" }, "2026-06-18")).toBeNull();
    expect(getMilestone({}, "2026-06-18")).toBeNull();
    expect(getMilestone({ birthday: "2020-06-18" }, "bad")).toBeNull();
    expect(getMilestone(null, "2026-06-18")).toBeNull();
  });
});

describe("birthdays from the feed (month and day only)", () => {
  it("matches MM-DD against the reference day; the year is unknown", () => {
    expect(getMilestone({ birthday: "06-18" }, "2026-06-18")).toEqual({ type: "birthday", years: 0 });
    expect(getMilestone({ birthday: "06-17" }, "2026-06-18")).toBeNull();
    expect(getMilestone({ birthday: "18-06" }, "2026-06-18")).toBeNull();
    expect(getMilestone({ birthday: "6-18" }, "2026-06-18")).toBeNull();
  });

  it.each(["02-29", "2020-02-29"])("%s: Feb 28 in non-leap years, Feb 29 in leap years", (birthday) => {
    const on = (day) => getMilestone({ birthday }, day)?.type ?? null;
    expect(on("2027-02-28")).toBe("birthday");
    expect(on("2027-03-01")).toBeNull();
    expect(on("2028-02-29")).toBe("birthday");
    expect(on("2028-02-28")).toBeNull();
    expect(on("2100-02-28")).toBe("birthday"); // a century that is not a leap year
    expect(on("2000-02-28")).toBeNull();
  });

  it("a Feb 28 birthday does not move", () => {
    expect(getMilestone({ birthday: "02-28" }, "2027-02-28")?.type).toBe("birthday");
    expect(getMilestone({ birthday: "02-28" }, "2028-02-29")).toBeNull();
  });

  it("the countdown points at the same Feb 28", () => {
    expect(getUpcomingMilestone({ birthday: "2020-02-29" }, "2027-02-26")).toEqual({
      type: "birthday",
      years: 7,
      daysUntil: 2,
    });
    expect(getUpcomingMilestone({ birthday: "2020-02-29" }, "2028-02-26")?.daysUntil).toBe(3);
  });

  it("postBirthday prefers the month-day and copes with an older server", () => {
    expect(postBirthday({ pet_birthday_md: "06-18", pet_birthday: "9996-06-18" })).toBe("06-18");
    expect(postBirthday({ pet_birthday: "2020-06-18T00:00:00.000Z" })).toBe("2020-06-18T00:00:00.000Z");
    expect(postBirthday({ pet_birthday_md: null, pet_birthday: null })).toBeNull();
    expect(postBirthday(undefined)).toBeNull();
  });
});

describe("getUpcomingMilestone (E3 — 3-day countdown)", () => {
  it("returns the milestone only within the window, strictly in the future", () => {
    expect(getUpcomingMilestone({ birthday: "2020-06-18" }, "2026-06-15")).toEqual({ type: "birthday", years: 6, daysUntil: 3 });
    expect(getUpcomingMilestone({ birthday: "2020-06-18" }, "2026-06-17")).toEqual({ type: "birthday", years: 6, daysUntil: 1 });
  });
  it("does NOT fire on the day itself (that's getMilestone's job) or outside the window", () => {
    expect(getUpcomingMilestone({ birthday: "2020-06-18" }, "2026-06-18")).toBeNull(); // day-of
    expect(getUpcomingMilestone({ birthday: "2020-06-18" }, "2026-06-14")).toBeNull(); // 4 days out
  });
  it("wraps a year end and picks the nearest of two dates", () => {
    expect(getUpcomingMilestone({ birthday: "2020-01-01" }, "2025-12-30")).toEqual({ type: "birthday", years: 6, daysUntil: 2 });
    expect(getUpcomingMilestone({ birthday: "2020-06-20", adoption_date: "2021-06-18" }, "2026-06-17"))
      .toEqual({ type: "gotcha", years: 5, daysUntil: 1 });
  });
  it("null for no dates", () => {
    expect(getUpcomingMilestone({}, "2026-06-17")).toBeNull();
  });
});

describe("computePostingStreak", () => {
  it("counts a continuous run ending today", () => {
    expect(
      computePostingStreak(
        ["2026-06-16", "2026-06-17", "2026-06-18"],
        "2026-06-18",
      ),
    ).toBe(3);
  });

  it("is 0 when there is no post today (missed day breaks the chain)", () => {
    // posted yesterday + before, but not today.
    expect(
      computePostingStreak(["2026-06-16", "2026-06-17"], "2026-06-18"),
    ).toBe(0);
  });

  it("stops at the first gap", () => {
    // today + yesterday, then a gap (no 06-15), then 06-14.
    expect(
      computePostingStreak(
        ["2026-06-14", "2026-06-17", "2026-06-18"],
        "2026-06-18",
      ),
    ).toBe(2);
  });

  it("dedupes multiple posts on the same day", () => {
    expect(
      computePostingStreak(["2026-06-18", "2026-06-18"], "2026-06-18"),
    ).toBe(1);
  });

  it("crosses a month boundary correctly", () => {
    expect(
      computePostingStreak(["2026-05-31", "2026-06-01"], "2026-06-01"),
    ).toBe(2);
  });

  it("is 0 for no posts / bad input", () => {
    expect(computePostingStreak([], "2026-06-18")).toBe(0);
    expect(computePostingStreak(null, "2026-06-18")).toBe(0);
    expect(computePostingStreak(["2026-06-18"], "bad")).toBe(0);
  });
});

describe("isBirthdayToday", () => {
  it("matches a birthday regardless of year", () => {
    expect(isBirthdayToday({ birthday: "2020-06-18" }, "2026-06-18")).toBe(true);
  });

  it("matches an adoption date regardless of year", () => {
    expect(
      isBirthdayToday({ adoption_date: "2019-06-18" }, "2026-06-18"),
    ).toBe(true);
  });

  it("no false positive on a different day", () => {
    expect(isBirthdayToday({ birthday: "2020-06-17" }, "2026-06-18")).toBe(
      false,
    );
  });

  it("false when no dates are set", () => {
    expect(isBirthdayToday({ birthday: null, adoption_date: null }, "2026-06-18")).toBe(
      false,
    );
    expect(isBirthdayToday(null, "2026-06-18")).toBe(false);
  });
});
