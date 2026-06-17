// Ticket 2.37 — streak + birthday helpers.

import { computePostingStreak, isBirthdayToday } from "./feedDelight";

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
