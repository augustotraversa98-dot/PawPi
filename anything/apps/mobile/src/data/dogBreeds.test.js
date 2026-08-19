// Unit tests for the canonical breed list + its case/accent-insensitive filter.
import {
  DOG_BREEDS,
  normalizeBreed,
  filterBreeds,
  hasExactBreedMatch,
} from "./dogBreeds";

const cmp = (a, b) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

describe("DOG_BREEDS list integrity", () => {
  test("is a non-trivial list", () => {
    expect(DOG_BREEDS.length).toBeGreaterThan(150);
  });

  test("has no duplicates", () => {
    expect(new Set(DOG_BREEDS).size).toBe(DOG_BREEDS.length);
  });

  test("does NOT contain 'Mixed Breed' (pinned separately in the picker)", () => {
    expect(DOG_BREEDS).not.toContain("Mixed Breed");
  });

  test("is sorted case-insensitively", () => {
    expect([...DOG_BREEDS]).toEqual([...DOG_BREEDS].sort(cmp));
  });

  test("includes the canonical anchors used elsewhere", () => {
    expect(DOG_BREEDS).toContain("Golden Retriever");
    expect(DOG_BREEDS).toContain("Golden Doodle");
    expect(DOG_BREEDS).toContain("Labrador Retriever");
  });
});

describe("normalizeBreed", () => {
  test("lowercases and trims", () => {
    expect(normalizeBreed("  Golden Retriever  ")).toBe("golden retriever");
  });

  test("strips diacritics (accent-insensitive)", () => {
    expect(normalizeBreed("Löwchen")).toBe(normalizeBreed("Lowchen"));
    expect(normalizeBreed("BRACCO ITALIÁNO")).toBe("bracco italiano");
  });

  test("handles nullish input", () => {
    expect(normalizeBreed(undefined)).toBe("");
    expect(normalizeBreed(null)).toBe("");
  });
});

describe("filterBreeds", () => {
  test("empty query returns the full list", () => {
    expect(filterBreeds("")).toHaveLength(DOG_BREEDS.length);
    expect(filterBreeds("   ")).toHaveLength(DOG_BREEDS.length);
  });

  test("'gold' matches Golden Retriever AND Golden Doodle", () => {
    const r = filterBreeds("gold");
    expect(r).toContain("Golden Retriever");
    expect(r).toContain("Golden Doodle");
  });

  test("is case-insensitive", () => {
    expect(filterBreeds("GOLD")).toEqual(filterBreeds("gold"));
  });

  test("is accent-insensitive", () => {
    // Query carries an accent the canonical name does not.
    expect(filterBreeds("löwchen")).toContain("Lowchen");
  });

  test("matches on a substring anywhere in the name", () => {
    expect(filterBreeds("retriever")).toContain("Labrador Retriever");
    expect(filterBreeds("retriever").length).toBeGreaterThan(1);
  });

  test("returns [] for a non-matching query", () => {
    expect(filterBreeds("zzzznotarealbreed")).toEqual([]);
  });

  test("respects the limit", () => {
    expect(filterBreeds("", 5)).toHaveLength(5);
    // A limit larger than the result set does not pad.
    expect(filterBreeds("golden retriever", 5)).toEqual(["Golden Retriever"]);
  });
});

describe("hasExactBreedMatch", () => {
  test("true for an exact canonical name (any case/spacing)", () => {
    expect(hasExactBreedMatch("Golden Retriever")).toBe(true);
    expect(hasExactBreedMatch("  golden retriever ")).toBe(true);
  });

  test("true for the pinned Mixed Breed value", () => {
    expect(hasExactBreedMatch("Mixed Breed")).toBe(true);
    expect(hasExactBreedMatch("mixed breed")).toBe(true);
  });

  test("false for a partial or off-list query (a custom 'Use' is warranted)", () => {
    expect(hasExactBreedMatch("gold")).toBe(false);
    expect(hasExactBreedMatch("Cimarron Uruguayo")).toBe(false);
    expect(hasExactBreedMatch("")).toBe(false);
  });
});
