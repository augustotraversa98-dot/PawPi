// E12 — win-back copy is warm in EN + ES and never guilt-trips; the push body is compact JSON.
import { describe, it, expect } from "vitest";
import { winbackPushBody, winbackEmail } from "./message";

const NO_SHAME =
  /haven'?t|didn'?t|you lost|broke your|fail|lazy|neglect|come back or|olvidaste|abandonaste|descuidaste|perdiste tu|fracas/i;

describe("winbackPushBody", () => {
  it("is compact parseable JSON carrying the hook", () => {
    const parsed = JSON.parse(
      winbackPushBody({ hook: "friend", petName: "Rex", friendName: "Bella" }),
    );
    expect(parsed).toEqual({
      hook: "friend", pet: "Rex", friend: "Bella", milestone_kind: null, in_days: null,
    });
  });
});

describe("winbackEmail — warm, real hook, EN + ES", () => {
  it("milestone hook mentions the day and no guilt (es default)", () => {
    const { subject, text } = winbackEmail({ hook: "milestone", milestoneKind: "gotcha", inDays: 3, petName: "Rex" });
    expect(subject).toContain("Rex");
    expect(text).toContain("3");
    expect(text).not.toMatch(NO_SHAME);
  });

  it("friend hook names the real friend, no guilt", () => {
    const { text } = winbackEmail({ hook: "friend", friendName: "Bella", petName: "Rex" });
    expect(text).toContain("Bella");
    expect(text).not.toMatch(NO_SHAME);
  });

  it("memory fallback invents no friend/number and never shames", () => {
    const { text } = winbackEmail({ hook: "memory", petName: "Rex" });
    expect(text).not.toMatch(/Bella|\d+ days|\d+ días/);
    expect(text).not.toMatch(NO_SHAME);
  });

  it("English copy exists and is warm", () => {
    const { subject, text } = winbackEmail({ locale: "en", hook: "friend", friendName: "Bella", petName: "Rex" });
    expect(subject).toBe("Rex misses you 🐾");
    expect(text).toContain("Bella");
    expect(text).not.toMatch(NO_SHAME);
  });
});
