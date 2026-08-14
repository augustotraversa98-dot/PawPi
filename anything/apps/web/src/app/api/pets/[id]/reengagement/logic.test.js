// E12 — lapse detection is honest, and the win-back hook is always REAL (falls back to the pet's own
// memory, never a fabricated friend/count).
import { describe, it, expect } from "vitest";
import { isLapsed, decideWinback } from "./logic";

describe("isLapsed", () => {
  it("older than N days → lapsed", () => {
    expect(isLapsed("2026-08-01", "2026-08-14", 7)).toBe(true);
  });
  it("within N days → not lapsed", () => {
    expect(isLapsed("2026-08-10", "2026-08-14", 7)).toBe(false);
  });
  it("exactly N days is not yet lapsed (strictly greater)", () => {
    expect(isLapsed("2026-08-07", "2026-08-14", 7)).toBe(false);
  });
  it("never active → never lapsed", () => {
    expect(isLapsed(null, "2026-08-14", 7)).toBe(false);
  });
});

describe("decideWinback — real hook only", () => {
  it("prefers an upcoming milestone", () => {
    const r = decideWinback({
      milestone: { kind: "gotcha", in_days: 3 },
      friendName: "Bella",
      petName: "Rex",
    });
    expect(r.hook).toBe("milestone");
    expect(r.params).toMatchObject({ kind: "gotcha", inDays: 3 });
  });

  it("falls to a real friend when no milestone", () => {
    const r = decideWinback({ milestone: null, friendName: "Bella", petName: "Rex" });
    expect(r.hook).toBe("friend");
    expect(r.params.friend).toBe("Bella");
  });

  it("falls back to the pet's own memory when there is NO real hook (never fabricates)", () => {
    const r = decideWinback({ milestone: null, friendName: null, petName: "Rex" });
    expect(r.hook).toBe("memory");
    expect(r.params).toEqual({ name: "Rex" });
  });
});
