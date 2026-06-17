// Phase 2 ticket 2.13 — the pure cadence/cap helper that interleaves provider/adoption
// suggestion cards between pet posts. No React, no network — just the ordering contract.

import {
  interleaveSuggestions,
  flattenSuggestions,
  CADENCE_EVERY_N,
  MAX_SUGGESTIONS,
} from "./interleaveSuggestions";

const post = (id) => ({ id, pet_name: `pet${id}` });
const prov = (id) => ({ kind: "provider", id });
const adopt = (id) => ({ kind: "adoption", id });

const posts = (n) => Array.from({ length: n }, (_, i) => post(i + 1));

describe("flattenSuggestions — alternates the two sources, de-dupes, keeps kind", () => {
  it("interleaves providers and adoptions one-for-one", () => {
    const out = flattenSuggestions({
      providers: [prov(1), prov(2)],
      adoptions: [adopt(9)],
    });
    expect(out).toEqual([prov(1), adopt(9), prov(2)]);
  });

  it("handles missing/empty sources", () => {
    expect(flattenSuggestions(null)).toEqual([]);
    expect(flattenSuggestions({ providers: [prov(1)] })).toEqual([prov(1)]);
  });
});

describe("interleaveSuggestions — cadence + cap", () => {
  it("injects one suggestion after every N posts (default cadence)", () => {
    const out = interleaveSuggestions(posts(9), [prov(1), prov(2)]);
    // After post #4 and post #8 (everyN=4), with following posts present.
    const kinds = out.map((x) => x.kind ?? "post");
    expect(kinds).toEqual([
      "post", "post", "post", "post", "provider",
      "post", "post", "post", "post", "provider",
      "post",
    ]);
  });

  it("keeps the discriminator on injected items and never tags posts", () => {
    const out = interleaveSuggestions(posts(5), [prov(7)], { everyN: 4 });
    const injected = out.filter((x) => x.kind);
    expect(injected).toEqual([prov(7)]);
    // Every post object is the SAME identity passed in — unchanged, no kind added.
    const passthrough = out.filter((x) => !x.kind);
    expect(passthrough).toEqual(posts(5));
  });

  it("never injects two suggestions back-to-back", () => {
    const out = interleaveSuggestions(posts(12), [prov(1), prov(2), prov(3)]);
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i].kind;
      const b = out[i + 1].kind;
      expect(a && b).toBeFalsy(); // no two adjacent suggestion cards
    }
  });

  it("caps the number of injected suggestions (anti-spam)", () => {
    // 100 posts + plenty of suggestions, but the cap holds.
    const pool = Array.from({ length: 50 }, (_, i) => prov(i + 1));
    const out = interleaveSuggestions(posts(100), pool, { max: MAX_SUGGESTIONS });
    const injected = out.filter((x) => x.kind).length;
    expect(injected).toBe(MAX_SUGGESTIONS);
  });

  it("never injects after the very last post (no trailing ad)", () => {
    // Exactly N posts: the only cadence point is after the last post → suppressed.
    const out = interleaveSuggestions(posts(CADENCE_EVERY_N), [prov(1)]);
    expect(out).toEqual(posts(CADENCE_EVERY_N));
    expect(out.some((x) => x.kind)).toBe(false);
  });

  it("a short feed (fewer than N posts) gets ZERO suggestions", () => {
    const out = interleaveSuggestions(posts(2), [prov(1)], { everyN: 4 });
    expect(out).toEqual(posts(2));
  });

  it("with no suggestions, returns the posts unchanged", () => {
    const out = interleaveSuggestions(posts(10), { providers: [], adoptions: [] });
    expect(out).toEqual(posts(10));
  });

  it("accepts the raw {providers, adoptions} shape and flattens it", () => {
    const out = interleaveSuggestions(posts(9), {
      providers: [prov(1)],
      adoptions: [adopt(2)],
    });
    const injected = out.filter((x) => x.kind);
    expect(injected).toEqual([prov(1), adopt(2)]);
  });
});
