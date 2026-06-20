import { describe, it, expect } from "vitest";
import { moderateText, moderationResponse } from "./moderateText";

// Text content filter (Guideline 1.2, T7): positives, negatives, and evasion.

describe("moderateText — flags objectionable text", () => {
  it("flags a plain banned word", () => {
    const r = moderateText("you are a fuck");
    expect(r.clean).toBe(false);
    expect(r.term).toBe("fuck");
  });

  it("flags regardless of case", () => {
    expect(moderateText("SHIT happens").clean).toBe(false);
  });

  it("flags a banned word anywhere in a longer text", () => {
    expect(moderateText("hello there, what a bitch of a day").clean).toBe(false);
  });

  it("flags across multiple fields (title + body)", () => {
    expect(moderateText("Nice title", "but the body says cunt").clean).toBe(false);
  });
});

describe("moderateText — evasion (leetspeak, spacing, repetition)", () => {
  it("catches leetspeak substitutions", () => {
    expect(moderateText("you sh1t").clean).toBe(false); // 1 -> i
    expect(moderateText("f@ggot").clean).toBe(false); // @ -> a
  });

  it("catches letters separated by spaces or punctuation", () => {
    expect(moderateText("f u c k that").clean).toBe(false);
    expect(moderateText("f.u.c.k").clean).toBe(false);
  });

  it("catches stretched repeats", () => {
    expect(moderateText("fuuuuck").clean).toBe(false);
  });
});

describe("moderateText — does NOT flag clean text (no Scunthorpe problem)", () => {
  it("passes ordinary text", () => {
    expect(moderateText("My dog Rex loves long walks in the park!").clean).toBe(true);
  });

  it("passes words that merely CONTAIN a banned substring", () => {
    // 'cunt' inside Scunthorpe, 'ass' inside assignment/class, 'shit' inside shiitake.
    expect(moderateText("I live in Scunthorpe").clean).toBe(true);
    expect(moderateText("Please finish the assignment in class").clean).toBe(true);
    expect(moderateText("We cooked shiitake mushrooms").clean).toBe(true);
  });

  it("treats empty / non-string input as clean", () => {
    expect(moderateText("").clean).toBe(true);
    expect(moderateText(null, undefined, 42).clean).toBe(true);
  });
});

describe("moderationResponse — route helper", () => {
  it("returns null for clean text", () => {
    expect(moderationResponse("a wholesome caption")).toBeNull();
  });

  it("returns a 422 Response for flagged text", () => {
    const res = moderationResponse("this is shit");
    expect(res).not.toBeNull();
    expect(res.status).toBe(422);
  });
});
