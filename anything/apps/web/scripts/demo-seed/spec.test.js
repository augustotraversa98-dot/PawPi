import { describe, it, expect } from "vitest";
import {
  POSTS,
  ENGAGEMENT_POOL_SIZE,
  NAMED_ACTOR_KEYS,
  planEngagement,
  ymd,
  addDays,
  fillerUsername,
  FILLER_USERNAME_PREFIX,
} from "./spec.mjs";

describe("demo-seed spec invariants", () => {
  it("pool is large enough for the biggest paw count", () => {
    const maxPaws = Math.max(...POSTS.map((p) => p.paws));
    expect(ENGAGEMENT_POOL_SIZE).toBeGreaterThanOrEqual(maxPaws);
  });

  it("posts land on consecutive days ending today (streak shows)", () => {
    const offsets = POSTS.map((p) => p.dayOffset).sort((a, b) => a - b);
    expect(offsets).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("ymd / addDays", () => {
  it("formats local Y-M-D zero-padded", () => {
    expect(ymd(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(ymd(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("addDays does not mutate and handles negatives", () => {
    const base = new Date(2026, 5, 20);
    const back = addDays(base, -5);
    expect(ymd(back)).toBe("2026-06-15");
    expect(ymd(base)).toBe("2026-06-20"); // unchanged
  });
});

describe("fillerUsername", () => {
  it("is stable, prefixed, and zero-padded", () => {
    expect(fillerUsername(0)).toBe(`${FILLER_USERNAME_PREFIX}001`);
    expect(fillerUsername(53)).toBe(`${FILLER_USERNAME_PREFIX}054`);
  });
});

describe("planEngagement", () => {
  const { paws, barks } = planEngagement(POSTS, ENGAGEMENT_POOL_SIZE);

  it("produces exactly the requested paw count per post, all distinct, in range", () => {
    POSTS.forEach((post, i) => {
      expect(paws[i]).toHaveLength(post.paws);
      expect(new Set(paws[i]).size).toBe(post.paws); // no duplicate actor on a post
      paws[i].forEach((idx) => {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(ENGAGEMENT_POOL_SIZE);
      });
    });
  });

  it("produces exactly the requested bark count per post", () => {
    POSTS.forEach((post, i) => {
      expect(barks[i]).toHaveLength(post.barks);
      barks[i].forEach((bk) => {
        expect(bk.actor).toBeGreaterThanOrEqual(0);
        expect(bk.actor).toBeLessThan(ENGAGEMENT_POOL_SIZE);
        expect(typeof bk.text).toBe("string");
        expect(bk.text.length).toBeGreaterThan(0);
      });
    });
  });

  it("leads each thread with the named actors (Luna=0, Cooper=1)", () => {
    POSTS.forEach((post, i) => {
      const named = Math.min(NAMED_ACTOR_KEYS.length, post.barks);
      for (let b = 0; b < named; b++) {
        expect(barks[i][b].actor).toBe(b);
      }
    });
  });

  it("throws if a post needs more paws than the pool can supply", () => {
    expect(() => planEngagement([{ paws: 5, barks: 0 }], 3)).toThrow();
  });
});
