// E11 — the delivered digest copy is warm + honest in EN and ES, and the push body is a compact
// JSON payload the client localizes. A quiet/empty week must never read as a shame frame.
import { describe, it, expect } from "vitest";
import { digestPushBody, digestEmail } from "./message";

describe("digestPushBody", () => {
  it("is compact parseable JSON carrying the real counts", () => {
    const parsed = JSON.parse(
      digestPushBody({ petName: "Rex", walks: 5, ringDays: 4, streak: 12, state: "rich", weekStart: "2026-08-10" }),
    );
    expect(parsed).toEqual({
      pet: "Rex", walks: 5, ring_days: 4, streak: 12, state: "rich", week_start: "2026-08-10",
    });
  });

  it("coerces missing numbers to 0 (never NaN/undefined in the payload)", () => {
    const parsed = JSON.parse(digestPushBody({ petName: "Rex" }));
    expect(parsed.walks).toBe(0);
    expect(parsed.ring_days).toBe(0);
    expect(parsed.streak).toBe(0);
  });
});

describe("digestEmail — EN + ES, warm not shaming", () => {
  const noShame = /haven'?t|didn'?t|fail|lazy|neglect|olvidaste|abandonaste|descuidaste|fracas/i;

  it("a rich week celebrates the real numbers (es default)", () => {
    const { subject, text } = digestEmail({ petName: "Rex", walks: 5, ringDays: 4, streak: 12, state: "rich" });
    expect(subject).toContain("Rex");
    expect(text).toContain("5");
    expect(text).toContain("4/7");
    expect(text).not.toMatch(noShame);
  });

  it("a quiet week is gentle and invents no numbers", () => {
    const { text } = digestEmail({ petName: "Rex", state: "quiet" });
    expect(text).not.toMatch(/\d+ paseos|\d+ walks/); // no fabricated counts
    expect(text).not.toMatch(noShame);
  });

  it("an empty week is a soft forward nudge, never guilt", () => {
    const { text } = digestEmail({ petName: "Rex", state: "empty" });
    expect(text).not.toMatch(noShame);
  });

  it("English copy is available", () => {
    const { subject, text } = digestEmail({ locale: "en", petName: "Rex", walks: 3, ringDays: 2, streak: 0, state: "rich" });
    expect(subject).toBe("Rex's week 🐾");
    expect(text).toContain("3 walks");
    expect(text).not.toMatch(noShame);
  });
});
